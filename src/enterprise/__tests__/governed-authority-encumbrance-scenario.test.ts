import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GovernedRightType } from '@aoc-enterprise/governed-authorization';

import { isAuthorityGovernanceError } from '../authority-governance/errors.js';
import {
  ADMIN_CONTEXT,
  ALICE,
  BOB,
  CAROL,
  ENTERPRISE_COLLATERALIZE_CAPABILITY,
  GA_ASSET,
  GA_ASSET_SCOPE,
  GA_DELEGATE_ACTOR_ID,
  GA_DELEGATE_PASSPORT_ID,
  GA_DELEGATE_TOKEN_ID,
  GA_MANAGER_ACTOR_ID,
  GA_MANAGER_GRANT_ID,
  GA_NOW,
  GA_SECOND_MANAGER_ACTOR_ID,
  GA_TENANT_A,
  GA_TRUST_DOMAIN_ID,
  GOVERNED_RIGHT_TYPES,
  TENANT_CONTEXT,
  buildGovernedAuthorityWorld,
  collateralizationRequest,
  collateralizationTerms,
  grantRepresentation,
  heldScope,
  seedPosition,
  transferRequest,
  transferTerms,
  upTo,
  type GovernedAuthorityWorld,
} from './governed-authority-support.js';

/**
 * The sixth authority question, measured end to end against the real runtimes.
 *
 * The five before it remain separate, and none of them could answer this one:
 *
 * ```
 * A  action authority         may this actor invoke this action on this resource?
 * B  derived authority        through what bounded, still-live chain does it hold A?
 * C  representative authority may this requester exercise THAT holder's authority?
 * D  holder authority         does the holder control this right, and enough of it?
 * E  available authority      is enough of what the holder controls still uncommitted?
 * F  unencumbered authority   is enough of it still unconstrained by an action that
 *                             has ALREADY executed?
 * ```
 *
 * F exists because E is a *pre-execution* question. A reservation ends when its
 * mandate does, and for `TRANSFER` that is right: the execution debits the
 * position, so the new position is the new reality and there is nothing left to
 * account for. `COLLATERALIZE` is not like that. Executing it debits nothing —
 * Alice keeps every basis point she held — while creating an arrangement that
 * outlives the mandate entirely. Release the reservation at execution and the
 * store reports the whole position free again, at exactly the moment the
 * encumbrance becomes real.
 *
 * The suite therefore opens by measuring that hole against the deployment that
 * has not adopted the constraint layer, so the closing behaviour is a
 * difference rather than an assertion.
 *
 * Every world below is the real Kernel, the real Recognition Runtime, the real
 * Authority Graph, the real Governance Store and the real mandate stores.
 */

const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;

function bp(basisPoints: number) {
  return { kind: 'proportional', basisPoints } as const;
}

/** Submits a collateralization request and returns the outcome, without asserting anything about it. */
async function request(
  world: GovernedAuthorityWorld,
  requestId: string,
  basisPoints: number,
  overrides: Record<string, unknown> = {},
  rights: readonly GovernedRightType[] = [ECONOMIC],
  holderRef: string = ALICE,
) {
  return world.collateralization.requestCollateralization(
    TENANT_CONTEXT,
    GA_TENANT_A,
    collateralizationRequest(requestId, holderRef, collateralizationTerms(rights, bp(basisPoints)), overrides),
  );
}

/** Submits a collateralization request that must be authorized, and returns its mandate. */
async function issue(
  world: GovernedAuthorityWorld,
  requestId: string,
  basisPoints: number,
  overrides: Record<string, unknown> = {},
  rights: readonly GovernedRightType[] = [ECONOMIC],
  holderRef: string = ALICE,
) {
  const outcome = await request(world, requestId, basisPoints, overrides, rights, holderRef);
  assert.equal(outcome.status, 'allowed', `expected ${requestId} to be authorized`);
  assert.ok(outcome.mandate !== undefined);
  return outcome.mandate;
}

/** The error code a refused request produced, or a clear failure if it was not refused. */
async function refusalCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    assert.ok(isAuthorityGovernanceError(error), `expected an AuthorityGovernanceError, received ${String(error)}`);
    return error.code;
  }
  assert.fail('expected the commitment to be refused');
}

/** The external executor reports it created exactly the arrangement the mandate authorized. */
function conformingCollateralExecution(
  mandateId: string,
  basisPoints: number,
  rights: readonly GovernedRightType[] = [ECONOMIC],
  overrides: Record<string, unknown> = {},
) {
  return {
    mandateId,
    executorRef: 'provider-collateral-platform-c',
    executedAt: GA_NOW,
    securedObligationRef: 'obligation-001',
    securedPartyRef: 'party-lender-b',
    committedScope: bp(basisPoints),
    rights,
    externalRegistry: 'registry-alpha',
    ...overrides,
  };
}

/** What still constrains a holder's authority, at the reference instant. */
async function constraining(world: GovernedAuthorityWorld, holderRef = ALICE, governedRight: GovernedRightType = ECONOMIC) {
  return world.authorityStore.listActiveEncumbrances(ADMIN_CONTEXT, {
    tenantId: GA_TENANT_A,
    holderRef,
    resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
    governedRight,
    at: GA_NOW,
  });
}

/** What is still committed to a live authorization, at the reference instant. */
async function committed(world: GovernedAuthorityWorld, holderRef = ALICE, governedRight: GovernedRightType = ECONOMIC) {
  return world.authorityStore.listActiveReservations(ADMIN_CONTEXT, {
    tenantId: GA_TENANT_A,
    holderRef,
    resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
    governedRight,
    at: GA_NOW,
  });
}

/** The whole capacity picture, so an assertion can state the shape rather than one number out of it. */
async function capacity(world: GovernedAuthorityWorld, holderRef = ALICE, governedRight: GovernedRightType = ECONOMIC) {
  return world.authorityStore.resolveAvailability(ADMIN_CONTEXT, {
    tenantId: GA_TENANT_A,
    holderRef,
    resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
    governedRight,
    at: GA_NOW,
  });
}

/** What can still be committed, as a plain scope, so assertions read like the scenario they describe. */
async function unencumbered(world: GovernedAuthorityWorld, holderRef = ALICE, governedRight: GovernedRightType = ECONOMIC) {
  const answer = await capacity(world, holderRef, governedRight);
  assert.ok(answer.outcome === 'available', `expected available capacity, got '${answer.outcome}'`);
  return answer.available;
}

// ---------------------------------------------------------------------------
// 1. The hole, measured against the deployment that has not adopted the layer.
// ---------------------------------------------------------------------------

describe('Encumbrance — the post-execution hole this layer closes', () => {
  it('1. BEFORE: two independent mandates each collateralize the same authority, because a mandate’s committed scope is mandate-local', async () => {
    const world = buildGovernedAuthorityWorld({ withoutCollateralAuthorityEncumbrance: true });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    const a = await issue(world, 'before-a', 4_000);
    const executedA = await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(a.id, 4_000));
    assert.deepEqual(executedA.mandate.committedScope, bp(4_000));

    // Nothing anywhere records that 4 000 of Alice's authority is spoken for.
    assert.equal((await committed(world)).length, 0);
    assert.equal((await constraining(world)).length, 0);
    assert.deepEqual(await unencumbered(world), bp(5_000), 'the store reports the whole position free');

    // So a second, entirely independent mandate commits the same authority
    // again — 8 000 bp of live collateral against a 5 000 bp position.
    const b = await issue(world, 'before-b', 4_000);
    const executedB = await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(b.id, 4_000));
    assert.deepEqual(executedB.mandate.committedScope, bp(4_000), 'mandate B’s cumulative scope cannot see mandate A’s');
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000));
  });

  it('2. AFTER: the same second mandate is refused, and the position is still untouched', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    const a = await issue(world, 'after-a', 4_000);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(a.id, 4_000));

    const standing = await constraining(world);
    assert.equal(standing.length, 1);
    assert.deepEqual(standing[0]?.scope, bp(4_000));
    assert.equal(standing[0]?.holderRef, ALICE);
    assert.equal(standing[0]?.sourceMandateRef, a.id);
    assert.deepEqual(await unencumbered(world), bp(1_000));

    assert.equal(await refusalCode(() => request(world, 'after-b', 4_000)), 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT');

    // And the thing that must not have happened: Alice's underlying authority
    // is exactly what it was. Constraining is not moving.
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000));
    assert.equal(await heldScope(world, 'party-lender-b', ECONOMIC), null, 'the secured party holds nothing');
    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, ECONOMIC), null, 'and neither does the requester');
  });
});

// ---------------------------------------------------------------------------
// 2. The mandatory end-to-end trace, one instant at a time.
// ---------------------------------------------------------------------------

describe('Encumbrance — the mandatory 5000 / 4000 / 4000 scenario', () => {
  it('3. traces held, committed, constrained and free through every phase, with no gap and no double count', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    // T0 — nothing committed, nothing constrained.
    assert.deepEqual(await unencumbered(world), bp(5_000));

    // T1 — the authorization exists and holds capacity, pre-execution.
    const mandate = await issue(world, 'trace-a', 4_000);
    const t1 = await capacity(world);
    assert.ok(t1.outcome === 'available');
    assert.deepEqual(t1.held, bp(5_000));
    assert.deepEqual(t1.committed, bp(4_000));
    assert.equal(t1.encumbered, undefined, 'nothing has executed yet, so nothing is constrained');
    assert.deepEqual(t1.available, bp(1_000));

    // T2 — the execution is confirmed and the commitment changes phase.
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(mandate.id, 4_000));
    const t2 = await capacity(world);
    assert.ok(t2.outcome === 'available');
    assert.deepEqual(t2.held, bp(5_000), 'the position never moved');
    assert.equal(t2.committed, undefined, 'the pre-execution commitment is terminal');
    assert.deepEqual(t2.encumbered, bp(4_000), 'and the persistent constraint accounts for it now');
    // The single most important number in this suite. Never 5 000 — a gap,
    // which would let a competitor take the same authority — and never 1 000
    // less again, which would strand capacity only ever promised once.
    assert.deepEqual(t2.available, bp(1_000));

    // The commitment reached a terminal state that says what happened to it:
    // not `'consumed'` (nothing was debited) and not `'released'` (nothing came
    // back).
    const held = await world.authorityStore.listReservationsByMandateRef(ADMIN_CONTEXT, GA_TENANT_A, mandate.id);
    assert.equal(held.length, 1);
    assert.equal(held[0]?.status, 'encumbered');

    // T3 — a legitimate discharge. Capacity returns; the position does not
    // change, because it never changed in the first place.
    const [constraint] = await constraining(world);
    assert.ok(constraint !== undefined);
    await world.authorityStore.releaseEncumbrance(ADMIN_CONTEXT, {
      tenantId: GA_TENANT_A,
      encumbranceId: constraint.id,
      basis: { kind: 'administrative', assertedBy: 'actor-administrator', reasonCode: 'operator-withdrawal' } as const,
    });
    const t3 = await capacity(world);
    assert.ok(t3.outcome === 'available');
    assert.deepEqual(t3.held, bp(5_000), 'still 5 000 — never 9 000');
    assert.deepEqual(t3.available, bp(5_000));
    await issue(world, 'trace-b', 4_000);
  });

  it('4. the exact boundary: what is left fits, and one basis point more does not', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const a = await issue(world, 'boundary-a', 3_000);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(a.id, 3_000));

    assert.equal(await refusalCode(() => request(world, 'boundary-over', 2_001)), 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT');
    await issue(world, 'boundary-exact', 2_000);
    assert.deepEqual(await unencumbered(world), bp(0));
  });

  it('5. several constraints over one right aggregate', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(10_000));

    const a = await issue(world, 'multi-a', 3_000);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(a.id, 3_000));
    const b = await issue(world, 'multi-b', 2_000);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(b.id, 2_000));

    const answer = await capacity(world);
    assert.ok(answer.outcome === 'available');
    assert.deepEqual(answer.encumbered, bp(5_000), 'the two aggregate');
    assert.deepEqual(answer.available, bp(5_000));
    assert.equal(await refusalCode(() => request(world, 'multi-c', 5_001)), 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT');
    await issue(world, 'multi-d', 5_000);

    // No priority, seniority or ranking anywhere: two constraints coexist
    // exactly insofar as the holder's authority permits, and nothing orders
    // them. Ranking collateral is legal policy Soberanía does not hold.
    assert.equal((await constraining(world)).length, 2);
  });
});

// ---------------------------------------------------------------------------
// 3. The defining cross-mandate property.
// ---------------------------------------------------------------------------

describe('Encumbrance — a constraint outlives the mandate that created it', () => {
  it('6. a new mandate sees a constraint whose own mandate is exhausted and revoked', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    const a = await issue(world, 'outlive-a', 4_000);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(a.id, 4_000));

    // Mandate A is now exhausted as an authorization *and* revoked, so nothing
    // about it authorizes anything any more. The arrangement its executor
    // created does not cease to exist because Soberanía withdrew permission to create
    // more of them — which is exactly why revocation is not release.
    await world.collateralization.revokeMandate(TENANT_CONTEXT, { mandateId: a.id, reason: 'authorization withdrawn', requestedBy: GA_MANAGER_ACTOR_ID });
    assert.equal((await world.collateralization.getMandate(TENANT_CONTEXT, a.id)).status, 'revoked');

    assert.equal((await constraining(world)).length, 1, 'the constraint is untouched by the revocation');
    assert.deepEqual(await unencumbered(world), bp(1_000));
    assert.equal(await refusalCode(() => request(world, 'outlive-b', 4_000)), 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT');
  });

  it('7. cancelling BEFORE execution returns the capacity and leaves no constraint at all', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    const mandate = await issue(world, 'cancel-a', 4_000);
    assert.deepEqual(await unencumbered(world), bp(1_000));

    await world.collateralization.revokeMandate(TENANT_CONTEXT, { mandateId: mandate.id, reason: 'withdrawn', requestedBy: GA_MANAGER_ACTOR_ID });

    const released = await world.authorityStore.listReservationsByMandateRef(ADMIN_CONTEXT, GA_TENANT_A, mandate.id);
    assert.equal(released[0]?.status, 'released', 'the commitment ended without anything having been committed downstream');
    assert.equal((await constraining(world)).length, 0, 'and nothing executed, so nothing is constrained');
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000));
    assert.deepEqual(await unencumbered(world), bp(5_000));
    await issue(world, 'cancel-b', 4_000);
  });

  it('8. an execution retried does not constrain twice', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const mandate = await issue(world, 'retry-a', 4_000);

    const execution = conformingCollateralExecution(mandate.id, 4_000, [ECONOMIC], { executionId: 'execution-fixed' });
    await world.collateralization.recordExecution(TENANT_CONTEXT, execution);
    await assert.rejects(
      () => world.collateralization.recordExecution(TENANT_CONTEXT, execution),
      'the mandate store refuses the replay before it reaches the authority layer twice',
    );

    assert.equal((await constraining(world)).length, 1);
    assert.deepEqual(await unencumbered(world), bp(1_000));
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000));
  });

  it('9. concurrent authorizations cannot both hold the same authority', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    const outcomes = await Promise.allSettled([request(world, 'race-a', 4_000), request(world, 'race-b', 4_000)]);
    const authorized = outcomes.filter((outcome) => outcome.status === 'fulfilled' && outcome.value.mandate !== undefined);
    assert.equal(authorized.length, 1, 'exactly one authorization artifact exists');
    assert.equal((await committed(world)).length, 1);

    // The winner executes; the loser is still refused afterwards, now by the
    // constraint rather than by the commitment.
    const winner = authorized[0];
    assert.ok(winner?.status === 'fulfilled' && winner.value.mandate !== undefined);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(winner.value.mandate.id, 4_000));
    assert.equal(await refusalCode(() => request(world, 'race-c', 4_000)), 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT');
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000), 'and never 8 000 of live collateral against 5 000');
  });
});

// ---------------------------------------------------------------------------
// 4. One pool per holder, however many routes reach it.
// ---------------------------------------------------------------------------

describe('Encumbrance — every route to a holder draws on one constrained pool', () => {
  it('10. the direct holder cannot bypass a constraint over her own authority', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const a = await issue(world, 'direct-a', 4_000);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(a.id, 4_000));

    // Alice submitting for herself, rather than the manager submitting for her.
    // Being the holder is not an exemption: it is her authority that is
    // constrained, and who asks changes nothing about how much is left.
    assert.equal(
      await refusalCode(() =>
        request(world, 'direct-b', 4_000, {
          requestedBy: ALICE,
          context: { passportId: 'passport-alice', capabilityTokenId: 'cap-alice-governed-actions' },
        }),
      ),
      'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    );
  });

  it('11. a second, independently granted representation does not open a second constrained pool', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    for (const representative of [GA_MANAGER_ACTOR_ID, GA_SECOND_MANAGER_ACTOR_ID]) {
      await grantRepresentation(world, representative, ALICE, [ECONOMIC], {
        scopeLimit: upTo(5_000),
        actions: [ENTERPRISE_COLLATERALIZE_CAPABILITY],
        idempotencyKey: `representation-${representative}`,
      });
    }

    const a = await issue(world, 'siblings-a', 3_000);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(a.id, 3_000));

    // Two bindings, granted independently, neither aware of the other — and
    // each nominally permitting the whole 5 000. What is left after the first
    // one's execution is still 2 000, because a representation is permission to
    // exercise a holder's authority, never a second allocation of it. Both
    // representations name the same `holderRef`, so both constrain and consult
    // the same record.
    assert.deepEqual(await unencumbered(world), bp(2_000));
    assert.equal(await refusalCode(() => request(world, 'siblings-b', 3_000)), 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT');
    assert.equal((await constraining(world)).length, 1);
    await issue(world, 'siblings-c', 2_000);
  });

  it('12. a delegated representative draws on the same pool as a direct one, and acquires nothing itself', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true, managerDelegationDepth: 2 });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    world.authorityRuntime.createDelegationGrant({
      id: 'delegation-manager-to-agent-collateral',
      delegatorActorId: GA_MANAGER_ACTOR_ID,
      delegateActorId: GA_DELEGATE_ACTOR_ID,
      delegateActorType: 'agent',
      trustDomainId: GA_TRUST_DOMAIN_ID,
      sourceAuthorityGrantId: GA_MANAGER_GRANT_ID,
      capability: ENTERPRISE_COLLATERALIZE_CAPABILITY,
      actions: [ENTERPRISE_COLLATERALIZE_CAPABILITY],
      resourceScopes: [GA_ASSET_SCOPE],
      canRedelegate: false,
    });
    await grantRepresentation(world, GA_DELEGATE_ACTOR_ID, ALICE, [ECONOMIC], {
      scopeLimit: upTo(5_000),
      actions: [ENTERPRISE_COLLATERALIZE_CAPABILITY],
    });
    const asAgent = { requestedBy: GA_DELEGATE_ACTOR_ID, context: { passportId: GA_DELEGATE_PASSPORT_ID, capabilityTokenId: GA_DELEGATE_TOKEN_ID } };

    const mandate = await issue(world, 'delegated-a', 4_000, asAgent);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(mandate.id, 4_000));

    // The constraint is against Alice, and against nobody else on the path.
    const [constraint] = await constraining(world);
    assert.equal(constraint?.holderRef, ALICE);
    assert.equal((await constraining(world, GA_DELEGATE_ACTOR_ID)).length, 0, 'the representative is constrained by nothing');
    assert.equal(await heldScope(world, GA_DELEGATE_ACTOR_ID, ECONOMIC), null, 'and holds nothing');
    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, ECONOMIC), null, 'and neither does the delegator');

    // A genuinely different, separately valid lineage reaching the same holder:
    // the manager acting directly under its own representation, rather than the
    // agent acting under a delegation from it. It draws on the same constrained
    // pool, so 4 000 no longer fits — and 1 000 does.
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], {
      scopeLimit: upTo(5_000),
      actions: [ENTERPRISE_COLLATERALIZE_CAPABILITY],
      idempotencyKey: 'representation-manager-direct',
    });
    assert.equal(await refusalCode(() => request(world, 'delegated-b', 4_000)), 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT');
    await issue(world, 'delegated-c', 1_000);
  });

  it('13. a constraint binds one holder, one resource and one right, and nothing else', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    await seedPosition(world, ALICE, USAGE, bp(5_000));
    await seedPosition(world, BOB, ECONOMIC, bp(5_000));
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000), { resource: { kind: 'asset', id: 'governed-asset-b' } });

    const a = await issue(world, 'bound-a', 4_000);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(a.id, 4_000));

    assert.deepEqual(await unencumbered(world, BOB), bp(5_000), 'another holder is unconstrained');
    assert.deepEqual(await unencumbered(world, ALICE, USAGE), bp(5_000), 'another right of the same resource is unconstrained');
    const otherResource = await world.authorityStore.resolveAvailability(ADMIN_CONTEXT, {
      tenantId: GA_TENANT_A,
      holderRef: ALICE,
      resource: { kind: 'asset', id: 'governed-asset-b' },
      governedRight: ECONOMIC,
      at: GA_NOW,
    });
    assert.ok(otherResource.outcome === 'available');
    assert.deepEqual(otherResource.available, bp(5_000), 'and so is the same right of another resource');
  });
});

// ---------------------------------------------------------------------------
// 5. What a constraint cannot do.
// ---------------------------------------------------------------------------

describe('Encumbrance — a constraint can only ever narrow', () => {
  it('14. it cannot rescue a request that had no action authority, no representation, or no holder authority', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    // No representation granted at all: the manager may invoke COLLATERALIZE,
    // and may not exercise Alice's authority. Denied before any capacity
    // question is reached — and nothing is committed or constrained on the way
    // out.
    const unrepresented = await request(world, 'narrow-a', 1_000);
    assert.equal(unrepresented.status, 'denied');
    assert.equal((await committed(world)).length, 0, 'a denial commits nothing');
    assert.equal((await constraining(world)).length, 0, 'and constrains nothing');

    // A holder with no position at all. Ample free capacity elsewhere in the
    // deployment does not manufacture authority for her.
    const strangerless = await request(world, 'narrow-b', 1_000, {}, [ECONOMIC], CAROL);
    assert.equal(strangerless.status, 'denied');
    assert.equal((await constraining(world, CAROL)).length, 0);
  });

  it('15. it is created only by a completed execution, never by a decision or a mandate', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    const mandate = await issue(world, 'basis-a', 4_000);
    // An allowed decision and an issued mandate. Neither is an execution, and
    // neither constrains anything: what exists at this point is a pre-execution
    // commitment, which is a different record with a different lifecycle.
    assert.equal((await constraining(world)).length, 0);
    assert.equal((await committed(world)).length, 1);

    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(mandate.id, 4_000));
    const [constraint] = await constraining(world);
    assert.ok(constraint !== undefined);
    assert.equal(constraint.sourceAction, ENTERPRISE_COLLATERALIZE_CAPABILITY);
    assert.equal(constraint.sourceMandateRef, mandate.id);

    // The lineage is complete and reference-based: request -> decision ->
    // reservation -> mandate -> execution -> constraint, with no object
    // duplicated along the way.
    const executions = await world.collateralization.listExecutions(TENANT_CONTEXT, mandate.id);
    assert.equal(constraint.sourceExecutionRef, executions[0]?.id);
    const commitment = await world.authorityStore.getReservation(ADMIN_CONTEXT, GA_TENANT_A, constraint.sourceReservationRef ?? '');
    assert.equal(commitment?.sourceMandateRef, mandate.id);
    assert.equal(commitment?.sourceRequestRef, 'basis-a');
  });

  it('16. it constrains what the execution actually committed, not what the mandate permitted', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    // Authorized for 4 000; the executor reports it committed 1 000.
    const mandate = await issue(world, 'actual-a', 4_000);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(mandate.id, 1_000));

    const [constraint] = await constraining(world);
    assert.deepEqual(constraint?.scope, bp(1_000), 'what was committed, not what was permitted');

    // The mandate's terms forbid a second arrangement, so its remaining 3 000
    // stays committed to it rather than becoming free — which is the netting
    // rule doing its job: 5 000 less the 3 000 still authorized less the 1 000
    // already constrained.
    const answer = await capacity(world);
    assert.ok(answer.outcome === 'available');
    assert.deepEqual(answer.encumbered, bp(1_000));
    assert.deepEqual(answer.committed, bp(3_000));
    assert.deepEqual(answer.available, bp(1_000), 'and the 1 000 is not subtracted twice');
  });
});

// ---------------------------------------------------------------------------
// 6. Structural consistency with TRANSFER. Not an inter-action business rule.
// ---------------------------------------------------------------------------

describe('Encumbrance — structural consistency with an authority-changing action', () => {
  async function encumberedWorld(): Promise<GovernedAuthorityWorld> {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const mandate = await issue(world, 'structural-collateral', 4_000);
    await world.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(mandate.id, 4_000));
    return world;
  }

  it('17. a transfer the holder can still cover proceeds — this is not "collateralized authority cannot move"', async () => {
    const world = await encumberedWorld();

    // Alice keeps 4 500, which still covers the 4 000 standing over her. Soberanía
    // holds no rule about whether encumbered property may change hands; that is
    // domain and legal policy, and inventing one here would be inventing law.
    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('structural-small', transferTerms(ALICE, BOB, [ECONOMIC], bp(500))),
    );
    assert.equal(outcome.status, 'allowed');
  });

  it('18. a transfer that would strand the constraint is refused, structurally', async () => {
    const world = await encumberedWorld();

    // 2 000 would leave Alice with 3 000 and a 4 000 constraint referring to
    // authority she no longer possesses. That is not a judgement about
    // collateral: it is a refusal to leave Soberanía holding a record of nothing.
    assert.equal(
      await refusalCode(() =>
        world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('structural-big', transferTerms(ALICE, BOB, [ECONOMIC], bp(2_000)))),
      ),
      'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    );
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000), 'and nothing moved');
    assert.equal(await heldScope(world, BOB, ECONOMIC), null);
  });

  it('19. a completed transfer never carries the constraint to the recipient', async () => {
    const world = await encumberedWorld();
    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('structural-move', transferTerms(ALICE, BOB, [ECONOMIC], bp(500))),
    );
    assert.ok(outcome.mandate !== undefined);
    await world.transfer.recordExecution(TENANT_CONTEXT, {
      mandateId: outcome.mandate.id,
      executedBy: 'provider-transfer-agent-c',
      executedAt: GA_NOW,
      transferorRef: ALICE,
      transfereeRef: BOB,
      rights: [ECONOMIC],
      transferredScope: bp(500),
      transferEffectiveAt: GA_NOW,
      registry: 'registry-alpha',
    });

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(4_500));
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), bp(500));

    // Whether a constraint should follow the authority it constrains is a
    // substantive decision this phase does not make. What it does not do is
    // make it silently.
    assert.equal((await constraining(world, BOB)).length, 0);
    assert.deepEqual(await unencumbered(world, BOB), bp(500), 'Bob received authority, and no constraint came with it');
    assert.deepEqual(await unencumbered(world), bp(500), 'Alice keeps 4 500, of which 4 000 is still constrained');
  });

  it('20. a successful TRANSFER leaves no constraint of its own', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-only', transferTerms(ALICE, BOB, [ECONOMIC], bp(2_000))),
    );
    assert.ok(outcome.mandate !== undefined);
    await world.transfer.recordExecution(TENANT_CONTEXT, {
      mandateId: outcome.mandate.id,
      executedBy: 'provider-transfer-agent-c',
      executedAt: GA_NOW,
      transferorRef: ALICE,
      transfereeRef: BOB,
      rights: [ECONOMIC],
      transferredScope: bp(2_000),
      transferEffectiveAt: GA_NOW,
      registry: 'registry-alpha',
    });

    // The transition *is* the new reality: Alice holds 3 000 and that is the
    // whole of what is true about her. A constraint on top of it would subtract
    // the same movement twice.
    assert.equal((await constraining(world)).length, 0);
    assert.equal((await constraining(world, BOB)).length, 0);
    const commitments = await world.authorityStore.listReservationsByMandateRef(ADMIN_CONTEXT, GA_TENANT_A, outcome.mandate.id);
    assert.equal(commitments[0]?.status, 'consumed', 'consumed, not encumbered — the position was debited');
    assert.deepEqual(await unencumbered(world), bp(3_000));
  });
});
