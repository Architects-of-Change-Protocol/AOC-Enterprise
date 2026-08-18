import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { GOVERNED_RIGHT_TYPES, type GovernedRightsScope } from '@aoc-enterprise/governed-authorization';
import { governedAuthorityPositionState } from '@aoc-enterprise/governed-authority';

import { isAuthorityGovernanceError } from '../authority-governance/errors.js';
import { createInMemoryGovernedAuthorityStore } from '../authority-governance/in-memory-authority-store.js';
import { createSqliteGovernedAuthorityStore } from '../authority-governance/sqlite-authority-store.js';
import type { AuthorityGovernanceContext } from '../authority-governance/contracts.js';
import type { GovernedAuthorityStore } from '../authority-governance/authority-store.js';

/**
 * One behavioural contract, run against both implementations.
 *
 * Conservation, refusal and idempotency are the properties this store exists
 * for, and a test double that met them while the durable store did not would
 * be worse than no test at all — so every assertion below runs twice, and the
 * SQLite pass runs against a real file on disk that is closed and reopened to
 * prove restart durability. The same arrangement
 * `transfer-mandate-store-contract.test.ts` and its siblings use.
 */

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-02-01T00:00:00.000Z';

const TENANT_A = 'org-a';
const TENANT_B = 'org-b';
const ASSET = { kind: 'asset', id: 'asset-a' } as const;
const OTHER_ASSET = { kind: 'asset', id: 'asset-b' } as const;

const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;

const ADMIN: AuthorityGovernanceContext = { system: true, actorId: 'actor-admin' };
const TENANT_A_CONTEXT: AuthorityGovernanceContext = { system: false, organizationId: TENANT_A };
const TENANT_B_CONTEXT: AuthorityGovernanceContext = { system: false, organizationId: TENANT_B };

function proportional(basisPoints: number): GovernedRightsScope {
  return { kind: 'proportional', basisPoints };
}
function unitized(units: number, unitDenomination = 'share'): GovernedRightsScope {
  return { kind: 'unitized', units, unitDenomination };
}

async function errorCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    assert.ok(isAuthorityGovernanceError(error), `expected an AuthorityGovernanceError, received ${String(error)}`);
    return error.code;
  }
  assert.fail('expected the operation to be refused');
}

/** Seeds a starting position through the one privileged path there is. */
async function seed(store: GovernedAuthorityStore, holderRef: string, scope: GovernedRightsScope, options: { tenantId?: string; right?: typeof ECONOMIC | typeof USAGE; resource?: { kind: string; id: string }; expiresAt?: string; effectiveFrom?: string } = {}) {
  return store.bootstrapPosition(ADMIN, {
    tenantId: options.tenantId ?? TENANT_A,
    holderRef,
    resource: options.resource ?? ASSET,
    governedRight: options.right ?? ECONOMIC,
    scope,
    basis: { kind: 'administrative-bootstrap', assertedBy: 'actor-admin' },
    effectiveFrom: options.effectiveFrom ?? NOW,
    ...(options.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
  });
}

/** A conserving movement, keyed by the execution reference that makes it idempotent. */
function movement(executionRef: string, from: string, to: string, scope: GovernedRightsScope, overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT_A,
    resource: ASSET,
    governedRights: [ECONOMIC],
    scope,
    fromHolderRef: from,
    toHolderRef: to,
    basis: { kind: 'governed-execution' as const, capability: 'transfer', executionRef, mandateRef: `mandate-${executionRef}` },
    occurredAt: NOW,
    ...overrides,
  };
}

/**
 * `openNamed` is what makes a restart test a restart test: it opens a store at
 * a caller-named location, so the same name can be opened twice and the second
 * store lands on the bytes the first one committed. The in-memory pass has no
 * such notion and simply omits it.
 */
function runContract(label: string, open: () => Promise<GovernedAuthorityStore>, openNamed?: (name: string) => Promise<GovernedAuthorityStore>): void {
  describe(`Governed Authority Store contract — ${label}`, () => {
    describe('conservation', () => {
      it('debits the source and credits the recipient by exactly the same quantity', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));

        await store.applyTransition(ADMIN, movement('exec-1', 'party-alice', 'party-bob', proportional(2_500)));

        const alice = await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC);
        const bob = await store.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC);
        assert.deepEqual(alice?.scope, proportional(7_500));
        assert.deepEqual(bob?.scope, proportional(2_500));
        // The invariant stated as the sum, because that is what conservation is.
        assert.equal((alice?.scope as { basisPoints: number }).basisPoints + (bob?.scope as { basisPoints: number }).basisPoints, 10_000);
        await store.close();
      });

      it('conserves unitized quantities identically', async () => {
        const store = await open();
        await seed(store, 'party-alice', unitized(100));

        await store.applyTransition(ADMIN, movement('exec-units', 'party-alice', 'party-bob', unitized(25)));

        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, unitized(75));
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC))?.scope, unitized(25));
        await store.close();
      });

      it('sums a credit into an existing position rather than opening a second lot', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        await seed(store, 'party-bob', proportional(1_000));

        await store.applyTransition(ADMIN, movement('exec-merge', 'party-alice', 'party-bob', proportional(2_500)));

        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC))?.scope, proportional(3_500));
        assert.equal((await store.listPositionsForHolder(ADMIN, TENANT_A, 'party-bob', ASSET)).length, 1);
        await store.close();
      });

      it('separates two rights of the same resource held by the same actor', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        await seed(store, 'party-alice', proportional(4_000), { right: USAGE });

        await store.applyTransition(ADMIN, movement('exec-economic-only', 'party-alice', 'party-bob', proportional(2_500)));

        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(7_500));
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, USAGE))?.scope, proportional(4_000), 'the usage right is untouched');
        await store.close();
      });

      it('separates the same right across two resources', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        await seed(store, 'party-alice', proportional(10_000), { resource: OTHER_ASSET });

        await store.applyTransition(ADMIN, movement('exec-one-asset', 'party-alice', 'party-bob', proportional(2_500)));

        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', OTHER_ASSET, ECONOMIC))?.scope, proportional(10_000));
        await store.close();
      });
    });

    describe('refusals', () => {
      it('never produces a negative position', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(2_500));

        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-overdraw', 'party-alice', 'party-bob', proportional(3_000)))),
          'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
        );
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(2_500), 'and leaves the source untouched');
        assert.equal(await store.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC), null, 'and credits nobody');
        await store.close();
      });

      it('refuses to move from a holder with no position at all', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));

        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-nothing', 'party-stranger', 'party-bob', proportional(1)))),
          'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
        );
        await store.close();
      });

      it('never coerces a proportional share into a unit count, in either direction', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));

        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-coerce', 'party-alice', 'party-bob', unitized(10)))),
          'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE',
        );
        await store.close();
      });

      it('never converts between two unit denominations', async () => {
        const store = await open();
        await seed(store, 'party-alice', unitized(100, 'share'));

        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-denomination', 'party-alice', 'party-bob', unitized(10, 'token')))),
          'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE',
        );
        await store.close();
      });

      it('refuses to credit an incommensurable quantity into an existing recipient position', async () => {
        const store = await open();
        await seed(store, 'party-alice', unitized(100, 'share'));
        await seed(store, 'party-bob', unitized(5, 'token'));

        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-credit-mismatch', 'party-alice', 'party-bob', unitized(10, 'share')))),
          'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE',
        );
        await store.close();
      });

      it('refuses a movement of nothing, and a movement to the same party', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));

        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-zero', 'party-alice', 'party-bob', proportional(0)))),
          'GOVERNED_AUTHORITY_SCOPE_INVALID',
        );
        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-self', 'party-alice', 'party-alice', proportional(100)))),
          'GOVERNED_AUTHORITY_BASIS_INVALID',
        );
        await store.close();
      });

      it('refuses a fractional or negative quantity outright', async () => {
        const store = await open();
        assert.equal(await errorCode(() => seed(store, 'party-alice', proportional(-1))), 'GOVERNED_AUTHORITY_SCOPE_INVALID');
        assert.equal(await errorCode(() => seed(store, 'party-alice', proportional(25.5))), 'GOVERNED_AUTHORITY_SCOPE_INVALID');
        await store.close();
      });

      it('moves every named right or none of them', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        // No usage-right position for Alice, so the second right cannot move.

        assert.equal(
          await errorCode(() =>
            store.applyTransition(ADMIN, movement('exec-two-rights', 'party-alice', 'party-bob', proportional(2_500), { governedRights: [ECONOMIC, USAGE] })),
          ),
          'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
        );
        assert.deepEqual(
          (await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope,
          proportional(10_000),
          'the right that could have moved did not, because the other could not',
        );
        assert.equal(await store.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC), null);
        await store.close();
      });
    });

    describe('bootstrap is privileged, and issuance is the only way authority is created', () => {
      it('refuses position creation outside a system context — there is no self-issuance path', async () => {
        const store = await open();
        assert.equal(
          await errorCode(() =>
            store.bootstrapPosition(TENANT_A_CONTEXT, {
              tenantId: TENANT_A,
              holderRef: 'party-alice',
              resource: ASSET,
              governedRight: ECONOMIC,
              scope: proportional(10_000),
              basis: { kind: 'administrative-bootstrap', assertedBy: 'party-alice' },
              effectiveFrom: NOW,
            }),
          ),
          'GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED',
        );
        await store.close();
      });

      it('refuses a movement basis for an issuance, and an issuance basis for a movement', async () => {
        const store = await open();
        assert.equal(
          await errorCode(() =>
            store.bootstrapPosition(ADMIN, {
              tenantId: TENANT_A,
              holderRef: 'party-alice',
              resource: ASSET,
              governedRight: ECONOMIC,
              scope: proportional(10_000),
              basis: { kind: 'governed-execution', capability: 'transfer', executionRef: 'exec-x', mandateRef: 'mandate-x' },
              effectiveFrom: NOW,
            }),
          ),
          'GOVERNED_AUTHORITY_BASIS_INVALID',
        );
        await store.close();
      });

      it('records an evidence-based issuance with the evidence it relied on', async () => {
        const store = await open();
        await store.bootstrapPosition(ADMIN, {
          tenantId: TENANT_A,
          holderRef: 'party-alice',
          resource: ASSET,
          governedRight: ECONOMIC,
          scope: proportional(10_000),
          basis: { kind: 'recognized-external-evidence', assertedBy: 'actor-admin', evidenceRefs: ['registry-extract-001'], externalSystem: 'registry-alpha' },
          effectiveFrom: NOW,
        });

        const provenance = await store.getProvenance(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC);
        assert.equal(provenance.transitions.length, 1);
        assert.equal(provenance.transitions[0]?.basis.kind, 'recognized-external-evidence');
        assert.equal(provenance.transitions[0]?.fromActorRef, undefined, 'an issuance debits nobody');
        await store.close();
      });
    });

    describe('idempotency and replay', () => {
      it('applies one execution once, however many times it is replayed', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));

        const first = await store.applyTransition(ADMIN, movement('exec-replay', 'party-alice', 'party-bob', proportional(2_500)));
        assert.equal(first.replayed, false);

        const second = await store.applyTransition(ADMIN, movement('exec-replay', 'party-alice', 'party-bob', proportional(2_500)));
        assert.equal(second.replayed, true);
        assert.deepEqual(
          second.transitions.map((transition) => transition.id),
          first.transitions.map((transition) => transition.id),
          'a replay returns the original transitions rather than new ones',
        );

        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(7_500), 'no second debit');
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC))?.scope, proportional(2_500), 'no second credit');
        await store.close();
      });

      it('refuses a replay that restates the movement differently', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        await store.applyTransition(ADMIN, movement('exec-conflict', 'party-alice', 'party-bob', proportional(2_500)));

        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-conflict', 'party-alice', 'party-carol', proportional(2_500)))),
          'GOVERNED_AUTHORITY_TRANSITION_CONFLICT',
        );
        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-conflict', 'party-alice', 'party-bob', proportional(5_000)))),
          'GOVERNED_AUTHORITY_TRANSITION_CONFLICT',
        );
        await store.close();
      });

      it('finds an execution reference again so a caller can tell applied from unapplied', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        assert.deepEqual(await store.listTransitionsByExecutionRef(ADMIN, TENANT_A, 'exec-lookup'), []);

        await store.applyTransition(ADMIN, movement('exec-lookup', 'party-alice', 'party-bob', proportional(2_500)));
        assert.equal((await store.listTransitionsByExecutionRef(ADMIN, TENANT_A, 'exec-lookup')).length, 1);
        await store.close();
      });
    });

    describe('concurrency', () => {
      it('never lets two concurrent movements overdraw one position', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));

        // 6000 + 6000 against 10 000. At most one may commit; a lost update
        // would let both, leaving Alice at -2000 or the recipients holding
        // 12 000 between them.
        const results = await Promise.allSettled([
          store.applyTransition(ADMIN, movement('exec-concurrent-a', 'party-alice', 'party-bob', proportional(6_000))),
          store.applyTransition(ADMIN, movement('exec-concurrent-b', 'party-alice', 'party-carol', proportional(6_000))),
        ]);

        const committed = results.filter((result) => result.status === 'fulfilled');
        assert.equal(committed.length, 1, 'exactly one of the two may commit');

        const alice = (await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope as { basisPoints: number };
        const bob = ((await store.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC))?.scope as { basisPoints: number } | undefined)?.basisPoints ?? 0;
        const carol = ((await store.getPosition(ADMIN, TENANT_A, 'party-carol', ASSET, ECONOMIC))?.scope as { basisPoints: number } | undefined)?.basisPoints ?? 0;

        assert.ok(alice.basisPoints >= 0, 'Alice is never negative');
        assert.equal(alice.basisPoints + bob + carol, 10_000, 'and the total is still exactly what was issued');
        await store.close();
      });

      it('never applies one execution twice under concurrent replay', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));

        await Promise.allSettled([
          store.applyTransition(ADMIN, movement('exec-race', 'party-alice', 'party-bob', proportional(2_500))),
          store.applyTransition(ADMIN, movement('exec-race', 'party-alice', 'party-bob', proportional(2_500))),
        ]);

        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(7_500));
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC))?.scope, proportional(2_500));
        await store.close();
      });
    });

    describe('tenant isolation', () => {
      it('refuses every read and every write across the tenancy boundary', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));

        assert.equal(
          await errorCode(() => store.getPosition(TENANT_B_CONTEXT, TENANT_A, 'party-alice', ASSET, ECONOMIC)),
          'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION',
        );
        assert.equal(await errorCode(() => store.isResourceEnrolled(TENANT_B_CONTEXT, TENANT_A, ASSET)), 'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION');
        assert.equal(await errorCode(() => store.listPositionsForHolder(TENANT_B_CONTEXT, TENANT_A, 'party-alice', ASSET)), 'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION');
        assert.equal(
          await errorCode(() => store.getProvenance(TENANT_B_CONTEXT, TENANT_A, 'party-alice', ASSET, ECONOMIC)),
          'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION',
        );
        assert.equal(
          await errorCode(() => store.applyTransition(TENANT_B_CONTEXT, movement('exec-cross-tenant', 'party-alice', 'party-bob', proportional(1_000)))),
          'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION',
        );
        assert.equal(
          await errorCode(() => store.listTransitionsByExecutionRef(TENANT_B_CONTEXT, TENANT_A, 'exec-any')),
          'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION',
        );
        await store.close();
      });

      it('keeps two tenants holding the same right of the same-named resource entirely apart', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        await seed(store, 'party-alice', proportional(500), { tenantId: TENANT_B });

        await store.applyTransition(ADMIN, movement('exec-tenant-a-only', 'party-alice', 'party-bob', proportional(2_500)));

        assert.deepEqual((await store.getPosition(TENANT_B_CONTEXT, TENANT_B, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(500));
        assert.equal(await store.getPosition(TENANT_B_CONTEXT, TENANT_B, 'party-bob', ASSET, ECONOMIC), null, "tenant A's movement credits nothing in tenant B");
        await store.close();
      });

      it('requires an organization scope from a non-system caller at all', async () => {
        const store = await open();
        assert.equal(
          await errorCode(() => store.getPosition({ system: false }, TENANT_A, 'party-alice', ASSET, ECONOMIC)),
          'GOVERNED_AUTHORITY_TENANT_SCOPE_REQUIRED',
        );
        await store.close();
      });
    });

    describe('time semantics', () => {
      it('reports a position as pending before it starts and expired at its expiry', async () => {
        const store = await open();
        const position = await seed(store, 'party-alice', proportional(10_000), { effectiveFrom: LATER, expiresAt: '2026-03-01T00:00:00.000Z' });

        assert.equal(governedAuthorityPositionState(position, NOW), 'pending');
        assert.equal(governedAuthorityPositionState(position, LATER), 'active');
        assert.equal(governedAuthorityPositionState(position, '2026-03-01T00:00:00.000Z'), 'expired');
        await store.close();
      });

      it('rejects a timestamp that is not unambiguously UTC on its face', async () => {
        const store = await open();
        assert.equal(
          await errorCode(() => seed(store, 'party-alice', proportional(10_000), { effectiveFrom: '2026-01-01T02:00:00.000+02:00' })),
          'GOVERNED_AUTHORITY_INVALID_TIMESTAMP',
        );
        await store.close();
      });
    });

    describe('provenance and enrolment', () => {
      it('explains how a holder came to hold what it holds', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        await store.applyTransition(ADMIN, movement('exec-provenance', 'party-alice', 'party-bob', proportional(2_500)));

        const bob = await store.getProvenance(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC);
        assert.equal(bob.transitions.length, 1);
        const basis = bob.transitions[0]?.basis;
        assert.equal(basis?.kind, 'governed-execution');
        assert.equal(basis?.kind === 'governed-execution' ? basis.executionRef : undefined, 'exec-provenance');
        assert.equal(basis?.kind === 'governed-execution' ? basis.mandateRef : undefined, 'mandate-exec-provenance');
        assert.equal(bob.transitions[0]?.fromActorRef, 'party-alice');

        const alice = await store.getProvenance(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC);
        assert.equal(alice.transitions.length, 2, "Alice's history is her issuance and the movement out of it");
        await store.close();
      });

      it('reports a resource as enrolled once anything is recorded against it, and not before', async () => {
        const store = await open();
        assert.equal(await store.isResourceEnrolled(ADMIN, TENANT_A, ASSET), false);
        await seed(store, 'party-alice', proportional(10_000));
        assert.equal(await store.isResourceEnrolled(ADMIN, TENANT_A, ASSET), true);
        assert.equal(await store.isResourceEnrolled(ADMIN, TENANT_A, OTHER_ASSET), false, 'enrolment is per resource, never per tenant');
        await store.close();
      });

      it('reports its own health honestly', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        const health = await store.health();
        assert.equal(health.available, true);
        assert.equal(health.positionCount, 1);
        assert.equal(health.transitionCount, 1);
        await store.close();
      });
    });

    if (openNamed !== undefined) {
      describe('durability', () => {
        it('survives a close and reopen with the same balances and the same history', async () => {
          const first = await openNamed('durable-balances');
          await seed(first, 'party-alice', proportional(10_000));
          await first.applyTransition(ADMIN, movement('exec-durable', 'party-alice', 'party-bob', proportional(2_500)));
          await first.close();

          const second = await openNamed('durable-balances');
          assert.deepEqual((await second.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(7_500));
          assert.deepEqual((await second.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC))?.scope, proportional(2_500));
          assert.equal((await second.listTransitionsByExecutionRef(ADMIN, TENANT_A, 'exec-durable')).length, 1);
          await second.close();
        });

        it('applies a replayed execution once across a restart', async () => {
          const first = await openNamed('durable-replay');
          await seed(first, 'party-alice', proportional(10_000));
          await first.applyTransition(ADMIN, movement('exec-restart-replay', 'party-alice', 'party-bob', proportional(2_500)));
          await first.close();

          const second = await openNamed('durable-replay');
          const replay = await second.applyTransition(ADMIN, movement('exec-restart-replay', 'party-alice', 'party-bob', proportional(2_500)));
          assert.equal(replay.replayed, true);
          assert.deepEqual((await second.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(7_500));
          await second.close();
        });
      });
    }
  });
}

runContract('in-memory', async () => createInMemoryGovernedAuthorityStore({ now: () => NOW }));

describe('Governed Authority Store — SQLite', () => {
  let directory: string;
  let counter = 0;

  before(() => {
    directory = mkdtempSync(join(tmpdir(), 'aoc-governed-authority-'));
  });
  after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  // A fresh database file per contract case, so no case can see another's
  // rows; and a named opener for the durability pair, so each of those opens
  // the *same* file twice.
  runContract(
    'sqlite',
    async () => {
      counter += 1;
      return createSqliteGovernedAuthorityStore(join(directory, `case-${counter}.sqlite`), { now: () => NOW });
    },
    async (name: string) => createSqliteGovernedAuthorityStore(join(directory, `${name}.sqlite`), { now: () => NOW }),
  );

  it('refuses to open a database written under a different schema version', async () => {
    const path = join(directory, 'version-mismatch.sqlite');
    const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
    await store.close();

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    db.prepare(`INSERT INTO governed_authority_store_versions (schema_version, migration_state, recorded_at) VALUES (?, ?, ?)`).run('aoc.governed-authority-store.schema.v99', 'applied', NOW);
    db.close();

    assert.equal(await errorCode(() => createSqliteGovernedAuthorityStore(path, { now: () => NOW })), 'GOVERNED_AUTHORITY_STORE_UNAVAILABLE');
  });

  it('detects a position whose stored scope was altered after commit, and refuses to recognize authority from it', async () => {
    const path = join(directory, 'tampered-position.sqlite');
    const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
    await seed(store, 'party-alice', proportional(2_500));
    await store.close();

    // The exact tamper that matters: widen a position without touching its
    // digest. A reader must refuse it rather than authorize 10 000 bp of
    // action on the strength of a row someone edited.
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    db.prepare(`UPDATE governed_authority_positions SET scope_basis_points = 10000`).run();
    db.close();

    const reopened = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
    assert.equal(
      await errorCode(() => reopened.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC)),
      'GOVERNED_AUTHORITY_RECORD_CORRUPTED',
    );
    await reopened.close();
  });

  it('detects a transition whose stored quantity was altered after commit', async () => {
    const path = join(directory, 'tampered-transition.sqlite');
    const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
    await seed(store, 'party-alice', proportional(10_000));
    await store.applyTransition(ADMIN, movement('exec-tamper', 'party-alice', 'party-bob', proportional(2_500)));
    await store.close();

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    db.prepare(`UPDATE governed_authority_transitions SET scope_basis_points = 9999 WHERE execution_ref = ?`).run('exec-tamper');
    db.close();

    const reopened = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
    assert.equal(
      await errorCode(() => reopened.listTransitionsByExecutionRef(ADMIN, TENANT_A, 'exec-tamper')),
      'GOVERNED_AUTHORITY_RECORD_CORRUPTED',
    );
    await reopened.close();
  });

  it('cannot be made to hold a negative quantity even by a writer bypassing the runtime entirely', async () => {
    const path = join(directory, 'negative-check.sqlite');
    const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
    await seed(store, 'party-alice', proportional(2_500));
    await store.close();

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    assert.throws(
      () => db.prepare(`UPDATE governed_authority_positions SET scope_basis_points = -1`).run(),
      /CHECK constraint failed/,
      'the non-negativity invariant lives in the database, not only in the code above it',
    );
    db.close();
  });
});
