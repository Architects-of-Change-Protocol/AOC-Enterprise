import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DELEGATION_LINEAGE_DEPTH,
  delegationConstraintBreach,
  readDelegationLineageConstraints,
  resolveDelegationLineage,
  type DelegationLineagePorts,
} from '../authorization/delegation/delegation-lineage.js';
import type { CapabilityToken } from '@aoc/protocol';

import type { DelegatedCapability, DelegatedCapabilityPayload, ExecutionGrant } from '../context.js';

/**
 * The runtime host's delegated capabilities carry `parentDelegationId` and
 * `parentGrantId`, and until this module existed nothing read them.
 *
 * Measured before, against a fully composed `createAocEnterpriseRuntime`:
 *
 * ```
 * child broadening resource, action and scope vs its parent   issued, then allowed
 * parent delegated capability revoked, child re-evaluated     allowed
 * child naming a parentDelegationId that never existed        issued, then allowed
 * child rooted in a revoked ExecutionGrant                    allowed
 * six-hop chain with no ceiling                               issued
 * ```
 *
 * The walk below is what those five now go through, at issuance *and* at every
 * evaluation. The second is the one that matters: this runtime's stores are
 * host-supplied ports, so a restore, a migration or a second writer can put a
 * record in front of `evaluateDelegatedAccess` that never passed issuance.
 */

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-06-01T00:00:00.000Z';
const MUCH_LATER = '2027-01-01T00:00:00.000Z';
const ORG = 'org-atlas';

/** A structurally valid Protocol capability token. Nothing in a lineage walk reads it -- it is carried, not compared -- but the payload type requires a real one. */
function token(tokenId: string): CapabilityToken {
  return {
    schemaVersion: '1.0.0',
    tokenId,
    issuer: 'issuer-atlas',
    subject: `actor-${tokenId}`,
    resource: { kind: 'asset', id: 'a' },
    scope: ['asset:read', 'asset:write'],
    expiresAt: MUCH_LATER,
    proof: { proofType: 'detached-signature', issuedAt: NOW },
  };
}

interface Stores extends DelegationLineagePorts {
  put(payload: DelegatedCapabilityPayload): DelegatedCapabilityPayload;
  putGrant(grantId: string, orgId: string, expiresAt?: string): void;
  revoke(id: string): void;
  revokeGrant(id: string): void;
}

function stores(): Stores {
  const delegations = new Map<string, DelegatedCapability>();
  const grants = new Map<string, ExecutionGrant>();
  const revokedDelegations = new Set<string>();
  const revokedGrants = new Set<string>();
  return {
    put(payload) {
      delegations.set(payload.delegationId, {
        payload,
        signature: 'sig',
        issuedAt: payload.issuedAt,
        metadata: { runtimeId: 'r', trustDomain: 'd', environment: 'test', version: '1' },
        signer: { signerId: 's', keyId: 'k', algorithm: 'mock', issuedBy: 't', trustAnchorVersion: 'v' },
      });
      return payload;
    },
    putGrant(grantId, orgId, expiresAt) {
      grants.set(grantId, {
        payload: {
          grantId,
          input: {
            requestId: 'rq',
            actorId: 'actor',
            capability: token('cap-grant'),
            consentGrants: [],
            access: { principalId: 'actor', action: 'TRANSFER', resource: { kind: 'asset', id: 'a' }, requestedScope: ['asset:write'], requestedAt: NOW },
            tenantId: 'tenant',
            orgId,
          },
          issuedAt: NOW,
          issuer: { runtimeId: 'r', trustDomain: 'd', environment: 'test', version: '1' },
          subject: { actorId: 'actor', orgId, tenantId: 'tenant' },
          nonce: 'n',
          ...(expiresAt !== undefined ? { expiresAt } : {}),
        },
        signature: 'sig',
        issuedAt: NOW,
        metadata: { runtimeId: 'r', trustDomain: 'd', environment: 'test', version: '1' },
        signer: { signerId: 's', keyId: 'k', algorithm: 'mock', issuedBy: 't', trustAnchorVersion: 'v' },
      });
    },
    revoke(id) {
      revokedDelegations.add(id);
    },
    revokeGrant(id) {
      revokedGrants.add(id);
    },
    getDelegation: (id) => Promise.resolve(delegations.get(id)),
    isDelegationRevoked: (id) => Promise.resolve(revokedDelegations.has(id)),
    getExecutionGrant: (id) => Promise.resolve(grants.get(id)),
    isExecutionGrantRevoked: (id) => Promise.resolve(revokedGrants.has(id)),
  };
}

function capability(overrides: Partial<DelegatedCapabilityPayload> & { readonly delegationId: string }): DelegatedCapabilityPayload {
  return {
    actorId: `actor-${overrides.delegationId}`,
    capability: token(`cap-${overrides.delegationId}`),
    orgId: ORG,
    issuedAt: NOW,
    expiresAt: MUCH_LATER,
    nonce: `nonce-${overrides.delegationId}`,
    constraints: { scope: ['asset:read', 'asset:write'], resource: 'asset:a', action: 'TRANSFER' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Reading the constraint bag.
// ---------------------------------------------------------------------------

describe('Delegated capability constraints — reading the open bag', () => {
  it('1. reads the lineage-bearing keys and ignores everything else', () => {
    const read = readDelegationLineageConstraints({
      scope: ['a', 'b'],
      resource: 'asset:a',
      action: 'TRANSFER',
      maxDelegationDepth: 2,
      canRedelegate: false,
      jurisdiction: 'CR',
    });
    assert.deepEqual(read, { scope: ['a', 'b'], resource: 'asset:a', action: 'TRANSFER', maxDelegationDepth: 2, canRedelegate: false });
  });

  it('2. a key present with the wrong type is treated as absent rather than coerced', () => {
    assert.deepEqual(readDelegationLineageConstraints({ scope: 42, resource: [], maxDelegationDepth: 'two' }), {});
  });

  it('3. an absent constraint bounds nothing, so a child that names one is narrower', () => {
    const breach = delegationConstraintBreach(
      { orgId: ORG, ref: 'parent', constraints: {} },
      { orgId: ORG, constraints: { resource: 'asset:a', action: 'TRANSFER', scope: ['asset:read'] } },
    );
    assert.equal(breach, null);
  });
});

// ---------------------------------------------------------------------------
// 2. Containment, one axis at a time.
// ---------------------------------------------------------------------------

describe('Delegated capability containment — a child may narrow and never broaden', () => {
  const parent = { orgId: ORG, ref: 'parent', expiresAt: LATER, constraints: readDelegationLineageConstraints({ scope: ['asset:read', 'asset:write'], resource: 'asset:a', action: 'TRANSFER' }) };

  it('4. an equal child is contained', () => {
    assert.equal(delegationConstraintBreach(parent, { orgId: ORG, expiresAt: LATER, constraints: parent.constraints }), null);
  });

  it('5. a narrower child is contained', () => {
    const breach = delegationConstraintBreach(parent, { orgId: ORG, expiresAt: NOW, constraints: { scope: ['asset:read'], resource: 'asset:a', action: 'TRANSFER' } });
    assert.equal(breach, null);
  });

  it('6. resource: naming a different resource is refused', () => {
    const breach = delegationConstraintBreach(parent, { orgId: ORG, expiresAt: LATER, constraints: { ...parent.constraints, resource: 'asset:b' } });
    assert.equal(breach?.kind, 'resource_expanded');
  });

  it('7. resource: dropping the constraint entirely is refused', () => {
    const breach = delegationConstraintBreach(parent, { orgId: ORG, expiresAt: LATER, constraints: { scope: ['asset:read'], action: 'TRANSFER' } });
    assert.equal(breach?.kind, 'resource_expanded');
  });

  it('8. action: naming a different action is refused', () => {
    const breach = delegationConstraintBreach(parent, { orgId: ORG, expiresAt: LATER, constraints: { ...parent.constraints, action: 'LICENSE' } });
    assert.equal(breach?.kind, 'action_expanded');
  });

  it('9. scope: a scope the parent does not hold is refused', () => {
    const breach = delegationConstraintBreach(parent, { orgId: ORG, expiresAt: LATER, constraints: { ...parent.constraints, scope: ['asset:read', 'asset:admin'] } });
    assert.equal(breach?.kind, 'scope_expanded');
  });

  it('10. validity: outliving the parent is refused, and so is being open-ended under a bounded parent', () => {
    assert.equal(delegationConstraintBreach(parent, { orgId: ORG, expiresAt: MUCH_LATER, constraints: parent.constraints })?.kind, 'validity_expanded');
    assert.equal(delegationConstraintBreach(parent, { orgId: ORG, constraints: parent.constraints })?.kind, 'validity_expanded');
  });

  it('11. tenant: a child in another organization is refused before every other axis', () => {
    const breach = delegationConstraintBreach(parent, { orgId: 'org-other', expiresAt: LATER, constraints: parent.constraints });
    assert.equal(breach?.kind, 'tenant_expanded');
  });

  it('12. redelegation: a parent that forbids it admits no child at all', () => {
    const terminal = { orgId: ORG, ref: 'terminal', constraints: readDelegationLineageConstraints({ canRedelegate: false }) };
    assert.equal(delegationConstraintBreach(terminal, { orgId: ORG, constraints: {} })?.kind, 'parent_not_redelegable');
  });

  it('13. depth: a child cannot raise the ceiling its parent set', () => {
    const bounded = { orgId: ORG, ref: 'bounded', constraints: readDelegationLineageConstraints({ maxDelegationDepth: 2 }) };
    assert.equal(delegationConstraintBreach(bounded, { orgId: ORG, constraints: { maxDelegationDepth: 10 } })?.kind, 'depth_exceeded');
    assert.equal(delegationConstraintBreach(bounded, { orgId: ORG, constraints: { maxDelegationDepth: 1 } }), null);
  });
});

// ---------------------------------------------------------------------------
// 3. Walking the lineage against live stores.
// ---------------------------------------------------------------------------

describe('Delegated capability lineage — walked against current store state', () => {
  it('14. a capability claiming no parent is a root, and behaves as it always did', async () => {
    const store = stores();
    const root = capability({ delegationId: 'root' });
    const result = await resolveDelegationLineage(root, store, NOW);
    assert.deepEqual(result, { valid: true, depth: 0, chainRefs: [], breach: null });
  });

  it('15. a two-hop chain resolves, naming every ancestor it walked', async () => {
    const store = stores();
    store.put(capability({ delegationId: 'p' }));
    store.put(capability({ delegationId: 'c', parentDelegationId: 'p', constraints: { scope: ['asset:read'], resource: 'asset:a', action: 'TRANSFER' } }));
    const grandchild = capability({ delegationId: 'g', parentDelegationId: 'c', constraints: { scope: ['asset:read'], resource: 'asset:a', action: 'TRANSFER' } });

    const result = await resolveDelegationLineage(grandchild, store, NOW);
    assert.equal(result.valid, true);
    assert.equal(result.depth, 2);
    assert.deepEqual(result.chainRefs, ['c', 'p']);
  });

  it('16. revoking an ancestor disables its descendant, with no descendant rewritten', async () => {
    const store = stores();
    store.put(capability({ delegationId: 'p' }));
    store.put(capability({ delegationId: 'c', parentDelegationId: 'p' }));
    const grandchild = capability({ delegationId: 'g', parentDelegationId: 'c' });
    assert.equal((await resolveDelegationLineage(grandchild, store, NOW)).valid, true);

    store.revoke('p');

    const result = await resolveDelegationLineage(grandchild, store, NOW);
    assert.equal(result.valid, false);
    assert.equal(result.breach?.kind, 'parent_revoked');
  });

  it('17. an ancestor that has expired disables its descendant', async () => {
    const store = stores();
    store.put(capability({ delegationId: 'p', expiresAt: LATER }));
    const child = capability({ delegationId: 'c', parentDelegationId: 'p', expiresAt: LATER });

    assert.equal((await resolveDelegationLineage(child, store, NOW)).valid, true);
    const result = await resolveDelegationLineage(child, store, MUCH_LATER);
    assert.equal(result.valid, false);
    assert.equal(result.breach?.kind, 'parent_expired');
  });

  it('18. a parent that was never issued is a breach, never an absent constraint', async () => {
    const store = stores();
    const orphan = capability({ delegationId: 'orphan', parentDelegationId: 'never-existed' });
    const result = await resolveDelegationLineage(orphan, store, NOW);
    assert.equal(result.valid, false);
    assert.equal(result.breach?.kind, 'parent_unknown');
  });

  it('19. a cycle is refused rather than walked', async () => {
    const store = stores();
    store.put(capability({ delegationId: 'p', parentDelegationId: 'c' }));
    store.put(capability({ delegationId: 'c', parentDelegationId: 'p' }));

    const result = await resolveDelegationLineage(capability({ delegationId: 'c', parentDelegationId: 'p' }), store, NOW);
    assert.equal(result.valid, false);
    assert.equal(result.breach?.kind, 'cycle');
  });

  it('20. a chain deeper than the default ceiling is refused', async () => {
    const store = stores();
    store.put(capability({ delegationId: 'hop-0' }));
    for (let i = 1; i <= MAX_DELEGATION_LINEAGE_DEPTH + 2; i += 1) {
      store.put(capability({ delegationId: `hop-${i}`, parentDelegationId: `hop-${i - 1}` }));
    }
    const deepest = capability({ delegationId: `hop-${MAX_DELEGATION_LINEAGE_DEPTH + 2}`, parentDelegationId: `hop-${MAX_DELEGATION_LINEAGE_DEPTH + 1}` });

    const result = await resolveDelegationLineage(deepest, store, NOW);
    assert.equal(result.valid, false);
    assert.equal(result.breach?.kind, 'depth_exceeded');
  });

  it('21. a chain rooted in a live execution grant resolves, and stops there', async () => {
    const store = stores();
    store.putGrant('grant-1', ORG, MUCH_LATER);
    // Within the grant's own authorized access: TRANSFER on asset:a for
    // [asset:write]. The grant is an envelope like any other parent.
    const child = capability({ delegationId: 'c', parentGrantId: 'grant-1', constraints: { scope: ['asset:write'], resource: 'asset:a', action: 'TRANSFER' } });

    const result = await resolveDelegationLineage(child, store, NOW);
    assert.equal(result.valid, true);
    assert.deepEqual(result.chainRefs, ['grant-1']);
  });

  it('21b. a child cannot broaden the execution grant it is carved out of', async () => {
    // The grant authorizes TRANSFER on asset:a for [asset:write]. Before this,
    // the grant was checked for existence, revocation, expiry and organization
    // and then declared a valid root, so each of these passed.
    const store = stores();
    store.putGrant('grant-1', ORG, MUCH_LATER);

    const widerResource = await resolveDelegationLineage(
      capability({ delegationId: 'r', parentGrantId: 'grant-1', constraints: { scope: ['asset:write'], resource: 'asset:b', action: 'TRANSFER' } }),
      store,
      NOW,
    );
    assert.equal(widerResource.breach?.kind, 'resource_expanded');

    const widerAction = await resolveDelegationLineage(
      capability({ delegationId: 'a', parentGrantId: 'grant-1', constraints: { scope: ['asset:write'], resource: 'asset:a', action: 'LICENSE' } }),
      store,
      NOW,
    );
    assert.equal(widerAction.breach?.kind, 'action_expanded');

    const widerScope = await resolveDelegationLineage(
      capability({ delegationId: 's', parentGrantId: 'grant-1', constraints: { scope: ['asset:write', 'asset:admin'], resource: 'asset:a', action: 'TRANSFER' } }),
      store,
      NOW,
    );
    assert.equal(widerScope.breach?.kind, 'scope_expanded');

    const noConstraints = await resolveDelegationLineage(
      capability({ delegationId: 'n', parentGrantId: 'grant-1', constraints: {} }),
      store,
      NOW,
    );
    assert.equal(noConstraints.breach?.kind, 'resource_expanded', 'dropping an inherited constraint is a widening, not an inheritance');
  });

  it('21c. a child cannot outlive the execution grant it is carved out of', async () => {
    const store = stores();
    store.putGrant('grant-1', ORG, LATER);
    const result = await resolveDelegationLineage(
      capability({ delegationId: 'c', parentGrantId: 'grant-1', expiresAt: MUCH_LATER, constraints: { scope: ['asset:write'], resource: 'asset:a', action: 'TRANSFER' } }),
      store,
      NOW,
    );
    assert.equal(result.breach?.kind, 'validity_expanded');
  });

  it('22. a chain rooted in a revoked execution grant is refused', async () => {
    const store = stores();
    store.putGrant('grant-1', ORG, MUCH_LATER);
    store.revokeGrant('grant-1');
    const result = await resolveDelegationLineage(capability({ delegationId: 'c', parentGrantId: 'grant-1', constraints: { scope: ['asset:write'], resource: 'asset:a', action: 'TRANSFER' } }), store, NOW);
    assert.equal(result.valid, false);
    assert.equal(result.breach?.kind, 'parent_revoked');
  });

  it('23. a chain rooted in an execution grant belonging to another organization is refused', async () => {
    const store = stores();
    store.putGrant('grant-1', 'org-other', MUCH_LATER);
    const result = await resolveDelegationLineage(capability({ delegationId: 'c', parentGrantId: 'grant-1', constraints: { scope: ['asset:write'], resource: 'asset:a', action: 'TRANSFER' } }), store, NOW);
    assert.equal(result.valid, false);
    assert.equal(result.breach?.kind, 'tenant_expanded');
  });

  it('24. an intermediate hop that broadens is caught even when the leaf is well behaved', async () => {
    const store = stores();
    store.put(capability({ delegationId: 'p', constraints: { scope: ['asset:read'], resource: 'asset:a', action: 'LICENSE' } }));
    // The middle hop switched the action. The leaf below it looks identical to
    // its own parent, so only a full walk finds the expansion.
    store.put(capability({ delegationId: 'm', parentDelegationId: 'p', constraints: { scope: ['asset:read'], resource: 'asset:a', action: 'TRANSFER' } }));
    const leaf = capability({ delegationId: 'l', parentDelegationId: 'm', constraints: { scope: ['asset:read'], resource: 'asset:a', action: 'TRANSFER' } });

    const result = await resolveDelegationLineage(leaf, store, NOW);
    assert.equal(result.valid, false);
    assert.equal(result.breach?.kind, 'action_expanded');
  });
});
