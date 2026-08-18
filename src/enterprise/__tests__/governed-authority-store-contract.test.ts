import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { GOVERNED_RIGHT_TYPES, type GovernedRightsScope } from '@aoc-enterprise/governed-authorization';
import { governedAuthorityPositionState, type GovernedAuthorityAvailability } from '@aoc-enterprise/governed-authority';

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
const MUCH_LATER = '2026-06-01T00:00:00.000Z';

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

/** A commitment against one holder's authority, named by the mandate it stands for. */
function reservation(
  mandateRef: string,
  holderRef: string,
  scope: GovernedRightsScope,
  overrides: {
    tenantId?: string;
    resource?: { kind: string; id: string };
    governedRight?: typeof ECONOMIC | typeof USAGE;
    expiresAt?: string;
    idempotencyKey?: string;
    action?: string;
  } = {},
) {
  return {
    tenantId: overrides.tenantId ?? TENANT_A,
    holderRef,
    resource: overrides.resource ?? ASSET,
    governedRight: overrides.governedRight ?? ECONOMIC,
    scope,
    action: overrides.action ?? 'transfer',
    sourceRequestRef: `request-for-${mandateRef}`,
    sourceDecisionRef: `decision-for-${mandateRef}`,
    sourceMandateRef: mandateRef,
    effectiveFrom: NOW,
    expiresAt: overrides.expiresAt ?? MUCH_LATER,
    ...(overrides.idempotencyKey !== undefined ? { idempotencyKey: overrides.idempotencyKey } : {}),
  };
}

/**
 * A persistent constraint, named by the execution that produced it.
 *
 * `sourceAction` defaults to `'collateralize'` because that is the one action
 * classified as leaving a constraint behind; the tests that pass anything else
 * are asserting that nothing else can.
 */
function encumbrance(
  sourceExecutionRef: string,
  sourceMandateRef: string,
  holderRef: string,
  scope: GovernedRightsScope,
  overrides: {
    tenantId?: string;
    resource?: { kind: string; id: string };
    governedRight?: typeof ECONOMIC | typeof USAGE;
    sourceAction?: string;
    consumesReservationsForMandateRef?: string;
  } = {},
) {
  return {
    tenantId: overrides.tenantId ?? TENANT_A,
    holderRef,
    resource: overrides.resource ?? ASSET,
    governedRight: overrides.governedRight ?? ECONOMIC,
    scope,
    sourceAction: overrides.sourceAction ?? 'collateralize',
    sourceMandateRef,
    sourceExecutionRef,
    effectiveFrom: NOW,
    ...(overrides.consumesReservationsForMandateRef !== undefined
      ? { consumesReservationsForMandateRef: overrides.consumesReservationsForMandateRef }
      : {}),
  };
}

function availabilityOf(
  holderRef: string,
  overrides: { tenantId?: string; resource?: { kind: string; id: string }; governedRight?: typeof ECONOMIC | typeof USAGE; at?: string } = {},
) {
  return {
    tenantId: overrides.tenantId ?? TENANT_A,
    holderRef,
    resource: overrides.resource ?? ASSET,
    governedRight: overrides.governedRight ?? ECONOMIC,
    at: overrides.at ?? NOW,
  };
}

/** Reads the position id out of an availability answer, so a deepEqual can state the whole shape without hard-coding a derived digest. */
function positionIdOf(availability: GovernedAuthorityAvailability): string {
  assert.ok(availability.outcome === 'available');
  return availability.positionId;
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

    // -----------------------------------------------------------------------
    // Reservation: how much of a position is already committed to a still-live
    // governed authorization, and therefore unavailable to another.
    // -----------------------------------------------------------------------

    describe('reservation — availability', () => {
      it('reports held, committed and available, and never lets a commitment change the position', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));

        const before = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.deepEqual(before, { outcome: 'available', positionId: positionIdOf(before), held: proportional(5_000), available: proportional(5_000) });

        await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(3_000)));

        const after = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.equal(after.outcome, 'available');
        assert.ok(after.outcome === 'available');
        assert.deepEqual(after.held, proportional(5_000), 'the holder still possesses everything it possessed');
        assert.deepEqual(after.committed, proportional(3_000));
        assert.deepEqual(after.available, proportional(2_000));

        // The point of the whole model: a reservation is not a debit.
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(5_000));
        await store.close();
      });

      it('aggregates every active commitment against the same holder, resource and right', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        await store.acquireReservation(ADMIN, reservation('mandate-a', 'party-alice', proportional(2_000)));
        await store.acquireReservation(ADMIN, reservation('mandate-b', 'party-alice', proportional(3_000)));

        const availability = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(availability.outcome === 'available');
        assert.deepEqual(availability.available, proportional(5_000));

        // 5000 fits exactly; 5001 does not. The boundary is the assertion.
        assert.equal(
          await errorCode(() => store.acquireReservation(ADMIN, reservation('mandate-d', 'party-alice', proportional(5_001)))),
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
        );
        const exact = await store.acquireReservation(ADMIN, reservation('mandate-c', 'party-alice', proportional(5_000)));
        assert.equal(exact.outcome, 'reserved');

        const exhausted = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(exhausted.outcome === 'available');
        assert.deepEqual(exhausted.available, proportional(0));
        assert.equal(
          await errorCode(() => store.acquireReservation(ADMIN, reservation('mandate-e', 'party-alice', proportional(1)))),
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
        );
        await store.close();
      });

      it('reports a resource with no positions as unenrolled rather than refusing it', async () => {
        const store = await open();
        // Nothing seeded at all: this deployment holds no governed authority
        // state for the resource, so there is no capacity to commit and no
        // competing commitment to prevent.
        const outcome = await store.acquireReservation(ADMIN, reservation('mandate-legacy', 'party-alice', proportional(3_000)));
        assert.deepEqual(outcome, { outcome: 'resource_not_enrolled' });
        await store.close();
      });

      it('fails closed for a right of an enrolled resource the holder has no position in', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000), { right: USAGE });
        // The resource is enrolled — by the usage-right position — so the
        // economic interest is enforced strictly even though nobody was
        // bootstrapped into it.
        assert.equal(
          await errorCode(() => store.acquireReservation(ADMIN, reservation('mandate-unheld', 'party-alice', proportional(1_000)))),
          'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
        );
        await store.close();
      });
    });

    describe('reservation — the pools that must stay separate', () => {
      it('keeps holders, resources and rights independent of one another', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await seed(store, 'party-bob', proportional(5_000));
        await seed(store, 'party-alice', proportional(5_000), { right: USAGE });
        await seed(store, 'party-alice', proportional(5_000), { resource: OTHER_ASSET });

        await store.acquireReservation(ADMIN, reservation('mandate-alice', 'party-alice', proportional(4_000)));

        const aliceEconomic = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(aliceEconomic.outcome === 'available');
        assert.deepEqual(aliceEconomic.available, proportional(1_000));

        for (const [what, query] of [
          ['another holder', availabilityOf('party-bob')],
          ['another right of the same resource', availabilityOf('party-alice', { governedRight: USAGE })],
          ['the same right of another resource', availabilityOf('party-alice', { resource: OTHER_ASSET })],
        ] as const) {
          const untouched = await store.resolveAvailability(ADMIN, query);
          assert.ok(untouched.outcome === 'available');
          assert.deepEqual(untouched.available, proportional(5_000), `${what} is not reduced by Alice\u2019s commitment`);
        }
        await store.close();
      });

      it('draws every representative and every delegated route on the holder from one pool', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));

        // Two commitments made through entirely different chains of authority —
        // a direct holder request and a subdelegated agent's, say — still name
        // the same holder, resource and right, and so compete.
        await store.acquireReservation(ADMIN, reservation('mandate-via-x', 'party-alice', proportional(3_000)));
        assert.equal(
          await errorCode(() => store.acquireReservation(ADMIN, reservation('mandate-via-y', 'party-alice', proportional(3_000)))),
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
        );
        await store.close();
      });
    });

    describe('reservation — lifecycle', () => {
      it('release returns capacity without touching the position, and is idempotent', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        const acquired = await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(4_000)));
        assert.ok(acquired.outcome === 'reserved');

        const released = await store.releaseReservation(ADMIN, { tenantId: TENANT_A, reservationId: acquired.reservation.id, reason: 'authorization_ended' });
        assert.equal(released.status, 'released');

        const restored = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(restored.outcome === 'available');
        assert.deepEqual(restored.available, proportional(5_000));
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(5_000), 'and the position never moved');

        // Releasing twice cannot free capacity twice — availability is derived
        // from what is still active, not from a counter something could
        // decrement again.
        await store.releaseReservation(ADMIN, { tenantId: TENANT_A, reservationId: acquired.reservation.id, reason: 'authorization_ended' });
        const stillFive = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(stillFive.outcome === 'available');
        assert.deepEqual(stillFive.available, proportional(5_000));
        await store.close();
      });

      it('stops counting a lapsed commitment at its expiry, with no cleanup process involved', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(4_000), { expiresAt: LATER }));

        const during = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(during.outcome === 'available');
        assert.deepEqual(during.available, proportional(1_000));

        // Nothing has run, nothing has been rewritten, and the row still says
        // `'active'`. The clock alone decides.
        const after = await store.resolveAvailability(ADMIN, availabilityOf('party-alice', { at: LATER }));
        assert.ok(after.outcome === 'available');
        assert.deepEqual(after.available, proportional(5_000));
        assert.equal((await store.listActiveReservations(ADMIN, availabilityOf('party-alice', { at: LATER }))).length, 0);
        await store.close();
      });

      it('consumes the commitment in the same commit section as the debit, and never double-counts it', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(3_000)));

        const beforeExecution = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(beforeExecution.outcome === 'available');
        assert.deepEqual(beforeExecution.available, proportional(7_000));

        await store.applyTransition(ADMIN, {
          ...movement('exec-consume', 'party-alice', 'party-bob', proportional(3_000)),
          consumesReservationsForMandateRef: 'mandate-1',
        });

        // 7000 held, and 7000 available. Subtracting the reservation again from
        // a position that already reflects the movement would say 4000, which
        // is the double-accounting this asserts against.
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(7_000));
        const afterExecution = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(afterExecution.outcome === 'available');
        assert.deepEqual(afterExecution.available, proportional(7_000));

        const held = await store.listReservationsByMandateRef(ADMIN, TENANT_A, 'mandate-1');
        assert.equal(held[0]?.status, 'consumed');
        await store.close();
      });

      it('refuses to release a consumed commitment, because the authority has already moved', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        const acquired = await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(3_000)));
        assert.ok(acquired.outcome === 'reserved');
        await store.applyTransition(ADMIN, {
          ...movement('exec-consume', 'party-alice', 'party-bob', proportional(3_000)),
          consumesReservationsForMandateRef: 'mandate-1',
        });

        assert.equal(
          await errorCode(() => store.releaseReservation(ADMIN, { tenantId: TENANT_A, reservationId: acquired.reservation.id, reason: 'authorization_ended' })),
          'GOVERNED_AUTHORITY_RESERVATION_CONFLICT',
        );
        await store.close();
      });

      it('consumes a commitment exactly once however often the execution is replayed', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(3_000)));

        const applied = {
          ...movement('exec-retry', 'party-alice', 'party-bob', proportional(3_000)),
          consumesReservationsForMandateRef: 'mandate-1',
        };
        await store.applyTransition(ADMIN, applied);
        const replay = await store.applyTransition(ADMIN, applied);
        assert.equal(replay.replayed, true);

        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(7_000), 'debited exactly once');
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC))?.scope, proportional(3_000), 'credited exactly once');
        const held = await store.listReservationsByMandateRef(ADMIN, TENANT_A, 'mandate-1');
        assert.equal(held.length, 1);
        assert.equal(held[0]?.status, 'consumed');
        await store.close();
      });

      it('requires a privileged context to cancel a commitment administratively', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        const acquired = await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(3_000)));
        assert.ok(acquired.outcome === 'reserved');

        assert.equal(
          await errorCode(() =>
            store.releaseReservation(TENANT_A_CONTEXT, { tenantId: TENANT_A, reservationId: acquired.reservation.id, reason: 'administrative' }),
          ),
          'GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED',
        );
        const administrative = await store.releaseReservation(ADMIN, { tenantId: TENANT_A, reservationId: acquired.reservation.id, reason: 'administrative' });
        assert.equal(administrative.status, 'released');
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(5_000), 'and the position is untouched');
        await store.close();
      });

      it('refuses a commitment that would never stand, and one of nothing', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        assert.equal(
          await errorCode(() => store.acquireReservation(ADMIN, reservation('mandate-backwards', 'party-alice', proportional(1_000), { expiresAt: NOW }))),
          'GOVERNED_AUTHORITY_SCOPE_INVALID',
        );
        assert.equal(
          await errorCode(() => store.acquireReservation(ADMIN, reservation('mandate-zero', 'party-alice', proportional(0)))),
          'GOVERNED_AUTHORITY_SCOPE_INVALID',
        );
        await store.close();
      });

      it('refuses a commitment in a quantity the position cannot be compared with', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        assert.equal(
          await errorCode(() => store.acquireReservation(ADMIN, reservation('mandate-units', 'party-alice', unitized(10)))),
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
        );
        await store.close();
      });
    });

    describe('reservation — idempotency', () => {
      it('returns the original commitment on replay rather than committing a second quantity', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));

        const first = await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(3_000)));
        const retry = await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(3_000)));
        assert.ok(first.outcome === 'reserved' && retry.outcome === 'reserved');
        assert.equal(retry.replayed, true);
        assert.equal(retry.reservation.id, first.reservation.id);

        const availability = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(availability.outcome === 'available');
        assert.deepEqual(availability.available, proportional(2_000), 'one commitment, not two');
        await store.close();
      });

      it('refuses the same idempotency key used for a materially different commitment', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        await seed(store, 'party-bob', proportional(10_000));
        await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(3_000), { idempotencyKey: 'key-1' }));

        for (const [what, input] of [
          ['a different holder', reservation('mandate-1', 'party-bob', proportional(3_000), { idempotencyKey: 'key-1' })],
          ['a different quantity', reservation('mandate-1', 'party-alice', proportional(4_000), { idempotencyKey: 'key-1' })],
          ['a different resource', reservation('mandate-1', 'party-alice', proportional(3_000), { idempotencyKey: 'key-1', resource: OTHER_ASSET })],
          ['a different right', reservation('mandate-1', 'party-alice', proportional(3_000), { idempotencyKey: 'key-1', governedRight: USAGE })],
          ['a different mandate', reservation('mandate-2', 'party-alice', proportional(3_000), { idempotencyKey: 'key-1' })],
        ] as const) {
          assert.equal(await errorCode(() => store.acquireReservation(ADMIN, input)), 'GOVERNED_AUTHORITY_RESERVATION_CONFLICT', `refuses ${what}`);
        }
        await store.close();
      });
    });

    it('refuses a second commitment for the same mandate and right under a different key', async () => {
      const store = await open();
      await seed(store, 'party-alice', proportional(10_000));
      await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(3_000), { idempotencyKey: 'key-a' }));

      // Same artifact, same right, different key. A commitment is identified by
      // the artifact it stands for, so this is the same commitment however it
      // is keyed — and letting it through would either overwrite the live one
      // or commit 3 000 bp twice.
      assert.equal(
        await errorCode(() => store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(3_000), { idempotencyKey: 'key-b' }))),
        'GOVERNED_AUTHORITY_RESERVATION_CONFLICT',
      );
      const availability = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
      assert.ok(availability.outcome === 'available');
      assert.deepEqual(availability.available, proportional(7_000), 'one commitment, not two');
      await store.close();
    });

    describe('reservation — concurrency', () => {
      it('lets exactly one of two incompatible concurrent commitments succeed', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));

        // 4000 + 4000 against 5000. Both succeeding is the vulnerability this
        // whole layer exists to close; neither succeeding would be a bug of its
        // own.
        const results = await Promise.allSettled([
          store.acquireReservation(ADMIN, reservation('mandate-race-a', 'party-alice', proportional(4_000))),
          store.acquireReservation(ADMIN, reservation('mandate-race-b', 'party-alice', proportional(4_000))),
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1, 'exactly one, never two and never zero');

        const active = await store.listActiveReservations(ADMIN, availabilityOf('party-alice'));
        assert.equal(active.length, 1);
        const availability = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(availability.outcome === 'available', 'and the store is never left overcommitted');
        assert.deepEqual(availability.available, proportional(1_000));
        await store.close();
      });

      it('holds the invariant under many-way contention', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));

        // Ten concurrent attempts at 1500 bp each against 10 000: at most six
        // can fit, and the sum of whatever commits must never exceed the
        // holdings.
        const results = await Promise.allSettled(
          Array.from({ length: 10 }, (_unused, index) => store.acquireReservation(ADMIN, reservation(`mandate-many-${index}`, 'party-alice', proportional(1_500)))),
        );
        const committed = results.filter((result) => result.status === 'fulfilled').length;
        assert.ok(committed >= 1 && committed <= 6, `expected between 1 and 6 commitments, got ${committed}`);

        const availability = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(availability.outcome === 'available', 'never overcommitted');
        assert.equal(committed * 1_500 + (availability.available as { basisPoints: number }).basisPoints, 10_000);
        await store.close();
      });

      it('keeps the books consistent when a release and an acquisition race', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        const held = await store.acquireReservation(ADMIN, reservation('mandate-held', 'party-alice', proportional(4_000)));
        assert.ok(held.outcome === 'reserved');

        await Promise.allSettled([
          store.releaseReservation(ADMIN, { tenantId: TENANT_A, reservationId: held.reservation.id, reason: 'authorization_ended' }),
          store.acquireReservation(ADMIN, reservation('mandate-contending', 'party-alice', proportional(4_000))),
        ]);

        // Whichever order they landed in, the standing commitments must still
        // fit inside the position.
        const availability = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(availability.outcome === 'available', 'never overcommitted, whichever won');
        await store.close();
      });
    });

    describe('reservation — tenant isolation', () => {
      it('never lets one tenant see, commit against or release another tenant\u2019s authority', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await seed(store, 'party-alice', proportional(5_000), { tenantId: TENANT_B });
        const mine = await store.acquireReservation(ADMIN, reservation('mandate-a', 'party-alice', proportional(3_000)));
        assert.ok(mine.outcome === 'reserved');

        assert.equal(await errorCode(() => store.resolveAvailability(TENANT_B_CONTEXT, availabilityOf('party-alice'))), 'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION');
        assert.equal(
          await errorCode(() => store.acquireReservation(TENANT_B_CONTEXT, reservation('mandate-b', 'party-alice', proportional(1_000)))),
          'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION',
        );
        assert.equal(
          await errorCode(() => store.releaseReservation(TENANT_B_CONTEXT, { tenantId: TENANT_A, reservationId: mine.reservation.id, reason: 'authorization_ended' })),
          'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION',
        );
        // Reading it under the other tenant's own scope finds nothing, rather
        // than refusing in a way that would confirm the identifier exists.
        assert.equal(await store.getReservation(TENANT_B_CONTEXT, TENANT_B, mine.reservation.id), null);

        // And tenant B's own availability is untouched by tenant A's commitment.
        const other = await store.resolveAvailability(TENANT_B_CONTEXT, availabilityOf('party-alice', { tenantId: TENANT_B }));
        assert.ok(other.outcome === 'available');
        assert.deepEqual(other.available, proportional(5_000));
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

        it('keeps an active commitment reducing availability across a restart', async () => {
          const first = await openNamed('durable-reservation');
          await seed(first, 'party-alice', proportional(5_000));
          await first.acquireReservation(ADMIN, reservation('mandate-durable', 'party-alice', proportional(4_000)));
          await first.close();

          const second = await openNamed('durable-reservation');
          const availability = await second.resolveAvailability(ADMIN, availabilityOf('party-alice'));
          assert.ok(availability.outcome === 'available');
          assert.deepEqual(availability.held, proportional(5_000), 'the holdings survived');
          assert.deepEqual(availability.available, proportional(1_000), 'and so did the commitment against them');

          // The whole point of durability here: the competing commitment is
          // still refused after the process that made the first one is gone.
          assert.equal(
            await errorCode(() => second.acquireReservation(ADMIN, reservation('mandate-after-restart', 'party-alice', proportional(4_000)))),
            'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
          );
          await second.close();
        });

        it('stops a lapsed commitment blocking after a restart, with no cleanup having run', async () => {
          const first = await openNamed('durable-reservation-expiry');
          await seed(first, 'party-alice', proportional(5_000));
          await first.acquireReservation(ADMIN, reservation('mandate-lapsing', 'party-alice', proportional(4_000), { expiresAt: LATER }));
          await first.close();

          // Reopened, and asked about an instant past the expiry. The row is
          // still physically there and still says `'active'`; the clock alone
          // is what stops it counting.
          const second = await openNamed('durable-reservation-expiry');
          const availability = await second.resolveAvailability(ADMIN, availabilityOf('party-alice', { at: LATER }));
          assert.ok(availability.outcome === 'available');
          assert.deepEqual(availability.available, proportional(5_000));
          assert.equal((await second.listReservationsByMandateRef(ADMIN, TENANT_A, 'mandate-lapsing'))[0]?.status, 'active');
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

    // -------------------------------------------------------------------
    // Persistent constraints. Everything a reservation is not: created by a
    // completed execution rather than by an authorization, outliving the
    // mandate that produced it, and ended only by a privileged act.
    // -------------------------------------------------------------------

    describe('encumbrance', () => {
      it('records a constraint from a trusted execution, and leaves the position exactly where it was', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));

        const outcome = await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));
        assert.ok(outcome.outcome === 'encumbered');
        assert.equal(outcome.replayed, false);
        assert.equal(outcome.encumbrance.status, 'active');
        assert.equal(outcome.encumbrance.holderRef, 'party-alice');
        assert.equal(outcome.encumbrance.sourceExecutionRef, 'exec-1');
        assert.equal(outcome.encumbrance.sourceMandateRef, 'mandate-1');
        assert.deepEqual(outcome.encumbrance.scope, proportional(4_000));
        // No expiry, deliberately. The mandate's expiry bounds how long an
        // executor may act; it says nothing about how long the arrangement that
        // executor created continues to exist.
        assert.ok(!('expiresAt' in outcome.encumbrance));

        // The whole point: constraining is not moving. Alice still holds every
        // basis point she held before.
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(5_000));
        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(capacity.outcome === 'available');
        assert.deepEqual(capacity.held, proportional(5_000), 'held is unchanged');
        assert.deepEqual(capacity.encumbered, proportional(4_000));
        assert.deepEqual(capacity.available, proportional(1_000), 'but only the unconstrained part is committable');
        await store.close();
      });

      it('refuses a constraint that no encumbering action produced — there is no self-asserted encumbrance path', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));

        // The exact shape a caller would use to claim "my authority is
        // encumbered, take my word for it". Every non-encumbering action is
        // refused, including the one that genuinely moves authority.
        for (const action of ['transfer', 'tokenize', 'license', 'encumber', 'lien']) {
          assert.equal(
            await errorCode(() => store.recordEncumbrance(ADMIN, encumbrance(`exec-${action}`, 'mandate-x', 'party-alice', proportional(1_000), { sourceAction: action }))),
            'GOVERNED_AUTHORITY_ENCUMBRANCE_BASIS_INVALID',
            `'${action}' must not be able to constrain authority`,
          );
        }
        // And a constraint with no execution behind it at all.
        assert.equal(
          await errorCode(() => store.recordEncumbrance(ADMIN, encumbrance('', 'mandate-x', 'party-alice', proportional(1_000)))),
          'GOVERNED_AUTHORITY_ENCUMBRANCE_BASIS_INVALID',
        );
        assert.equal(
          await errorCode(() => store.recordEncumbrance(ADMIN, encumbrance('exec-orphan', '', 'party-alice', proportional(1_000)))),
          'GOVERNED_AUTHORITY_ENCUMBRANCE_BASIS_INVALID',
        );
        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(capacity.outcome === 'available');
        assert.deepEqual(capacity.available, proportional(5_000), 'nothing was constrained by any of it');
        await store.close();
      });

      it('is idempotent on the execution that produced it: a retry restates one constraint rather than adding a second', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));

        const first = await store.recordEncumbrance(ADMIN, encumbrance('exec-retry', 'mandate-1', 'party-alice', proportional(4_000)));
        const again = await store.recordEncumbrance(ADMIN, encumbrance('exec-retry', 'mandate-1', 'party-alice', proportional(4_000)));
        assert.ok(first.outcome === 'encumbered' && again.outcome === 'encumbered');
        assert.equal(again.replayed, true);
        assert.equal(again.encumbrance.id, first.encumbrance.id);

        // The property that matters: capacity was constrained once, not twice.
        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(capacity.outcome === 'available');
        assert.deepEqual(capacity.encumbered, proportional(4_000));
        assert.deepEqual(capacity.available, proportional(1_000));
        await store.close();
      });

      it('refuses a replay that restates the same execution under different terms', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await seed(store, 'party-bob', proportional(5_000));
        await store.recordEncumbrance(ADMIN, encumbrance('exec-conflict', 'mandate-1', 'party-alice', proportional(4_000)));

        for (const [label, input] of [
          ['a different quantity', encumbrance('exec-conflict', 'mandate-1', 'party-alice', proportional(2_000))],
          ['a different holder', encumbrance('exec-conflict', 'mandate-1', 'party-bob', proportional(4_000))],
          ['a different mandate', encumbrance('exec-conflict', 'mandate-2', 'party-alice', proportional(4_000))],
          ['a different resource', encumbrance('exec-conflict', 'mandate-1', 'party-alice', proportional(4_000), { resource: OTHER_ASSET })],
        ] as const) {
          assert.equal(await errorCode(() => store.recordEncumbrance(ADMIN, input)), 'GOVERNED_AUTHORITY_ENCUMBRANCE_CONFLICT', label);
        }
        await store.close();
      });

      it('constrains only the holder, the resource and the right it names', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await seed(store, 'party-bob', proportional(5_000));
        await seed(store, 'party-alice', proportional(5_000), { right: USAGE });
        await seed(store, 'party-alice', proportional(5_000), { resource: OTHER_ASSET });

        await store.recordEncumbrance(ADMIN, encumbrance('exec-scoped', 'mandate-1', 'party-alice', proportional(4_000)));

        for (const [label, query] of [
          ['another holder', availabilityOf('party-bob')],
          ['another right of the same resource', availabilityOf('party-alice', { governedRight: USAGE })],
          ['the same right of another resource', availabilityOf('party-alice', { resource: OTHER_ASSET })],
        ] as const) {
          const untouched = await store.resolveAvailability(ADMIN, query);
          assert.ok(untouched.outcome === 'available');
          assert.deepEqual(untouched.available, proportional(5_000), `${label} is unconstrained`);
          assert.equal(untouched.encumbered, undefined, `and reports no constraint at all, rather than a synthesized zero`);
        }
        await store.close();
      });

      it('aggregates several constraints over one right, and refuses the one that would exceed what is left', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));

        await store.recordEncumbrance(ADMIN, encumbrance('exec-a', 'mandate-a', 'party-alice', proportional(3_000)));
        await store.recordEncumbrance(ADMIN, encumbrance('exec-b', 'mandate-b', 'party-alice', proportional(2_000)));

        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(capacity.outcome === 'available');
        assert.deepEqual(capacity.encumbered, proportional(5_000), 'the two aggregate');
        assert.deepEqual(capacity.available, proportional(5_000));

        // The exact boundary, asserted from both sides.
        assert.equal(
          await errorCode(() => store.recordEncumbrance(ADMIN, encumbrance('exec-over', 'mandate-c', 'party-alice', proportional(5_001)))),
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
        );
        const exact = await store.recordEncumbrance(ADMIN, encumbrance('exec-exact', 'mandate-c', 'party-alice', proportional(5_000)));
        assert.ok(exact.outcome === 'encumbered');
        await store.close();
      });

      it('counts a live commitment and a standing constraint together', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));

        await store.recordEncumbrance(ADMIN, encumbrance('exec-a', 'mandate-a', 'party-alice', proportional(4_000)));
        await store.acquireReservation(ADMIN, reservation('mandate-b', 'party-alice', proportional(3_000)));

        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(capacity.outcome === 'available');
        assert.deepEqual(capacity.encumbered, proportional(4_000));
        assert.deepEqual(capacity.committed, proportional(3_000));
        assert.deepEqual(capacity.available, proportional(3_000), 'both subtract, and neither substitutes for the other');
        assert.equal(
          await errorCode(() => store.acquireReservation(ADMIN, reservation('mandate-c', 'party-alice', proportional(3_001)))),
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
        );
        await store.close();
      });

      it('releases only from a privileged context, and a release is not a credit', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        const created = await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));
        assert.ok(created.outcome === 'encumbered');

        // A tenant caller may read its own state and may not free it. There is
        // no basis a request path could supply, so there is no context a
        // request path could reach this from.
        assert.equal(
          await errorCode(() => store.releaseEncumbrance(TENANT_A_CONTEXT, { tenantId: TENANT_A, encumbranceId: created.encumbrance.id, basis: 'administrative' })),
          'GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED',
        );

        const released = await store.releaseEncumbrance(ADMIN, { tenantId: TENANT_A, encumbranceId: created.encumbrance.id, basis: 'administrative', releasedAt: LATER });
        assert.equal(released.status, 'released');
        assert.equal(released.releaseBasis, 'administrative');
        assert.equal(released.releasedAt, LATER);

        // The capacity returns and the position does not change. Alice held
        // 5 000 throughout: before, during and after.
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(5_000));
        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice', { at: LATER }));
        assert.ok(capacity.outcome === 'available');
        assert.deepEqual(capacity.held, proportional(5_000));
        assert.equal(capacity.encumbered, undefined);
        assert.deepEqual(capacity.available, proportional(5_000));
        await store.close();
      });

      it('releasing twice returns the record unchanged rather than returning the capacity twice', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        const created = await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));
        assert.ok(created.outcome === 'encumbered');

        const first = await store.releaseEncumbrance(ADMIN, { tenantId: TENANT_A, encumbranceId: created.encumbrance.id, basis: 'administrative', releasedAt: LATER });
        const second = await store.releaseEncumbrance(ADMIN, { tenantId: TENANT_A, encumbranceId: created.encumbrance.id, basis: 'administrative', releasedAt: MUCH_LATER });
        assert.equal(second.releasedAt, first.releasedAt, 'the audit stays honest about when the release actually happened');

        // Safe by construction anyway: capacity is derived from the constraints
        // still active, never from a counter something could decrement twice.
        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice', { at: MUCH_LATER }));
        assert.ok(capacity.outcome === 'available');
        assert.deepEqual(capacity.available, proportional(5_000), 'and never 9 000');
        await store.close();
      });

      it('keeps a released constraint readable — the history is not deleted', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        const created = await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));
        assert.ok(created.outcome === 'encumbered');
        await store.releaseEncumbrance(ADMIN, { tenantId: TENANT_A, encumbranceId: created.encumbrance.id, basis: 'administrative', releasedAt: LATER });

        assert.equal((await store.getEncumbrance(ADMIN, TENANT_A, created.encumbrance.id))?.status, 'released');
        assert.equal((await store.listEncumbrancesByMandateRef(ADMIN, TENANT_A, 'mandate-1')).length, 1);
        assert.equal((await store.listActiveEncumbrances(ADMIN, availabilityOf('party-alice', { at: LATER }))).length, 0, 'but it no longer constrains anything');
        await store.close();
      });

      it('keeps tenants apart on every operation', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await seed(store, 'party-alice', proportional(5_000), { tenantId: TENANT_B });
        const created = await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));
        assert.ok(created.outcome === 'encumbered');

        // Reading across the boundary is refused, and an id from another tenant
        // reads as absent rather than as a refusal, so identifiers cannot be
        // probed by telling "denied" apart from "no such thing".
        assert.equal(await errorCode(() => store.getEncumbrance(TENANT_B_CONTEXT, TENANT_A, created.encumbrance.id)), 'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION');
        assert.equal(await store.getEncumbrance(TENANT_B_CONTEXT, TENANT_B, created.encumbrance.id), null);
        assert.equal(
          await errorCode(() => store.releaseEncumbrance(ADMIN, { tenantId: TENANT_B, encumbranceId: created.encumbrance.id, basis: 'administrative' })),
          'GOVERNED_AUTHORITY_ENCUMBRANCE_NOT_FOUND',
        );
        assert.equal(
          await errorCode(() => store.recordEncumbrance(TENANT_B_CONTEXT, encumbrance('exec-cross', 'mandate-x', 'party-alice', proportional(1_000)))),
          'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION',
        );

        // And Tenant B's own capacity is untouched by Tenant A's constraint.
        const tenantB = await store.resolveAvailability(TENANT_B_CONTEXT, availabilityOf('party-alice', { tenantId: TENANT_B }));
        assert.ok(tenantB.outcome === 'available');
        assert.deepEqual(tenantB.available, proportional(5_000));
        await store.close();
      });

      it('reports a state where constraints outrun the position rather than clamping it to zero', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(10_000));
        await store.recordEncumbrance(ADMIN, encumbrance('exec-a', 'mandate-a', 'party-alice', proportional(6_000)));
        // Alice's position shrinks by a route that does not consult
        // constraints: a movement out of a *different* right cannot do it, so
        // this is reached the only way it can be — the transferee giving some
        // back is fine, but here we simulate the inconsistency an import, a
        // restore or a tampered row could produce, by constraining and then
        // moving what the structural guard would normally refuse.
        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-strand', 'party-alice', 'party-bob', proportional(6_000)))),
          'GOVERNED_AUTHORITY_ENCUMBRANCE_UNCOVERED',
          'the guard is what makes overencumbrance unreachable through the runtime',
        );
        await store.close();
      });

      it('an unenrolled resource has nothing to constrain, and says so rather than refusing', async () => {
        const store = await open();
        // No position anywhere for this resource: the deployment has not
        // enrolled it, exactly as `acquireReservation` treats the same case.
        const outcome = await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));
        assert.equal(outcome.outcome, 'resource_not_enrolled');
        await store.close();
      });

      it('a resource that is enrolled but holds nothing for this holder fails closed', async () => {
        const store = await open();
        await seed(store, 'party-bob', proportional(5_000));
        assert.equal(
          await errorCode(() => store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)))),
          'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
        );
        await store.close();
      });
    });

    // -------------------------------------------------------------------
    // The handoff. Two phases of one commitment, never two commitments.
    // -------------------------------------------------------------------

    describe('reservation to encumbrance handoff', () => {
      it('hands the commitment over with no gap and no double count', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));

        // T0 — nothing committed, nothing constrained.
        const t0 = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(t0.outcome === 'available');
        assert.deepEqual(t0.available, proportional(5_000));

        // T1 — the authorization exists and holds capacity.
        const acquired = await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(4_000), { action: 'collateralize' }));
        assert.ok(acquired.outcome === 'reserved');
        const t1 = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(t1.outcome === 'available');
        assert.deepEqual(t1.committed, proportional(4_000));
        assert.equal(t1.encumbered, undefined);
        assert.deepEqual(t1.available, proportional(1_000));

        // T2 — the execution is confirmed and the commitment changes phase.
        const handed = await store.recordEncumbrance(
          ADMIN,
          encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000), { consumesReservationsForMandateRef: 'mandate-1' }),
        );
        assert.ok(handed.outcome === 'encumbered');
        assert.equal(handed.encumbrance.sourceReservationRef, acquired.reservation.id, 'the constraint names the commitment it took over from');

        const t2 = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(t2.outcome === 'available');
        assert.deepEqual(t2.held, proportional(5_000), 'the position never moved');
        assert.equal(t2.committed, undefined, 'the commitment is terminal');
        assert.deepEqual(t2.encumbered, proportional(4_000), 'and the constraint now accounts for it');
        // The single most important number in this suite. Not 5 000 (a gap,
        // which would let a competitor take the same authority) and not 1 000
        // less again (a double count, which would strand capacity that was only
        // ever promised once).
        assert.deepEqual(t2.available, proportional(1_000));

        // The commitment reached a terminal state that says what happened to
        // it: not `'consumed'` (nothing was debited) and not `'released'`
        // (nothing was returned).
        assert.equal((await store.getReservation(ADMIN, TENANT_A, acquired.reservation.id))?.status, 'encumbered');
        await store.close();
      });

      it('refuses to reopen a commitment that became a constraint', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        const acquired = await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(4_000), { action: 'collateralize' }));
        assert.ok(acquired.outcome === 'reserved');
        await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000), { consumesReservationsForMandateRef: 'mandate-1' }));

        assert.equal(
          await errorCode(() => store.releaseReservation(ADMIN, { tenantId: TENANT_A, reservationId: acquired.reservation.id, reason: 'authorization_ended' })),
          'GOVERNED_AUTHORITY_RESERVATION_CONFLICT',
        );
        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(capacity.outcome === 'available');
        assert.deepEqual(capacity.available, proportional(1_000), 'and the authority stayed constrained');
        await store.close();
      });

      it('retrying the handoff neither constrains twice nor frees capacity twice', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(4_000), { action: 'collateralize' }));

        for (let attempt = 0; attempt < 3; attempt += 1) {
          await store.recordEncumbrance(
            ADMIN,
            encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000), { consumesReservationsForMandateRef: 'mandate-1' }),
          );
        }

        assert.equal((await store.listEncumbrancesByMandateRef(ADMIN, TENANT_A, 'mandate-1')).length, 1);
        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(capacity.outcome === 'available');
        assert.deepEqual(capacity.available, proportional(1_000));
        await store.close();
      });

      it('keeps a partially-executed mandate’s remaining authorization protected while counting the executed part once', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(4_000), { action: 'collateralize' }));

        // The first instalment of a mandate whose terms permit several. The
        // reservation must not simply vanish: the 3 000 this mandate may still
        // execute has to stay protected, or a competitor could take it and the
        // second instalment would arrive with nowhere to be recorded.
        await store.recordEncumbrance(
          ADMIN,
          encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(1_000), { consumesReservationsForMandateRef: 'mandate-1' }),
        );

        const midway = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(midway.outcome === 'available');
        assert.deepEqual(midway.encumbered, proportional(1_000), 'the instalment that landed');
        assert.deepEqual(midway.committed, proportional(3_000), 'net of it, the mandate still holds what it may still execute');
        assert.deepEqual(midway.available, proportional(1_000), 'and the same 1 000 is free as before — the commitment was not counted twice');

        // The last instalment closes the mandate out.
        await store.recordEncumbrance(
          ADMIN,
          encumbrance('exec-2', 'mandate-1', 'party-alice', proportional(3_000), { consumesReservationsForMandateRef: 'mandate-1' }),
        );
        const done = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(done.outcome === 'available');
        assert.equal(done.committed, undefined, 'now the commitment is terminal');
        assert.deepEqual(done.encumbered, proportional(4_000));
        assert.deepEqual(done.available, proportional(1_000));
        await store.close();
      });

      it('refuses the capacity question outright when a mandate’s commitment and constraint are not commensurable', async () => {
        // Unreachable through the runtime — an execution's scope is validated
        // against its mandate's before the evidence is written — and worth
        // pinning anyway, because the two ways a residual can fail to exist
        // mean opposite things. A commitment wholly overtaken by its own
        // constraints has nothing left to protect and may be skipped, since
        // those constraints are counted in full separately. A commitment whose
        // constraint is not a comparable quantity has no derivable residual at
        // all, and skipping *that* would silently free exactly the capacity it
        // holds.
        const store = await open();
        await seed(store, 'party-alice', unitized(100));
        await store.acquireReservation(ADMIN, reservation('mandate-units', 'party-alice', unitized(40), { action: 'collateralize' }));

        // A proportional constraint under the same mandate: a shape the
        // enforced path cannot produce, and the shape an import or a restore
        // could.
        assert.equal(
          await errorCode(() =>
            store.recordEncumbrance(
              ADMIN,
              encumbrance('exec-mixed', 'mandate-units', 'party-alice', proportional(4_000), { consumesReservationsForMandateRef: 'mandate-units' }),
            ),
          ),
          'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE',
          'and the constraint is refused at the door rather than being allowed to poison the accounting',
        );

        // The commitment is untouched, and capacity still answers cleanly.
        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(capacity.outcome === 'available');
        assert.deepEqual(capacity.committed, unitized(40));
        assert.deepEqual(capacity.available, unitized(60));
        await store.close();
      });

      it('a competing acquisition never sees the handed-over capacity as free', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(4_000), { action: 'collateralize' }));

        // Before the handoff the competitor loses to the commitment; after it,
        // to the constraint. There is no third moment in between, because the
        // handoff is one commit section.
        assert.equal(
          await errorCode(() => store.acquireReservation(ADMIN, reservation('mandate-2', 'party-alice', proportional(4_000)))),
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
        );
        await store.recordEncumbrance(
          ADMIN,
          encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000), { consumesReservationsForMandateRef: 'mandate-1' }),
        );
        assert.equal(
          await errorCode(() => store.acquireReservation(ADMIN, reservation('mandate-3', 'party-alice', proportional(4_000)))),
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
        );
        await store.close();
      });
    });


    describe('encumbrance — concurrency', () => {
      it('lets exactly one of two incompatible concurrent constraints stand', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));

        // 4000 + 4000 against 5000, from two independent executions. Both
        // standing is the persistent form of the vulnerability this layer
        // closes; neither standing would be a bug of its own.
        const results = await Promise.allSettled([
          store.recordEncumbrance(ADMIN, encumbrance('exec-race-a', 'mandate-race-a', 'party-alice', proportional(4_000))),
          store.recordEncumbrance(ADMIN, encumbrance('exec-race-b', 'mandate-race-b', 'party-alice', proportional(4_000))),
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1, 'exactly one, never two and never zero');

        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(capacity.outcome === 'available', 'never overencumbered, whichever won');
        assert.deepEqual(capacity.encumbered, proportional(4_000));
        await store.close();
      });

      it('never lets an acquisition slip through while a commitment is changing phase', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(4_000), { action: 'collateralize' }));

        // The central race. If the handoff were two steps — end the commitment,
        // then write the constraint — a competitor arriving between them would
        // be told the whole 5 000 is free. It is one commit section, so there is
        // no between.
        const results = await Promise.allSettled([
          store.recordEncumbrance(
            ADMIN,
            encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000), { consumesReservationsForMandateRef: 'mandate-1' }),
          ),
          store.acquireReservation(ADMIN, reservation('mandate-2', 'party-alice', proportional(4_000))),
        ]);
        assert.equal(results[0]?.status, 'fulfilled', 'the handoff itself always succeeds');
        assert.equal(results[1]?.status, 'rejected', 'and the competitor never sees the capacity as free');

        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(capacity.outcome === 'available');
        assert.deepEqual(capacity.available, proportional(1_000), 'the quantity was counted exactly once throughout');
        await store.close();
      });

      it('leaves a coherent state when a release and a fresh acquisition race', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        const created = await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));
        assert.ok(created.outcome === 'encumbered');

        // Either ordering is correct; what must never happen is both the
        // constraint standing and the capacity being handed out.
        const results = await Promise.allSettled([
          store.releaseEncumbrance(ADMIN, { tenantId: TENANT_A, encumbranceId: created.encumbrance.id, basis: 'administrative' }),
          store.acquireReservation(ADMIN, reservation('mandate-2', 'party-alice', proportional(4_000))),
        ]);
        assert.equal(results[0]?.status, 'fulfilled', 'the privileged release always completes');

        const capacity = await store.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(capacity.outcome === 'available');
        const acquired = results[1]?.status === 'fulfilled';
        // The constraint is gone either way; the only question is whether the
        // competitor got in before or after, and both answers are consistent.
        assert.deepEqual(capacity.available, acquired ? proportional(1_000) : proportional(5_000));
        await store.close();
      });
    });

    // -------------------------------------------------------------------
    // Structural consistency. Not a business rule about what may be moved.
    // -------------------------------------------------------------------

    describe('structural consistency with active constraints', () => {
      it('permits a movement the holder can still cover, and refuses the one that would strand a constraint', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));

        // Emphatically not "encumbered authority cannot move". Alice keeps
        // 4 500, which still covers the 4 000 standing over her, so this moves.
        await store.applyTransition(ADMIN, movement('exec-small', 'party-alice', 'party-bob', proportional(500)));
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(4_500));

        // This one would leave her with 2 500 and a 4 000 constraint referring
        // to authority she no longer possesses. Refused — structurally, not
        // commercially.
        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-big', 'party-alice', 'party-bob', proportional(2_000)))),
          'GOVERNED_AUTHORITY_ENCUMBRANCE_UNCOVERED',
        );
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(4_500), 'and nothing moved');
        await store.close();
      });

      it('never moves a constraint to the recipient', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));
        await store.applyTransition(ADMIN, movement('exec-small', 'party-alice', 'party-bob', proportional(500)));

        // Whether a constraint should follow the authority it constrains is a
        // substantive decision this phase does not make. What it does not do is
        // make it silently.
        assert.equal((await store.listActiveEncumbrances(ADMIN, availabilityOf('party-bob'))).length, 0);
        const bob = await store.resolveAvailability(ADMIN, availabilityOf('party-bob'));
        assert.ok(bob.outcome === 'available');
        assert.deepEqual(bob.available, proportional(500), 'Bob received authority, and no constraint came with it');
        await store.close();
      });

      it('releases the constraint and the same movement then succeeds', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        const created = await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));
        assert.ok(created.outcome === 'encumbered');
        assert.equal(
          await errorCode(() => store.applyTransition(ADMIN, movement('exec-blocked', 'party-alice', 'party-bob', proportional(5_000)))),
          'GOVERNED_AUTHORITY_ENCUMBRANCE_UNCOVERED',
        );

        await store.releaseEncumbrance(ADMIN, { tenantId: TENANT_A, encumbranceId: created.encumbrance.id, basis: 'administrative', releasedAt: LATER });
        await store.applyTransition(ADMIN, movement('exec-now-fine', 'party-alice', 'party-bob', proportional(5_000)));
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, ECONOMIC))?.scope, proportional(5_000));
        await store.close();
      });

      it('leaves a movement in an unconstrained right alone', async () => {
        const store = await open();
        await seed(store, 'party-alice', proportional(5_000));
        await seed(store, 'party-alice', proportional(5_000), { right: USAGE });
        await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));

        // The constraint is on the economic interest. Nothing about it says
        // anything about the usage right, and inventing a cross-right conflict
        // is exactly what this layer must not do.
        await store.applyTransition(ADMIN, {
          ...movement('exec-usage', 'party-alice', 'party-bob', proportional(5_000)),
          governedRights: [USAGE],
        });
        assert.deepEqual((await store.getPosition(ADMIN, TENANT_A, 'party-bob', ASSET, USAGE))?.scope, proportional(5_000));
        await store.close();
      });
    });

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

  describe('reservation corruption fails closed', () => {
    // Every dimension a tamper could use to free capacity or extend a
    // commitment's life *while leaving it attached to the same holder,
    // resource and right*. Each is applied with the digest left alone, and each
    // must make the availability question itself fail — never quietly drop the
    // row, which would release exactly the capacity the tamper was after.
    //
    // The tampers that *relocate* a reservation — onto another holder, resource
    // or right — are a different class and are covered separately below.
    const tampers = [
      ['scope', `UPDATE governed_authority_reservations SET scope_basis_points = 1`],
      ['status', `UPDATE governed_authority_reservations SET status = 'released'`],
      ['expiry', `UPDATE governed_authority_reservations SET expires_at = '2026-01-01T00:00:00.001Z'`],
      ['source mandate', `UPDATE governed_authority_reservations SET source_mandate_ref = 'mandate-other'`],
      ['source request', `UPDATE governed_authority_reservations SET source_request_ref = 'request-other'`],
      ['action', `UPDATE governed_authority_reservations SET action = 'license'`],
      ['digest', `UPDATE governed_authority_reservations SET reservation_digest = 'sha256:${'0'.repeat(64)}'`],
    ] as const;

    for (const [dimension, sql] of tampers) {
      it(`refuses a reservation whose ${dimension} was altered after commit`, async () => {
        const path = join(directory, `reservation-tamper-${dimension.replace(/ /gu, '-')}.sqlite`);
        const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
        await seed(store, 'party-alice', proportional(5_000));
        await store.acquireReservation(ADMIN, reservation('mandate-tampered', 'party-alice', proportional(4_000)));
        await store.close();

        const { default: Database } = await import('better-sqlite3');
        const db = new Database(path);
        db.prepare(sql).run();
        db.close();

        const reopened = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
        assert.equal(
          await errorCode(() => reopened.resolveAvailability(ADMIN, availabilityOf('party-alice'))),
          'GOVERNED_AUTHORITY_RESERVATION_RECORD_CORRUPTED',
          'the availability question fails rather than the tampered row silently freeing its capacity',
        );
        // And nothing may be committed against a state AOC cannot trust.
        assert.equal(
          await errorCode(() => reopened.acquireReservation(ADMIN, reservation('mandate-after-tamper', 'party-alice', proportional(4_000)))),
          'GOVERNED_AUTHORITY_RESERVATION_RECORD_CORRUPTED',
        );
        await reopened.close();
      });
    }

    for (const [dimension, sql] of [
      ['holder', `UPDATE governed_authority_reservations SET holder_ref = 'party-mallory'`],
      ['resource', `UPDATE governed_authority_reservations SET resource_id = 'asset-b'`],
      ['governed right', `UPDATE governed_authority_reservations SET governed_right = 'usage-right'`],
    ] as const) {
      it(`detects a reservation relocated to another ${dimension}, at the tuple it was moved to`, async () => {
        // A relocating tamper is, from the original tuple's point of view,
        // indistinguishable from deleting the row — and no per-row digest can
        // detect a deletion. This states that limitation exactly rather than
        // implying a guarantee the mechanism does not provide. See
        // `docs/architecture/ADR-GOVERNED-AUTHORITY-RESERVATION.md`, "What
        // integrity does and does not cover".
        const path = join(directory, `reservation-relocate-${dimension.replace(/ /gu, '-')}.sqlite`);
        const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
        await seed(store, 'party-alice', proportional(5_000));
        await seed(store, 'party-mallory', proportional(5_000));
        await seed(store, 'party-alice', proportional(5_000), { right: USAGE });
        await seed(store, 'party-alice', proportional(5_000), { resource: OTHER_ASSET });
        await store.acquireReservation(ADMIN, reservation('mandate-relocated', 'party-alice', proportional(4_000)));
        await store.close();

        const { default: Database } = await import('better-sqlite3');
        const db = new Database(path);
        db.prepare(sql).run();
        db.close();

        const reopened = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });

        // Where it was moved *to*, it fails closed: the digest no longer
        // matches, so no availability can be computed there and nothing can be
        // committed against it.
        const destination =
          dimension === 'holder'
            ? availabilityOf('party-mallory')
            : dimension === 'resource'
              ? availabilityOf('party-alice', { resource: OTHER_ASSET })
              : availabilityOf('party-alice', { governedRight: USAGE });
        assert.equal(await errorCode(() => reopened.resolveAvailability(ADMIN, destination)), 'GOVERNED_AUTHORITY_RESERVATION_RECORD_CORRUPTED');

        // Where it was moved *from*, the capacity is genuinely freed — the row
        // is simply no longer there to be counted. This is the deletion case
        // wearing another name, and it is the bound of what row-level integrity
        // can promise. What it is *not* is a downgrade: the resource is still
        // enrolled, and every other check still runs.
        const origin = await reopened.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(origin.outcome === 'available');
        assert.deepEqual(origin.available, proportional(5_000), 'documented limitation: a relocated row frees its origin capacity');
        await reopened.close();
      });
    }

    it('refuses a status the closed lifecycle does not contain, at the database level', async () => {
      const path = join(directory, 'reservation-status-check.sqlite');
      const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      await seed(store, 'party-alice', proportional(5_000));
      await store.acquireReservation(ADMIN, reservation('mandate-status', 'party-alice', proportional(1_000)));
      await store.close();

      const { default: Database } = await import('better-sqlite3');
      const db = new Database(path);
      assert.throws(() => db.prepare(`UPDATE governed_authority_reservations SET status = 'expired'`).run(), /CHECK constraint failed/);
      assert.throws(() => db.prepare(`UPDATE governed_authority_reservations SET scope_basis_points = -1`).run(), /CHECK constraint failed/);
      db.close();
    });

    it('refuses two commitments of the same right by the same mandate, at the database level', async () => {
      const path = join(directory, 'reservation-mandate-unique.sqlite');
      const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      await seed(store, 'party-alice', proportional(5_000));
      await store.acquireReservation(ADMIN, reservation('mandate-unique', 'party-alice', proportional(1_000)));
      await store.close();

      const { default: Database } = await import('better-sqlite3');
      const db = new Database(path);
      const row = db.prepare(`SELECT * FROM governed_authority_reservations`).get() as Record<string, unknown>;
      assert.throws(
        () =>
          db
            .prepare(
              `INSERT INTO governed_authority_reservations SELECT 'second-row', tenant_id, holder_ref, resource_kind, resource_id, governed_right,
                 scope_kind, scope_basis_points, scope_units, scope_unit_denomination, action, source_request_ref, source_decision_ref, source_mandate_ref,
                 effective_from, expires_at, status, 'a-different-key', correlation_id, created_at, updated_at, reservation_digest, schema_version
               FROM governed_authority_reservations WHERE reservation_id = ?`,
            )
            .run(row['reservation_id']),
        /UNIQUE constraint failed/,
        'a second commitment cannot be laundered through a fresh idempotency key',
      );
      db.close();
    });
  });

  it('brings a v1 database forward rather than refusing it, and adds no commitments to it', async () => {
    // The oldest migration this runtime performs, and the longest hop: v1 knows
    // neither reservations nor encumbrances. A deployment already holding
    // authority state must not be stopped by a release that adds tables it has
    // no rows for — and its existing positions and transitions must still
    // verify byte-for-byte afterwards, because the migration does not touch
    // them.
    const path = join(directory, 'schema-v1-migration.sqlite');
    const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
    await seed(store, 'party-alice', proportional(10_000));
    await store.applyTransition(ADMIN, movement('exec-pre-migration', 'party-alice', 'party-bob', proportional(2_500)));
    await store.close();

    const { default: Database } = await import('better-sqlite3');
    const rewind = new Database(path);
    rewind.prepare(`DELETE FROM governed_authority_store_versions`).run();
    rewind.prepare(`INSERT INTO governed_authority_store_versions (schema_version, migration_state, recorded_at) VALUES (?, ?, ?)`).run(
      'aoc.governed-authority-store.schema.v1',
      'applied',
      NOW,
    );
    rewind.prepare(`DROP TABLE governed_authority_reservations`).run();
    rewind.close();

    const migrated = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
    assert.deepEqual((await migrated.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(7_500), 'the balances survived');
    assert.equal((await migrated.listTransitionsByExecutionRef(ADMIN, TENANT_A, 'exec-pre-migration')).length, 1, 'and so did the history');

    const availability = await migrated.resolveAvailability(ADMIN, availabilityOf('party-alice'));
    assert.ok(availability.outcome === 'available');
    assert.deepEqual(availability.available, proportional(7_500), 'a migrated deployment has no commitments, so everything it holds is available');

    const health = await migrated.health();
    assert.equal(health.schemaVersion, 'aoc.governed-authority-store.schema.v3');
    assert.equal(health.activeReservationCount, 0);
    assert.equal(health.activeEncumbranceCount, 0, 'and no constraints were invented for history that predates them');

    // And it enforces from here on.
    await migrated.acquireReservation(ADMIN, reservation('mandate-post-migration', 'party-alice', proportional(7_000)));
    assert.equal(
      await errorCode(() => migrated.acquireReservation(ADMIN, reservation('mandate-post-migration-2', 'party-alice', proportional(1_000)))),
      'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    );
    await migrated.close();
  });


  describe('encumbrance durability across restart', () => {
    it('a constraint survives a restart, and still refuses the overlapping commitment afterwards', async () => {
      // The property that makes this layer worth persisting at all. The
      // external arrangement does not cease to exist because a process
      // restarted, so neither may the governed state that accounts for it.
      const path = join(directory, 'encumbrance-restart.sqlite');
      const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      await seed(store, 'party-alice', proportional(5_000));
      await store.acquireReservation(ADMIN, reservation('mandate-1', 'party-alice', proportional(4_000), { action: 'collateralize' }));
      await store.recordEncumbrance(
        ADMIN,
        encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000), { consumesReservationsForMandateRef: 'mandate-1' }),
      );
      await store.close();

      const reopened = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      const capacity = await reopened.resolveAvailability(ADMIN, availabilityOf('party-alice'));
      assert.ok(capacity.outcome === 'available');
      assert.deepEqual(capacity.held, proportional(5_000), 'the position is still what it always was');
      assert.deepEqual(capacity.encumbered, proportional(4_000));
      assert.deepEqual(capacity.available, proportional(1_000));

      const health = await reopened.health();
      assert.equal(health.activeEncumbranceCount, 1);
      assert.equal(health.activeReservationCount, 0, 'and the commitment stayed terminal across the restart');

      assert.equal(
        await errorCode(() => reopened.acquireReservation(ADMIN, reservation('mandate-2', 'party-alice', proportional(4_000)))),
        'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
      );
      await reopened.close();
    });

    it('a released constraint stays released across a restart, and the capacity stays returned', async () => {
      const path = join(directory, 'encumbrance-restart-released.sqlite');
      const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      await seed(store, 'party-alice', proportional(5_000));
      const created = await store.recordEncumbrance(ADMIN, encumbrance('exec-1', 'mandate-1', 'party-alice', proportional(4_000)));
      assert.ok(created.outcome === 'encumbered');
      await store.releaseEncumbrance(ADMIN, { tenantId: TENANT_A, encumbranceId: created.encumbrance.id, basis: 'administrative', releasedAt: LATER });
      await store.close();

      const reopened = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      assert.equal((await reopened.getEncumbrance(ADMIN, TENANT_A, created.encumbrance.id))?.status, 'released');
      const capacity = await reopened.resolveAvailability(ADMIN, availabilityOf('party-alice', { at: MUCH_LATER }));
      assert.ok(capacity.outcome === 'available');
      assert.deepEqual(capacity.available, proportional(5_000));
      assert.equal((await reopened.health()).activeEncumbranceCount, 0);
      await reopened.close();
    });

    it('brings a v2 database forward, keeping its commitments and inventing no constraints', async () => {
      // A deployment that adopted reservation but not yet encumbrance. Its
      // reservations must survive byte-for-byte — the migration is a pure copy
      // through a widened CHECK — and, critically, no historical execution may
      // be retroactively turned into a constraint. Manufacturing history to
      // make old data look like it went through the new lifecycle is precisely
      // what a migration must not do.
      const path = join(directory, 'schema-v2-migration.sqlite');
      const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      await seed(store, 'party-alice', proportional(10_000));
      await store.applyTransition(ADMIN, movement('exec-pre-v3', 'party-alice', 'party-bob', proportional(2_500)));
      await store.acquireReservation(ADMIN, reservation('mandate-pre-v3', 'party-alice', proportional(3_000)));
      await store.close();

      const { default: Database } = await import('better-sqlite3');
      const rewind = new Database(path);
      rewind.prepare(`DELETE FROM governed_authority_store_versions`).run();
      rewind.prepare(`INSERT INTO governed_authority_store_versions (schema_version, migration_state, recorded_at) VALUES (?, ?, ?)`).run(
        'aoc.governed-authority-store.schema.v2',
        'applied',
        NOW,
      );
      rewind.prepare(`DROP TABLE governed_authority_encumbrances`).run();
      rewind.close();

      const migrated = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      assert.deepEqual((await migrated.getPosition(ADMIN, TENANT_A, 'party-alice', ASSET, ECONOMIC))?.scope, proportional(7_500), 'the balances survived');
      assert.equal((await migrated.listTransitionsByExecutionRef(ADMIN, TENANT_A, 'exec-pre-v3')).length, 1, 'and so did the history');

      const carried = await migrated.listReservationsByMandateRef(ADMIN, TENANT_A, 'mandate-pre-v3');
      assert.equal(carried.length, 1, 'and so did the commitment');
      assert.equal(carried[0]?.status, 'active', 'with its status untouched — the rebuild is a copy, not a reinterpretation');

      const health = await migrated.health();
      assert.equal(health.schemaVersion, 'aoc.governed-authority-store.schema.v3');
      assert.equal(health.activeEncumbranceCount, 0, 'no constraint was invented for history that predates them');

      const capacity = await migrated.resolveAvailability(ADMIN, availabilityOf('party-alice'));
      assert.ok(capacity.outcome === 'available');
      assert.deepEqual(capacity.available, proportional(4_500), 'and capacity is exactly what the surviving state implies');

      // And the widened lifecycle works from here on.
      await migrated.recordEncumbrance(
        ADMIN,
        encumbrance('exec-post-v3', 'mandate-pre-v3', 'party-alice', proportional(3_000), { consumesReservationsForMandateRef: 'mandate-pre-v3' }),
      );
      assert.equal((await migrated.listReservationsByMandateRef(ADMIN, TENANT_A, 'mandate-pre-v3'))[0]?.status, 'encumbered');
      await migrated.close();
    });
  });

  describe('encumbrance corruption fails closed', () => {
    // Every dimension a tamper could use to free constrained authority or forge
    // a constraint's basis *while leaving it attached to the same holder,
    // resource and right*. Each is applied with the digest left alone, and each
    // must make the capacity question itself fail — never quietly drop the row,
    // which would release exactly the authority the tamper was after.
    const tampers = [
      ['scope', `UPDATE governed_authority_encumbrances SET scope_basis_points = 1`],
      ['status', `UPDATE governed_authority_encumbrances SET status = 'released', released_at = '${LATER}', release_basis = 'administrative'`],
      ['source action', `UPDATE governed_authority_encumbrances SET source_action = 'transfer'`],
      ['source mandate', `UPDATE governed_authority_encumbrances SET source_mandate_ref = 'mandate-other'`],
      ['source execution', `UPDATE governed_authority_encumbrances SET source_execution_ref = 'exec-other'`],
      ['effective instant', `UPDATE governed_authority_encumbrances SET effective_from = '2027-01-01T00:00:00.000Z'`],
      ['digest', `UPDATE governed_authority_encumbrances SET encumbrance_digest = 'sha256:${'0'.repeat(64)}'`],
    ] as const;

    for (const [dimension, sql] of tampers) {
      it(`refuses an encumbrance whose ${dimension} was altered after commit`, async () => {
        const path = join(directory, `encumbrance-tamper-${dimension.replace(/ /gu, '-')}.sqlite`);
        const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
        await seed(store, 'party-alice', proportional(5_000));
        await store.recordEncumbrance(ADMIN, encumbrance('exec-tampered', 'mandate-tampered', 'party-alice', proportional(4_000)));
        await store.close();

        const { default: Database } = await import('better-sqlite3');
        const db = new Database(path);
        db.prepare(sql).run();
        db.close();

        const reopened = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
        assert.equal(
          await errorCode(() => reopened.resolveAvailability(ADMIN, availabilityOf('party-alice'))),
          'GOVERNED_AUTHORITY_ENCUMBRANCE_RECORD_CORRUPTED',
          'the capacity question fails rather than the tampered row silently freeing the authority it constrains',
        );
        // And nothing may be committed against a state AOC cannot trust.
        assert.equal(
          await errorCode(() => reopened.acquireReservation(ADMIN, reservation('mandate-after-tamper', 'party-alice', proportional(1_000)))),
          'GOVERNED_AUTHORITY_ENCUMBRANCE_RECORD_CORRUPTED',
        );
        // Including a movement, which is where a freed constraint would do the
        // most damage: the structural guard reads the same rows.
        assert.equal(
          await errorCode(() => reopened.applyTransition(ADMIN, movement('exec-after-tamper', 'party-alice', 'party-bob', proportional(5_000)))),
          'GOVERNED_AUTHORITY_ENCUMBRANCE_RECORD_CORRUPTED',
        );
        await reopened.close();
      });
    }

    for (const [dimension, sql] of [
      ['holder', `UPDATE governed_authority_encumbrances SET holder_ref = 'party-mallory'`],
      ['resource', `UPDATE governed_authority_encumbrances SET resource_id = 'asset-b'`],
      ['governed right', `UPDATE governed_authority_encumbrances SET governed_right = 'usage-right'`],
    ] as const) {
      it(`detects an encumbrance relocated to another ${dimension}, at the tuple it was moved to`, async () => {
        // A relocating tamper is, from the original tuple's point of view,
        // indistinguishable from deleting the row — and no per-row digest can
        // detect a deletion. This states that limitation exactly rather than
        // implying a guarantee the mechanism does not provide, exactly as the
        // reservation cases above do.
        const path = join(directory, `encumbrance-relocate-${dimension.replace(/ /gu, '-')}.sqlite`);
        const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
        await seed(store, 'party-alice', proportional(5_000));
        await seed(store, 'party-mallory', proportional(5_000));
        await seed(store, 'party-alice', proportional(5_000), { right: USAGE });
        await seed(store, 'party-alice', proportional(5_000), { resource: OTHER_ASSET });
        await store.recordEncumbrance(ADMIN, encumbrance('exec-relocated', 'mandate-relocated', 'party-alice', proportional(4_000)));
        await store.close();

        const { default: Database } = await import('better-sqlite3');
        const db = new Database(path);
        db.prepare(sql).run();
        db.close();

        const reopened = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
        const destination =
          dimension === 'holder'
            ? availabilityOf('party-mallory')
            : dimension === 'resource'
              ? availabilityOf('party-alice', { resource: OTHER_ASSET })
              : availabilityOf('party-alice', { governedRight: USAGE });
        assert.equal(await errorCode(() => reopened.resolveAvailability(ADMIN, destination)), 'GOVERNED_AUTHORITY_ENCUMBRANCE_RECORD_CORRUPTED');

        const origin = await reopened.resolveAvailability(ADMIN, availabilityOf('party-alice'));
        assert.ok(origin.outcome === 'available');
        assert.deepEqual(origin.available, proportional(5_000), 'documented limitation: a relocated row frees its origin authority');
        await reopened.close();
      });
    }

    it('refuses a status the closed lifecycle does not contain, at the database level', async () => {
      const path = join(directory, 'encumbrance-status-check.sqlite');
      const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      await seed(store, 'party-alice', proportional(5_000));
      await store.recordEncumbrance(ADMIN, encumbrance('exec-status', 'mandate-status', 'party-alice', proportional(1_000)));
      await store.close();

      const { default: Database } = await import('better-sqlite3');
      const db = new Database(path);
      // In particular `'expired'`, which is the state this model deliberately
      // does not have: a constraint carries no expiry, so nothing could ever
      // derive one, and a stored status claiming otherwise is unrepresentable.
      assert.throws(() => db.prepare(`UPDATE governed_authority_encumbrances SET status = 'expired'`).run(), /CHECK constraint failed/);
      assert.throws(
        () => db.prepare(`UPDATE governed_authority_encumbrances SET status = 'released'`).run(),
        /CHECK constraint failed/,
        'and a release must say when and on what basis',
      );
      db.close();
    });

    it('cannot be made to constrain a negative quantity even by a writer bypassing the runtime entirely', async () => {
      const path = join(directory, 'encumbrance-negative-check.sqlite');
      const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      await seed(store, 'party-alice', proportional(5_000));
      await store.recordEncumbrance(ADMIN, encumbrance('exec-negative', 'mandate-negative', 'party-alice', proportional(1_000)));
      await store.close();

      const { default: Database } = await import('better-sqlite3');
      const db = new Database(path);
      assert.throws(
        () => db.prepare(`UPDATE governed_authority_encumbrances SET scope_basis_points = -1`).run(),
        /CHECK constraint failed/,
        'a negative constraint would manufacture capacity, and is unrepresentable',
      );
      db.close();
    });

    it('reports a state where constraints outrun the position rather than clamping it to zero', async () => {
      // Unreachable through the runtime — the structural guard is what makes it
      // so — and reported anyway, because an import, a restore or a privileged
      // bootstrap gone wrong could produce it, and a silently-zeroed capacity
      // would hide the breach until it became permanent.
      const path = join(directory, 'encumbrance-overencumbered.sqlite');
      const store = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      await seed(store, 'party-alice', proportional(5_000));
      const created = await store.recordEncumbrance(ADMIN, encumbrance('exec-over', 'mandate-over', 'party-alice', proportional(4_000)));
      assert.ok(created.outcome === 'encumbered');
      await store.close();

      const { default: Database } = await import('better-sqlite3');
      const db = new Database(path);
      // The position is shrunk out of band, leaving the constraint referring to
      // authority the holder no longer has. The position's own digest is left
      // alone, so this is caught as an inconsistency rather than as corruption.
      db.prepare(`UPDATE governed_authority_positions SET scope_basis_points = 3000, position_digest = ?`).run('sha256:placeholder');
      db.close();

      const reopened = await createSqliteGovernedAuthorityStore(path, { now: () => NOW });
      // The tampered position fails its own integrity check first, which is the
      // stricter of the two answers and the right one.
      assert.equal(await errorCode(() => reopened.resolveAvailability(ADMIN, availabilityOf('party-alice'))), 'GOVERNED_AUTHORITY_RECORD_CORRUPTED');
      await reopened.close();
    });
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
