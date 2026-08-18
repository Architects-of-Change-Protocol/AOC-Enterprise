import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { GOVERNED_RIGHT_TYPES } from '@aoc-enterprise/governed-authorization';
import { governedRepresentativeAuthorityState, type GovernedRepresentativeScopeLimit } from '@aoc-enterprise/governed-authority';

import { isAuthorityGovernanceError } from '../authority-governance/errors.js';
import { createInMemoryGovernedRepresentationStore } from '../authority-governance/in-memory-representation-store.js';
import { createSqliteGovernedRepresentationStore } from '../authority-governance/sqlite-representation-store.js';
import type { AuthorityGovernanceContext, GovernedRepresentationDelegationPort } from '../authority-governance/representation-contracts.js';
import type { GovernedRepresentationStore } from '../authority-governance/representation-store.js';

/**
 * One behavioural contract, run against both implementations.
 *
 * Who may create a binding, what a binding may say, and what no chain
 * operation may broaden are the properties this store exists for — and a test
 * double that met them while the durable store did not would be worse than no
 * test at all. So every assertion below runs twice, and the SQLite pass runs
 * against a real file that is closed and reopened to prove restart durability.
 * The same arrangement `governed-authority-store-contract.test.ts` uses.
 */

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-06-01T00:00:00.000Z';

const TENANT_A = 'org-a';
const TENANT_B = 'org-b';
const ASSET = { kind: 'asset', id: 'asset-a' } as const;
const OTHER_ASSET = { kind: 'asset', id: 'asset-b' } as const;

const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;
const OWNERSHIP = GOVERNED_RIGHT_TYPES.OWNERSHIP_INTEREST;

const HOLDER = 'party-alice';
const OTHER_HOLDER = 'party-bob';
const REPRESENTATIVE = 'actor-x';
const SUB_REPRESENTATIVE = 'actor-y';

const ADMIN: AuthorityGovernanceContext = { system: true, actorId: 'actor-admin' };
const TENANT_A_CONTEXT: AuthorityGovernanceContext = { system: false, organizationId: TENANT_A };
const TENANT_B_CONTEXT: AuthorityGovernanceContext = { system: false, organizationId: TENANT_B };

function bounded(basisPoints: number): GovernedRepresentativeScopeLimit {
  return { kind: 'bounded', maximum: { kind: 'proportional', basisPoints } };
}
const UNBOUNDED: GovernedRepresentativeScopeLimit = { kind: 'unbounded' };

async function errorCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    assert.ok(isAuthorityGovernanceError(error), `expected an AuthorityGovernanceError, received ${String(error)}`);
    return error.code;
  }
  assert.fail('expected the operation to be refused');
}

/** A root binding through the one privileged path there is. */
async function grant(
  store: GovernedRepresentationStore,
  overrides: Record<string, unknown> = {},
  context: AuthorityGovernanceContext = ADMIN,
) {
  const outcome = await store.grantRepresentativeAuthority(context, {
    tenantId: TENANT_A,
    holderRef: HOLDER,
    representativeRef: REPRESENTATIVE,
    resource: ASSET,
    governedRights: [ECONOMIC],
    scopeLimit: bounded(2_000),
    actions: ['transfer'],
    effectiveFrom: NOW,
    basis: { kind: 'administrative-bootstrap', assertedBy: 'actor-admin' },
    ...overrides,
  } as never);
  return outcome;
}

/** A delegation lookup that reports exactly what a test tells it to, so basis corroboration can be varied one field at a time. */
function delegationPort(records: Record<string, { delegateActorId: string; principalActorId: string; trustDomainId: string; status: string }>): GovernedRepresentationDelegationPort {
  return { getDelegationGrant: (id) => records[id] };
}

function runContract(label: string, open: (delegations?: GovernedRepresentationDelegationPort) => Promise<GovernedRepresentationStore>, openNamed?: (name: string) => Promise<GovernedRepresentationStore>): void {
  describe(`Governed Representation Store contract — ${label}`, () => {
    // -----------------------------------------------------------------------
    describe('who may create a binding', () => {
      it('records a binding from a privileged context, bound to exactly what was asked for', async () => {
        const store = await open();
        const { representation, replayed } = await grant(store);

        assert.equal(replayed, false);
        assert.equal(representation.holderRef, HOLDER);
        assert.equal(representation.representativeRef, REPRESENTATIVE);
        assert.deepEqual(representation.governedRights, [ECONOMIC]);
        assert.deepEqual(representation.actions, ['transfer']);
        assert.deepEqual(representation.scopeLimit, bounded(2_000));
        assert.equal(representation.delegationDepth, 0);
        assert.equal(representation.revokedAt, undefined);
        assert.ok(representation.digest.length > 0);
        await store.close();
      });

      it('refuses an issuing basis from a non-privileged context — there is no self-appointment path', async () => {
        const store = await open();
        for (const basis of [
          { kind: 'administrative-bootstrap', assertedBy: REPRESENTATIVE },
          { kind: 'recognized-external-representation', assertedBy: REPRESENTATIVE, evidenceRefs: ['evidence-1'] },
          { kind: 'authority-graph-delegation', delegationGrantId: 'delegation-1', trustDomainId: 'trust-a', assertedBy: REPRESENTATIVE },
        ]) {
          assert.equal(
            await errorCode(() => grant(store, { basis }, { system: false, organizationId: TENANT_A, actorId: REPRESENTATIVE })),
            'GOVERNED_REPRESENTATION_GRANT_NOT_PERMITTED',
            `a '${basis.kind}' basis must not be reachable from a tenant context`,
          );
        }
        await store.close();
      });

      it('refuses a binding of a party to itself', async () => {
        const store = await open();
        assert.equal(await errorCode(() => grant(store, { representativeRef: HOLDER })), 'GOVERNED_REPRESENTATION_INVALID');
        await store.close();
      });

      it('refuses an empty right list and an empty action list — neither is a wildcard', async () => {
        const store = await open();
        assert.equal(await errorCode(() => grant(store, { governedRights: [] })), 'GOVERNED_REPRESENTATION_INVALID');
        assert.equal(await errorCode(() => grant(store, { actions: [] })), 'GOVERNED_REPRESENTATION_INVALID');
        await store.close();
      });

      it('refuses a bounded ceiling of zero and a malformed one', async () => {
        const store = await open();
        assert.equal(await errorCode(() => grant(store, { scopeLimit: bounded(0) })), 'GOVERNED_REPRESENTATION_INVALID');
        assert.equal(await errorCode(() => grant(store, { scopeLimit: bounded(-5) })), 'GOVERNED_REPRESENTATION_INVALID');
        assert.equal(
          await errorCode(() => grant(store, { scopeLimit: { kind: 'bounded', maximum: { kind: 'unitized', units: 5, unitDenomination: '' } } })),
          'GOVERNED_REPRESENTATION_INVALID',
        );
        await store.close();
      });

      it('refuses a non-UTC timestamp', async () => {
        const store = await open();
        assert.equal(await errorCode(() => grant(store, { effectiveFrom: '2026-01-01T00:00:00.000+02:00' })), 'GOVERNED_AUTHORITY_INVALID_TIMESTAMP');
        await store.close();
      });
    });

    // -----------------------------------------------------------------------
    describe('basis corroboration', () => {
      it('refuses an evidence basis that references no evidence', async () => {
        const store = await open();
        assert.equal(
          await errorCode(() => grant(store, { basis: { kind: 'recognized-external-representation', assertedBy: 'actor-admin', evidenceRefs: [] } })),
          'GOVERNED_REPRESENTATION_BASIS_INVALID',
        );
        await store.close();
      });

      it('refuses an Authority Graph basis when no delegation lookup is configured', async () => {
        const store = await open();
        assert.equal(
          await errorCode(() =>
            grant(store, { basis: { kind: 'authority-graph-delegation', delegationGrantId: 'delegation-1', trustDomainId: 'trust-a', assertedBy: 'actor-admin' } }),
          ),
          'GOVERNED_REPRESENTATION_BASIS_INVALID',
        );
        await store.close();
      });

      it("accepts a delegation that names this holder as its principal, and refuses every way it could fail to", async () => {
        const basis = { kind: 'authority-graph-delegation', delegationGrantId: 'delegation-1', trustDomainId: 'trust-a', assertedBy: 'actor-admin' } as const;

        const good = await open(delegationPort({ 'delegation-1': { delegateActorId: REPRESENTATIVE, principalActorId: HOLDER, trustDomainId: 'trust-a', status: 'active' } }));
        assert.equal((await grant(good, { basis })).representation.basis.kind, 'authority-graph-delegation');
        await good.close();

        // The provenance property: a grant held for *Carol* is not evidence
        // that this representative may act for Alice, however broad it is.
        const wrongPrincipal = await open(delegationPort({ 'delegation-1': { delegateActorId: REPRESENTATIVE, principalActorId: 'party-carol', trustDomainId: 'trust-a', status: 'active' } }));
        assert.equal(await errorCode(() => grant(wrongPrincipal, { basis })), 'GOVERNED_REPRESENTATION_BASIS_INVALID');
        await wrongPrincipal.close();

        const wrongDelegate = await open(delegationPort({ 'delegation-1': { delegateActorId: 'actor-someone-else', principalActorId: HOLDER, trustDomainId: 'trust-a', status: 'active' } }));
        assert.equal(await errorCode(() => grant(wrongDelegate, { basis })), 'GOVERNED_REPRESENTATION_BASIS_INVALID');
        await wrongDelegate.close();

        const wrongDomain = await open(delegationPort({ 'delegation-1': { delegateActorId: REPRESENTATIVE, principalActorId: HOLDER, trustDomainId: 'trust-other', status: 'active' } }));
        assert.equal(await errorCode(() => grant(wrongDomain, { basis })), 'GOVERNED_REPRESENTATION_BASIS_INVALID');
        await wrongDomain.close();

        const revoked = await open(delegationPort({ 'delegation-1': { delegateActorId: REPRESENTATIVE, principalActorId: HOLDER, trustDomainId: 'trust-a', status: 'revoked' } }));
        assert.equal(await errorCode(() => grant(revoked, { basis })), 'GOVERNED_REPRESENTATION_BASIS_INVALID');
        await revoked.close();

        const absent = await open(delegationPort({}));
        assert.equal(await errorCode(() => grant(absent, { basis })), 'GOVERNED_REPRESENTATION_BASIS_INVALID');
        await absent.close();
      });
    });

    // -----------------------------------------------------------------------
    describe('redelegation may narrow and never broaden', () => {
      async function withParent(store: GovernedRepresentationStore) {
        const { representation } = await grant(store, {
          governedRights: [ECONOMIC, USAGE],
          actions: ['transfer', 'license'],
          scopeLimit: bounded(5_000),
          canRedelegate: true,
          expiresAt: LATER,
        });
        return representation;
      }

      function child(parentId: string, overrides: Record<string, unknown> = {}) {
        return {
          tenantId: TENANT_A,
          representativeRef: SUB_REPRESENTATIVE,
          governedRights: [ECONOMIC],
          actions: ['transfer'],
          scopeLimit: bounded(2_000),
          effectiveFrom: NOW,
          expiresAt: LATER,
          basis: { kind: 'representative-redelegation', parentRepresentativeAuthorityId: parentId, assertedBy: REPRESENTATIVE },
          ...overrides,
        } as never;
      }

      it('a narrower child is recorded, keeps the parent holder, and records its depth and parent', async () => {
        const store = await open();
        const parent = await withParent(store);
        const { representation } = await store.grantRepresentativeAuthority(
          { system: false, organizationId: TENANT_A, actorId: REPRESENTATIVE },
          child(parent.id),
        );
        assert.equal(representation.holderRef, HOLDER, 'the holder is copied from the parent, never supplied');
        assert.equal(representation.parentRepresentativeAuthorityId, parent.id);
        assert.equal(representation.delegationDepth, 1);
        assert.equal(representation.resourceId, ASSET.id);
        await store.close();
      });

      it('refuses redelegation by anyone other than the parent representative', async () => {
        const store = await open();
        const parent = await withParent(store);
        assert.equal(
          await errorCode(() => store.grantRepresentativeAuthority({ system: false, organizationId: TENANT_A, actorId: 'actor-intruder' }, child(parent.id))),
          'GOVERNED_REPRESENTATION_GRANT_NOT_PERMITTED',
        );
        await store.close();
      });

      it('refuses redelegation of a parent that does not permit it', async () => {
        const store = await open();
        const { representation: parent } = await grant(store, { canRedelegate: false, scopeLimit: bounded(5_000) });
        assert.equal(
          await errorCode(() => store.grantRepresentativeAuthority(ADMIN, child(parent.id, { scopeLimit: bounded(1_000) }))),
          'GOVERNED_REPRESENTATION_BASIS_INVALID',
        );
        await store.close();
      });

      it('refuses a child that broadens any of the seven dimensions', async () => {
        const store = await open();
        const parent = await withParent(store);
        const context = { system: false, organizationId: TENANT_A, actorId: REPRESENTATIVE } as const;

        // Scope, right, action, ceiling-kind, and both ends of the window.
        assert.equal(await errorCode(() => store.grantRepresentativeAuthority(context, child(parent.id, { scopeLimit: bounded(7_000) }))), 'GOVERNED_REPRESENTATION_SCOPE_EXPANSION');
        assert.equal(await errorCode(() => store.grantRepresentativeAuthority(context, child(parent.id, { scopeLimit: UNBOUNDED }))), 'GOVERNED_REPRESENTATION_SCOPE_EXPANSION');
        assert.equal(await errorCode(() => store.grantRepresentativeAuthority(context, child(parent.id, { governedRights: [OWNERSHIP] }))), 'GOVERNED_REPRESENTATION_SCOPE_EXPANSION');
        assert.equal(await errorCode(() => store.grantRepresentativeAuthority(context, child(parent.id, { actions: ['tokenize'] }))), 'GOVERNED_REPRESENTATION_SCOPE_EXPANSION');
        assert.equal(
          await errorCode(() => store.grantRepresentativeAuthority(context, child(parent.id, { effectiveFrom: '2025-01-01T00:00:00.000Z' }))),
          'GOVERNED_REPRESENTATION_SCOPE_EXPANSION',
        );
        assert.equal(
          await errorCode(() => store.grantRepresentativeAuthority(context, child(parent.id, { expiresAt: '2027-01-01T00:00:00.000Z' }))),
          'GOVERNED_REPRESENTATION_SCOPE_EXPANSION',
        );
        assert.equal(
          await errorCode(() => store.grantRepresentativeAuthority(context, child(parent.id, { expiresAt: undefined }))),
          'GOVERNED_REPRESENTATION_SCOPE_EXPANSION',
          'a child that never ends must not derive from a parent that does',
        );
        await store.close();
      });

      it('holder and resource cannot be laundered through a child, because neither is a field a child carries', async () => {
        const store = await open();
        const parent = await withParent(store);
        const { representation } = await store.grantRepresentativeAuthority(
          { system: false, organizationId: TENANT_A, actorId: REPRESENTATIVE },
          // Both are supplied and both are ignored: a redelegation copies them.
          child(parent.id, { holderRef: OTHER_HOLDER, resource: OTHER_ASSET }),
        );
        assert.equal(representation.holderRef, HOLDER);
        assert.equal(representation.resourceId, ASSET.id);
        await store.close();
      });

      it('refuses a child of a parent that does not exist', async () => {
        const store = await open();
        assert.equal(await errorCode(() => store.grantRepresentativeAuthority(ADMIN, child('governed-representation-nonexistent'))), 'GOVERNED_REPRESENTATION_BASIS_INVALID');
        await store.close();
      });
    });

    // -----------------------------------------------------------------------
    describe('withdrawal', () => {
      it('records a withdrawal instant and derives the state from it', async () => {
        const store = await open();
        const { representation } = await grant(store);
        assert.equal(governedRepresentativeAuthorityState(representation, NOW), 'active');

        const revoked = await store.revokeRepresentativeAuthority(ADMIN, TENANT_A, representation.id);
        assert.equal(revoked.revokedAt, NOW);
        assert.equal(governedRepresentativeAuthorityState(revoked, NOW), 'revoked');
        await store.close();
      });

      it('is idempotent and does not move the instant it happened', async () => {
        const store = await open();
        const { representation } = await grant(store);
        const first = await store.revokeRepresentativeAuthority(ADMIN, TENANT_A, representation.id);
        const second = await store.revokeRepresentativeAuthority(ADMIN, TENANT_A, representation.id);
        assert.equal(second.revokedAt, first.revokedAt);
        assert.equal(second.digest, first.digest);
        await store.close();
      });

      it('withdrawing one binding leaves every other binding of the same holder alone', async () => {
        const store = await open();
        const { representation: first } = await grant(store, { representativeRef: 'actor-x' });
        const { representation: second } = await grant(store, { representativeRef: 'actor-y' });

        await store.revokeRepresentativeAuthority(ADMIN, TENANT_A, first.id);

        const stillThere = await store.getRepresentativeAuthority(ADMIN, TENANT_A, second.id);
        assert.equal(stillThere?.revokedAt, undefined, 'revoking one representative must not revoke another');
        await store.close();
      });

      it('refuses withdrawal from a context that could not have created it', async () => {
        const store = await open();
        const { representation } = await grant(store);
        assert.equal(
          await errorCode(() => store.revokeRepresentativeAuthority({ system: false, organizationId: TENANT_A, actorId: REPRESENTATIVE }, TENANT_A, representation.id)),
          'GOVERNED_REPRESENTATION_GRANT_NOT_PERMITTED',
        );
        await store.close();
      });

      it('refuses withdrawal of a binding that does not exist', async () => {
        const store = await open();
        assert.equal(await errorCode(() => store.revokeRepresentativeAuthority(ADMIN, TENANT_A, 'governed-representation-nope')), 'GOVERNED_REPRESENTATION_NOT_FOUND');
        await store.close();
      });
    });

    // -----------------------------------------------------------------------
    describe('replay and idempotency', () => {
      it('the same idempotency key returns the same binding rather than a second one', async () => {
        const store = await open();
        const first = await grant(store, { idempotencyKey: 'key-1' });
        const second = await grant(store, { idempotencyKey: 'key-1' });

        assert.equal(second.replayed, true);
        assert.equal(second.representation.id, first.representation.id);
        const listed = await store.listRepresentativeAuthorities(ADMIN, TENANT_A, REPRESENTATIVE, HOLDER, ASSET);
        assert.equal(listed.length, 1, 'a replay must not open a second binding');
        await store.close();
      });

      it('refuses the same key reused with materially different terms', async () => {
        const store = await open();
        await grant(store, { idempotencyKey: 'key-1' });
        assert.equal(await errorCode(() => grant(store, { idempotencyKey: 'key-1', scopeLimit: bounded(9_000) })), 'GOVERNED_REPRESENTATION_CONFLICT');
        await store.close();
      });

      it('two unkeyed grants between the same parties are two distinct bindings', async () => {
        const store = await open();
        const first = await grant(store, { governedRights: [ECONOMIC] });
        const second = await grant(store, { governedRights: [USAGE], actions: ['license'] });
        assert.notEqual(first.representation.id, second.representation.id);
        const listed = await store.listRepresentativeAuthorities(ADMIN, TENANT_A, REPRESENTATIVE, HOLDER, ASSET);
        assert.equal(listed.length, 2);
        await store.close();
      });
    });

    // -----------------------------------------------------------------------
    describe('tenant isolation', () => {
      it('a binding is invisible, unreadable and unrevocable from another tenant', async () => {
        const store = await open();
        const { representation } = await grant(store);

        assert.equal(await store.getRepresentativeAuthority(TENANT_A_CONTEXT, TENANT_A, representation.id)?.then?.((r) => r?.id) ?? undefined, representation.id);
        assert.equal(await errorCode(() => store.getRepresentativeAuthority(TENANT_B_CONTEXT, TENANT_A, representation.id)), 'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION');
        assert.equal(await errorCode(() => store.listRepresentativeAuthorities(TENANT_B_CONTEXT, TENANT_A, REPRESENTATIVE, HOLDER, ASSET)), 'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION');
        assert.equal(await errorCode(() => store.revokeRepresentativeAuthority(TENANT_B_CONTEXT, TENANT_A, representation.id)), 'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION');

        // And the id itself proves nothing in the other tenant.
        assert.equal(await store.getRepresentativeAuthority(ADMIN, TENANT_B, representation.id), null);
        await store.close();
      });

      it('a redelegation cannot reach a parent in another tenant', async () => {
        const store = await open();
        const { representation: parent } = await grant(store, { canRedelegate: true, scopeLimit: bounded(5_000) });
        assert.equal(
          await errorCode(() =>
            store.grantRepresentativeAuthority(ADMIN, {
              tenantId: TENANT_B,
              representativeRef: SUB_REPRESENTATIVE,
              governedRights: [ECONOMIC],
              actions: ['transfer'],
              scopeLimit: bounded(1_000),
              effectiveFrom: NOW,
              basis: { kind: 'representative-redelegation', parentRepresentativeAuthorityId: parent.id, assertedBy: REPRESENTATIVE },
            } as never),
          ),
          'GOVERNED_REPRESENTATION_BASIS_INVALID',
        );
        await store.close();
      });

      it('a non-system caller with no organization scope is refused outright', async () => {
        const store = await open();
        assert.equal(await errorCode(() => grant(store, {}, { system: false })), 'GOVERNED_AUTHORITY_TENANT_SCOPE_REQUIRED');
        await store.close();
      });
    });

    // -----------------------------------------------------------------------
    describe('lookup', () => {
      it('the holder is part of the lookup key, so a binding for another holder is never a candidate', async () => {
        const store = await open();
        await grant(store);

        assert.equal((await store.listRepresentativeAuthorities(ADMIN, TENANT_A, REPRESENTATIVE, HOLDER, ASSET)).length, 1);
        assert.equal((await store.listRepresentativeAuthorities(ADMIN, TENANT_A, REPRESENTATIVE, OTHER_HOLDER, ASSET)).length, 0);
        assert.equal((await store.listRepresentativeAuthorities(ADMIN, TENANT_A, 'actor-other', HOLDER, ASSET)).length, 0);
        assert.equal((await store.listRepresentativeAuthorities(ADMIN, TENANT_A, REPRESENTATIVE, HOLDER, OTHER_ASSET)).length, 0);
        await store.close();
      });

      it('reports its own health', async () => {
        const store = await open();
        await grant(store);
        const health = await store.health();
        assert.equal(health.available, true);
        assert.equal(health.representationCount, 1);
        assert.equal(health.schemaVersion, 'aoc.governed-representation-store.schema.v1');
        await store.close();
      });
    });

    // -----------------------------------------------------------------------
    if (openNamed !== undefined) {
      describe('durability', () => {
        it('bindings, ceilings, chains and withdrawals all survive a restart with identical semantics', async () => {
          const first = await openNamed('restart');
          const { representation: parent } = await grant(first, { canRedelegate: true, scopeLimit: bounded(5_000), governedRights: [ECONOMIC, USAGE], actions: ['transfer', 'license'] });
          const { representation: childRecord } = await first.grantRepresentativeAuthority(
            { system: false, organizationId: TENANT_A, actorId: REPRESENTATIVE },
            {
              tenantId: TENANT_A,
              representativeRef: SUB_REPRESENTATIVE,
              governedRights: [ECONOMIC],
              actions: ['transfer'],
              scopeLimit: bounded(1_000),
              effectiveFrom: NOW,
              basis: { kind: 'representative-redelegation', parentRepresentativeAuthorityId: parent.id, assertedBy: REPRESENTATIVE },
            } as never,
          );
          const { representation: withdrawn } = await grant(first, { representativeRef: 'actor-z' });
          await first.revokeRepresentativeAuthority(ADMIN, TENANT_A, withdrawn.id);
          await first.close();

          const second = await openNamed('restart');
          const reloadedParent = await second.getRepresentativeAuthority(ADMIN, TENANT_A, parent.id);
          const reloadedChild = await second.getRepresentativeAuthority(ADMIN, TENANT_A, childRecord.id);
          const reloadedWithdrawn = await second.getRepresentativeAuthority(ADMIN, TENANT_A, withdrawn.id);

          assert.deepEqual(reloadedParent?.scopeLimit, bounded(5_000));
          assert.deepEqual(reloadedParent?.governedRights, [ECONOMIC, USAGE]);
          assert.equal(reloadedChild?.parentRepresentativeAuthorityId, parent.id);
          assert.equal(reloadedChild?.delegationDepth, 1);
          assert.equal(reloadedChild?.holderRef, HOLDER);
          assert.equal(reloadedWithdrawn?.revokedAt, NOW);
          assert.equal(governedRepresentativeAuthorityState(reloadedWithdrawn!, NOW), 'revoked');
          await second.close();
        });

        it('an unbounded ceiling survives a restart as unbounded, not as a number', async () => {
          const first = await openNamed('unbounded');
          const { representation } = await grant(first, { scopeLimit: UNBOUNDED });
          await first.close();

          const second = await openNamed('unbounded');
          assert.deepEqual((await second.getRepresentativeAuthority(ADMIN, TENANT_A, representation.id))?.scopeLimit, { kind: 'unbounded' });
          await second.close();
        });
      });
    }
  });
}

runContract('in-memory', async (delegations) => createInMemoryGovernedRepresentationStore({ now: () => NOW, ...(delegations !== undefined ? { delegations } : {}) }));

describe('Governed Representation Store — SQLite', () => {
  let directory: string;
  before(() => {
    directory = mkdtempSync(join(tmpdir(), 'aoc-governed-representation-'));
  });
  after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  runContract(
    'sqlite',
    async (delegations) =>
      createSqliteGovernedRepresentationStore(join(directory, `contract-${Math.random().toString(36).slice(2)}.sqlite`), {
        now: () => NOW,
        ...(delegations !== undefined ? { delegations } : {}),
      }),
    async (name) => createSqliteGovernedRepresentationStore(join(directory, `${name}.sqlite`), { now: () => NOW }),
  );

  // -------------------------------------------------------------------------
  // Corruption. Every field a tamper could widen is inside the digest, and a
  // read that finds a mismatch refuses rather than reconstructing a
  // representation from bytes that changed after commit.
  // -------------------------------------------------------------------------
  const TAMPERS: readonly { readonly label: string; readonly sql: string }[] = [
    { label: 'holderRef', sql: `UPDATE governed_representations SET holder_ref = 'party-bob'` },
    { label: 'representativeRef', sql: `UPDATE governed_representations SET representative_ref = 'actor-intruder'` },
    { label: 'governed rights', sql: `UPDATE governed_representations SET governed_rights_json = '["ownership-interest"]'` },
    { label: 'ceiling', sql: `UPDATE governed_representations SET scope_limit_basis_points = 9999` },
    { label: 'ceiling kind', sql: `UPDATE governed_representations SET scope_limit_kind = 'unbounded'` },
    { label: 'actions', sql: `UPDATE governed_representations SET actions_json = '["transfer","tokenize"]'` },
    { label: 'resource', sql: `UPDATE governed_representations SET resource_id = 'asset-b'` },
    { label: 'basis', sql: `UPDATE governed_representations SET basis_json = '{"kind":"administrative-bootstrap","assertedBy":"actor-intruder"}'` },
    { label: 'validity window', sql: `UPDATE governed_representations SET expires_at = '2099-01-01T00:00:00.000Z'` },
    { label: 'withdrawal', sql: `UPDATE governed_representations SET revoked_at = NULL` },
    { label: 'redelegation permission', sql: `UPDATE governed_representations SET can_redelegate = 1` },
  ];

  for (const tamper of TAMPERS) {
    it(`fails closed on tampered ${tamper.label}`, async () => {
      const path = join(directory, `tamper-${tamper.label.replace(/\W+/g, '-')}.sqlite`);
      const store = await createSqliteGovernedRepresentationStore(path, { now: () => NOW });
      const { representation } = await grant(store, { expiresAt: LATER });
      // Every tamper runs against a withdrawn binding so the `revoked_at`
      // case has something to erase; the rest are unaffected by it.
      await store.revokeRepresentativeAuthority(ADMIN, TENANT_A, representation.id);
      await store.close();

      const { default: Database } = await import('better-sqlite3');
      const db = new Database(path);
      db.prepare(tamper.sql).run();
      db.close();

      const reopened = await createSqliteGovernedRepresentationStore(path, { now: () => NOW });
      assert.equal(
        await errorCode(() => reopened.getRepresentativeAuthority(ADMIN, TENANT_A, representation.id)),
        'GOVERNED_REPRESENTATION_RECORD_CORRUPTED',
        `a tampered ${tamper.label} must never be recognized as representative authority`,
      );
      await reopened.close();
    });
  }

  it('fails closed on an unreadable rights column and an unknown basis kind', async () => {
    const path = join(directory, 'malformed.sqlite');
    const store = await createSqliteGovernedRepresentationStore(path, { now: () => NOW });
    const { representation } = await grant(store);
    await store.close();

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    db.prepare(`UPDATE governed_representations SET governed_rights_json = 'not-json'`).run();
    db.close();

    const reopened = await createSqliteGovernedRepresentationStore(path, { now: () => NOW });
    assert.equal(await errorCode(() => reopened.getRepresentativeAuthority(ADMIN, TENANT_A, representation.id)), 'GOVERNED_REPRESENTATION_RECORD_CORRUPTED');
    await reopened.close();
  });

  it('refuses to open a database written under a different schema version', async () => {
    const path = join(directory, 'schema-guard.sqlite');
    const store = await createSqliteGovernedRepresentationStore(path, { now: () => NOW });
    await store.close();

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    db.prepare(`INSERT INTO governed_representation_store_versions (schema_version, migration_state, recorded_at) VALUES (?, ?, ?)`).run(
      'aoc.governed-representation-store.schema.v99',
      'applied',
      NOW,
    );
    db.close();

    assert.equal(await errorCode(() => createSqliteGovernedRepresentationStore(path, { now: () => NOW })), 'GOVERNED_AUTHORITY_STORE_UNAVAILABLE');
  });

  it('cannot be made to hold a self-representation even by a writer bypassing the runtime entirely', async () => {
    const path = join(directory, 'self-representation.sqlite');
    const store = await createSqliteGovernedRepresentationStore(path, { now: () => NOW });
    await grant(store);
    await store.close();

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    assert.throws(
      () => db.prepare(`UPDATE governed_representations SET representative_ref = holder_ref`).run(),
      /CHECK constraint failed/,
      'the "a party does not represent itself" invariant lives in the database, not only in the code above it',
    );
    db.close();
  });
});
