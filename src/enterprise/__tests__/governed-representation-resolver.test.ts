import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOVERNED_RIGHT_TYPES } from '@aoc-enterprise/governed-authorization';
import type { GovernedRepresentationProviderPort, GovernedRepresentativeScopeLimit } from '@aoc-enterprise/governed-authority';

import { createInMemoryGovernedRepresentationStore } from '../authority-governance/in-memory-representation-store.js';
import { createGovernedRepresentationResolver } from '../authority-governance/representation-resolver.js';
import type { GovernedRepresentationDelegationPort } from '../authority-governance/representation-contracts.js';
import type { GovernedRepresentationStore } from '../authority-governance/representation-store.js';
import {
  ALICE,
  BOB,
  FULL_INTEREST,
  GA_ASSET,
  GA_MANAGER_ACTOR_ID,
  GA_TENANT_A,
  TENANT_CONTEXT,
  UNBOUNDED,
  buildGovernedAuthorityWorld,
  grantRepresentation,
  seedPosition,
  transferRequest,
  transferTerms,
  upTo,
} from './governed-authority-support.js';

/**
 * The representation resolver decides one thing — whether a live, holder-bound
 * binding covers what a requester is asking to do on a holder's behalf — and
 * everything it can answer is enumerated here.
 *
 * The `basis_withdrawn` half is the part that matters most architecturally:
 * neither a parent representation's withdrawal nor an Authority Graph
 * delegation's revocation is copied into a descendant record, so both have to
 * be *resolved* rather than *read*. If that resolution were missing, a revoked
 * ancestor would leave a live-looking child behind, which is the failure mode
 * a duplicated lifecycle always eventually produces.
 */

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-06-01T00:00:00.000Z';
const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;
const OWNERSHIP = GOVERNED_RIGHT_TYPES.OWNERSHIP_INTEREST;

const TENANT = 'org-a';
const ASSET = { kind: 'asset', id: 'asset-a' } as const;
const ADMIN = { system: true, actorId: 'actor-admin' } as const;

const HOLDER = 'party-alice';
const OTHER_HOLDER = 'party-bob';
const X = 'actor-x';
const Y = 'actor-y';

function bounded(basisPoints: number): GovernedRepresentativeScopeLimit {
  return { kind: 'bounded', maximum: { kind: 'proportional', basisPoints } };
}

async function bind(
  store: GovernedRepresentationStore,
  overrides: Record<string, unknown> = {},
  context: { system: boolean; organizationId?: string; actorId?: string } = ADMIN,
) {
  const { representation } = await store.grantRepresentativeAuthority(context, {
    tenantId: TENANT,
    holderRef: HOLDER,
    representativeRef: X,
    resource: ASSET,
    governedRights: [ECONOMIC],
    scopeLimit: bounded(2_000),
    actions: ['transfer'],
    effectiveFrom: NOW,
    basis: { kind: 'administrative-bootstrap', assertedBy: 'actor-admin' },
    ...overrides,
  } as never);
  return representation;
}

function ask(resolver: GovernedRepresentationProviderPort, overrides: Record<string, unknown> = {}) {
  return resolver.resolveGovernedRepresentation({
    tenantId: TENANT,
    representativeRef: X,
    holderRef: HOLDER,
    resourceKind: ASSET.kind,
    resourceId: ASSET.id,
    governedRight: ECONOMIC,
    requestedScope: { kind: 'proportional', basisPoints: 1_000 },
    action: 'transfer',
    at: NOW,
    ...overrides,
  } as never);
}

describe('Representation resolver — the closed set of answers', () => {
  it('covers a request inside the envelope, and names the binding and its chain', async () => {
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    const binding = await bind(store);
    const coverage = await ask(createGovernedRepresentationResolver(store));
    assert.equal(coverage.outcome, 'represented');
    assert.deepEqual(coverage, { outcome: 'represented', representativeAuthorityId: binding.id, chain: [binding.id] });
  });

  it('answers not_required when the requester is the holder, without consulting anything', async () => {
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    const coverage = await ask(createGovernedRepresentationResolver(store), { representativeRef: HOLDER });
    assert.deepEqual(coverage, { outcome: 'not_required' });
  });

  it('answers no_representation when nothing binds these two parties for this resource', async () => {
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    await bind(store);
    const resolver = createGovernedRepresentationResolver(store);

    assert.equal((await ask(resolver, { holderRef: OTHER_HOLDER })).outcome, 'no_representation');
    assert.equal((await ask(resolver, { representativeRef: Y })).outcome, 'no_representation');
    assert.equal((await ask(resolver, { resourceId: 'asset-b' })).outcome, 'no_representation');
    assert.equal((await ask(resolver, { tenantId: 'org-b' })).outcome, 'no_representation');
  });

  it('distinguishes a wrong right from a wrong action from an exceeded ceiling', async () => {
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    const binding = await bind(store);
    const resolver = createGovernedRepresentationResolver(store);

    assert.deepEqual(await ask(resolver, { governedRight: OWNERSHIP }), {
      outcome: 'right_not_represented',
      representativeAuthorityId: binding.id,
      governedRight: OWNERSHIP,
    });
    assert.deepEqual(await ask(resolver, { action: 'license' }), { outcome: 'action_not_represented', representativeAuthorityId: binding.id, action: 'license' });
    assert.deepEqual(await ask(resolver, { requestedScope: { kind: 'proportional', basisPoints: 2_001 } }), {
      outcome: 'scope_exceeded',
      representativeAuthorityId: binding.id,
      permitted: { kind: 'proportional', basisPoints: 2_000 },
      requested: { kind: 'proportional', basisPoints: 2_001 },
    });
  });

  it('never coerces a unit count against a proportional ceiling', async () => {
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    await bind(store);
    const coverage = await ask(createGovernedRepresentationResolver(store), { requestedScope: { kind: 'unitized', units: 1, unitDenomination: 'share' } });
    assert.equal(coverage.outcome, 'incompatible_scope');
  });

  it('covers an absent requested scope without reading absence as the whole', async () => {
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    // A ceiling of one basis point, and a request that expresses no quantity at
    // all. The permission is not a quantity, so the ceiling neither covers it
    // by arithmetic nor blocks it.
    await bind(store, { scopeLimit: bounded(1), actions: ['license'], governedRights: [USAGE] });
    const coverage = await ask(createGovernedRepresentationResolver(store), { governedRight: USAGE, action: 'license', requestedScope: undefined });
    assert.equal(coverage.outcome, 'represented');
  });

  it('reports pending and ended windows as expired, and withdrawal as revoked', async () => {
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    const resolver = createGovernedRepresentationResolver(store);

    const pending = await bind(store, { effectiveFrom: LATER, representativeRef: 'actor-pending' });
    assert.deepEqual(await ask(resolver, { representativeRef: 'actor-pending' }), { outcome: 'expired', representativeAuthorityId: pending.id });

    const ended = await bind(store, { effectiveFrom: '2025-01-01T00:00:00.000Z', expiresAt: '2025-06-01T00:00:00.000Z', representativeRef: 'actor-ended' });
    assert.deepEqual(await ask(resolver, { representativeRef: 'actor-ended' }), { outcome: 'expired', representativeAuthorityId: ended.id });

    const withdrawn = await bind(store, { representativeRef: 'actor-withdrawn' });
    await store.revokeRepresentativeAuthority(ADMIN, TENANT, withdrawn.id);
    assert.deepEqual(await ask(resolver, { representativeRef: 'actor-withdrawn' }), { outcome: 'revoked', representativeAuthorityId: withdrawn.id });
  });

  it('takes the best outcome across several bindings rather than the first', async () => {
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    // The first binding is for a different right; the second covers the
    // request. Answering from the first would report a spurious mismatch.
    await bind(store, { governedRights: [USAGE], actions: ['license'] });
    const covering = await bind(store, { governedRights: [ECONOMIC], scopeLimit: bounded(4_000) });

    const coverage = await ask(createGovernedRepresentationResolver(store), { requestedScope: { kind: 'proportional', basisPoints: 3_000 } });
    assert.deepEqual(coverage, { outcome: 'represented', representativeAuthorityId: covering.id, chain: [covering.id] });
  });

  it('reports the nearest miss when nothing covers, so a denial is actionable', async () => {
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    await bind(store, { governedRights: [USAGE], actions: ['license'] });
    const nearMiss = await bind(store, { scopeLimit: bounded(500) });

    const coverage = await ask(createGovernedRepresentationResolver(store), { requestedScope: { kind: 'proportional', basisPoints: 3_000 } });
    assert.equal(coverage.outcome, 'scope_exceeded', 'a ceiling one step short beats "you have nothing for this right"');
    assert.equal((coverage as { representativeAuthorityId: string }).representativeAuthorityId, nearMiss.id);
  });
});

describe('Representation resolver — a basis is resolved, never copied', () => {
  it('a revoked Authority Graph delegation withdraws the representation without touching the record', async () => {
    let status = 'active';
    const delegations: GovernedRepresentationDelegationPort = {
      getDelegationGrant: () => ({ delegateActorId: X, principalActorId: HOLDER, trustDomainId: 'trust-a', status }),
    };
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW, delegations });
    const binding = await bind(store, { basis: { kind: 'authority-graph-delegation', delegationGrantId: 'delegation-1', trustDomainId: 'trust-a', assertedBy: 'actor-admin' } });
    const resolver = createGovernedRepresentationResolver(store, { delegations });

    assert.equal((await ask(resolver)).outcome, 'represented');

    status = 'revoked';
    assert.deepEqual(await ask(resolver), { outcome: 'basis_withdrawn', representativeAuthorityId: binding.id, reason: 'delegation_not_live' });

    const stored = await store.getRepresentativeAuthority(ADMIN, TENANT, binding.id);
    assert.equal(stored?.revokedAt, undefined, 'the grant lifecycle stays in the Authority Graph; nothing was duplicated here');
  });

  it('a resolver with no delegation lookup refuses a delegation-grounded binding rather than trusting it', async () => {
    const delegations: GovernedRepresentationDelegationPort = {
      getDelegationGrant: () => ({ delegateActorId: X, principalActorId: HOLDER, trustDomainId: 'trust-a', status: 'active' }),
    };
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW, delegations });
    const binding = await bind(store, { basis: { kind: 'authority-graph-delegation', delegationGrantId: 'delegation-1', trustDomainId: 'trust-a', assertedBy: 'actor-admin' } });

    const blind = createGovernedRepresentationResolver(store);
    assert.deepEqual(await ask(blind), { outcome: 'basis_withdrawn', representativeAuthorityId: binding.id, reason: 'delegation_not_live' });
  });

  it('withdrawing a parent representation disables its whole subtree, with no descendant rewritten', async () => {
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    const parent = await bind(store, { scopeLimit: bounded(5_000), canRedelegate: true, expiresAt: LATER });
    const { representation: child } = await store.grantRepresentativeAuthority(
      { system: false, organizationId: TENANT, actorId: X },
      {
        tenantId: TENANT,
        representativeRef: Y,
        governedRights: [ECONOMIC],
        actions: ['transfer'],
        scopeLimit: bounded(2_000),
        effectiveFrom: NOW,
        expiresAt: LATER,
        canRedelegate: false,
        basis: { kind: 'representative-redelegation', parentRepresentativeAuthorityId: parent.id, assertedBy: X },
      } as never,
    );

    const resolver = createGovernedRepresentationResolver(store);
    assert.deepEqual(await ask(resolver, { representativeRef: Y }), { outcome: 'represented', representativeAuthorityId: child.id, chain: [child.id, parent.id] });

    await store.revokeRepresentativeAuthority(ADMIN, TENANT, parent.id);

    assert.deepEqual(await ask(resolver, { representativeRef: Y }), { outcome: 'basis_withdrawn', representativeAuthorityId: child.id, reason: 'parent_revoked' });
    const storedChild = await store.getRepresentativeAuthority(ADMIN, TENANT, child.id);
    assert.equal(storedChild?.revokedAt, undefined, 'the child record is untouched; the chain is walked, not cached');
  });

  it('a subdelegate still cannot reach a holder its parent could not', async () => {
    const store = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    const parent = await bind(store, { scopeLimit: bounded(5_000), canRedelegate: true });
    await store.grantRepresentativeAuthority(
      { system: false, organizationId: TENANT, actorId: X },
      {
        tenantId: TENANT,
        representativeRef: Y,
        governedRights: [ECONOMIC],
        actions: ['transfer'],
        scopeLimit: bounded(2_000),
        effectiveFrom: NOW,
        basis: { kind: 'representative-redelegation', parentRepresentativeAuthorityId: parent.id, assertedBy: X },
      } as never,
    );

    const resolver = createGovernedRepresentationResolver(store);
    assert.equal((await ask(resolver, { representativeRef: Y, holderRef: OTHER_HOLDER })).outcome, 'no_representation');
  });
});

describe('Representation in the Kernel — facts, and narrowing only', () => {
  /** Evaluates a transfer through the real service stack and hands back the Kernel result the Governance Store recorded. */
  async function evaluate(world: ReturnType<typeof buildGovernedAuthorityWorld>, requestId: string, holderRef: string, basisPoints: number) {
    return world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest(requestId, transferTerms(holderRef, 'party-carol', [ECONOMIC], { kind: 'proportional', basisPoints })),
    );
  }

  it('a representation store that cannot be read denies rather than passing', async () => {
    const backing = createInMemoryGovernedRepresentationStore({ now: () => NOW });
    let broken = false;
    // A store that works long enough to prove the request is otherwise fine,
    // then fails on exactly the read the enforcement path makes.
    const flaky: GovernedRepresentationStore = {
      ...backing,
      listRepresentativeAuthorities: (...args) => {
        if (broken) throw new Error('representation store unavailable');
        return backing.listRepresentativeAuthorities(...args);
      },
    };

    const world = buildGovernedAuthorityWorld({ withRepresentation: true, representationStore: flaky });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: UNBOUNDED });

    assert.equal((await evaluate(world, 'store-healthy', ALICE, 1_000)).status, 'allowed');

    broken = true;
    const outcome = await evaluate(world, 'store-broken', ALICE, 1_000);
    assert.equal(outcome.status, 'denied', 'an unreadable representation store is not a proof of representation');
  });

  it('cannot rescue an outcome the existing chain already denied', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: UNBOUNDED });

    // A resource scope the manager's grant does not cover. The existing chain
    // denies, and a perfectly valid representation changes nothing about it.
    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('out-of-scope', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 }), {
        resourceScope: 'asset:some-other-asset',
      }),
    );
    assert.equal(outcome.status, 'denied');
  });

  it('a two-right action needs representation over both rights', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await seedPosition(world, ALICE, OWNERSHIP, FULL_INTEREST);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(5_000) });

    const partial = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('two-rights-partial', transferTerms(ALICE, BOB, [ECONOMIC, OWNERSHIP], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(partial.status, 'denied', 'partial representation is not representation');

    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [OWNERSHIP], { scopeLimit: upTo(5_000) });
    const both = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('two-rights-both', transferTerms(ALICE, BOB, [ECONOMIC, OWNERSHIP], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(both.status, 'allowed');
    assert.ok(GA_ASSET.id.length > 0);
  });
});
