import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GovernedRightType } from '@aoc-enterprise/governed-authorization';

import { AOC_KERNEL_REASON_CODES } from '../../kernel/index.js';
import { isAuthorityGovernanceError } from '../authority-governance/errors.js';
import { GOVERNED_AUTHORITY_CONSERVING_ACTIONS, governedActionCommitsAuthority, governedActionConservesAuthority } from '../authority-governance/reservation-lifecycle.js';
import { GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS, governedActionEncumbersAuthority } from '../authority-governance/encumbrance-lifecycle.js';
import {
  ALICE,
  BOB,
  CAROL,
  ENTERPRISE_COLLATERALIZE_CAPABILITY,
  ENTERPRISE_LICENSE_CAPABILITY,
  ENTERPRISE_TOKENIZE_CAPABILITY,
  ENTERPRISE_TRANSFER_CAPABILITY,
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
  conformingExecution,
  grantRepresentation,
  heldScope,
  licenseRequest,
  licenseTerms,
  seedPosition,
  tokenizationRequest,
  tokenizationTerms,
  transferRequest,
  transferTerms,
  upTo,
  type GovernedAuthorityWorld,
} from './governed-authority-support.js';

/**
 * The fifth authority question, measured end to end against the real runtimes.
 *
 * The four that came before remain separate, and none of them could answer
 * this one:
 *
 * ```
 * A  action authority         may this actor invoke this action on this resource?
 * B  derived authority        through what bounded, still-live chain does it hold A?
 * C  representative authority may this requester exercise THAT holder's authority?
 * D  holder authority         does the holder control this right, and enough of it?
 * E  available authority      is enough of what the holder controls still uncommitted?
 * ```
 *
 * E exists because D is answered against a *position*, and a position does not
 * change when a mandate is issued. Two requests could therefore each observe
 * Alice's whole 5 000 bp, each conclude that 4 000 fits, and each be
 * authorized — leaving AOC having told two counterparties they could move the
 * same authority. Conservation at execution bounded the damage but did not
 * prevent the over-authorization; this suite is about preventing it.
 *
 * Every world below is the real Kernel, the real Recognition Runtime, the real
 * Authority Graph, the real Governance Store and the real mandate stores. The
 * only thing asserted about reservation is what those produce.
 */

const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;

function bp(basisPoints: number) {
  return { kind: 'proportional', basisPoints } as const;
}

function transferOf(basisPoints: number, from = ALICE, to = BOB) {
  return transferTerms(from, to, [ECONOMIC], bp(basisPoints));
}

/** Submits a transfer request and returns the outcome, without asserting anything about it. */
async function request(world: GovernedAuthorityWorld, requestId: string, terms = transferOf(4_000), overrides: Record<string, unknown> = {}) {
  return world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest(requestId, terms, overrides));
}

/** Submits a transfer request that must be authorized, and returns its mandate. */
async function issue(world: GovernedAuthorityWorld, requestId: string, terms = transferOf(4_000), overrides: Record<string, unknown> = {}) {
  const outcome = await request(world, requestId, terms, overrides);
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

/** What is still committed against a holder's authority, at the reference instant. */
async function committed(world: GovernedAuthorityWorld, holderRef = ALICE, governedRight: GovernedRightType = ECONOMIC) {
  return world.authorityStore.listActiveReservations(
    { system: true },
    { tenantId: GA_TENANT_A, holderRef, resource: { kind: GA_ASSET.kind, id: GA_ASSET.id }, governedRight, at: GA_NOW },
  );
}

/** How much of a holder's authority can still be committed, at the reference instant. */
async function available(world: GovernedAuthorityWorld, holderRef = ALICE, governedRight: GovernedRightType = ECONOMIC) {
  const availability = await world.authorityStore.resolveAvailability(
    { system: true },
    { tenantId: GA_TENANT_A, holderRef, resource: { kind: GA_ASSET.kind, id: GA_ASSET.id }, governedRight, at: GA_NOW },
  );
  assert.ok(availability.outcome === 'available', `expected available availability, got '${availability.outcome}'`);
  return availability.available;
}

// ---------------------------------------------------------------------------
// 1. The mandatory acceptance scenario.
// ---------------------------------------------------------------------------

describe('Reservation — the mandatory 5000 / 4000 / 4000 scenario', () => {
  it('1. the first commitment stands, the second is refused, and releasing the first lets it through', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    const first = await issue(world, 'r-1a', transferOf(4_000, ALICE, BOB));
    assert.deepEqual(await available(world), bp(1_000));

    // 4000 does not fit in the 1000 that remains uncommitted, even though Alice
    // plainly still holds 5000.
    assert.equal(
      await refusalCode(() => request(world, 'r-1b', transferOf(4_000, ALICE, CAROL))),
      'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    );
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000), 'and the holder still possesses every bit of it');

    // Withdraw the first authorization; the capacity it was holding comes back.
    await world.transfer.revokeMandate(TENANT_CONTEXT, { mandateId: first.id, reason: 'superseded', requestedBy: GA_MANAGER_ACTOR_ID });
    assert.deepEqual(await available(world), bp(5_000));

    const retried = await issue(world, 'r-1c', transferOf(4_000, ALICE, CAROL));
    assert.notEqual(retried.id, first.id);
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000), 'and still nothing has moved');
  });

  it('2. exact remaining capacity is committable, and one unit more is not', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    await issue(world, 'r-2a', transferOf(3_000, ALICE, BOB));
    assert.deepEqual(await available(world), bp(2_000));

    // 2000 fits exactly.
    await issue(world, 'r-2b', transferOf(2_000, ALICE, CAROL));
    assert.deepEqual(await available(world), bp(0));

    // And then nothing does, not even one basis point.
    assert.equal(await refusalCode(() => request(world, 'r-2c', transferOf(1, ALICE, BOB))), 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT');
    assert.equal((await committed(world)).length, 2);
  });

  it('3. two genuinely concurrent requests produce exactly one live commitment', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    // Both start before either finishes. Before Phase 5.4 both were authorized;
    // the invariant now is exactly one — never two, and never zero.
    const outcomes = await Promise.allSettled([
      request(world, 'r-3a', transferOf(4_000, ALICE, BOB)),
      request(world, 'r-3b', transferOf(4_000, ALICE, CAROL)),
    ]);

    const authorized = outcomes.filter((outcome) => outcome.status === 'fulfilled' && outcome.value.mandate !== undefined);
    assert.equal(authorized.length, 1, 'exactly one authorization artifact exists');

    const standing = await committed(world);
    assert.equal(standing.length, 1);
    assert.deepEqual(await available(world), bp(1_000), 'and the store is never left overcommitted');
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000), 'with nothing moved by either');
  });
});

// ---------------------------------------------------------------------------
// 2. The mandatory TRANSFER end-to-end, through a delegated representative.
// ---------------------------------------------------------------------------

describe('Reservation — the mandatory TRANSFER end to end', () => {
  /** Alice holds 7500 bp; an agent reaches TRANSFER through a delegation from the manager and a representation from Alice. */
  async function delegatedWorld(): Promise<GovernedAuthorityWorld> {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true, managerDelegationDepth: 2 });
    await seedPosition(world, ALICE, ECONOMIC, bp(7_500));
    world.authorityRuntime.createDelegationGrant({
      id: 'delegation-manager-to-agent',
      delegatorActorId: GA_MANAGER_ACTOR_ID,
      delegateActorId: GA_DELEGATE_ACTOR_ID,
      delegateActorType: 'agent',
      trustDomainId: GA_TRUST_DOMAIN_ID,
      sourceAuthorityGrantId: GA_MANAGER_GRANT_ID,
      capability: ENTERPRISE_TRANSFER_CAPABILITY,
      actions: [ENTERPRISE_TRANSFER_CAPABILITY],
      resourceScopes: [GA_ASSET_SCOPE],
      canRedelegate: false,
    });
    await grantRepresentation(world, GA_DELEGATE_ACTOR_ID, ALICE, [ECONOMIC], {
      scopeLimit: upTo(7_500),
      actions: [ENTERPRISE_TRANSFER_CAPABILITY],
    });
    return world;
  }

  const asAgent = { requestedBy: GA_DELEGATE_ACTOR_ID, context: { passportId: GA_DELEGATE_PASSPORT_ID, capabilityTokenId: GA_DELEGATE_TOKEN_ID } };

  it('4. a delegated representative commits the holder’s authority, blocks the next request, and executes exactly once', async () => {
    const world = await delegatedWorld();

    const mandate = await issue(world, 'r-4a', transferOf(5_000, ALICE, BOB), asAgent);

    // The commitment is against Alice — the holder — and against nobody else.
    const standing = await committed(world);
    assert.equal(standing.length, 1);
    assert.equal(standing[0]?.holderRef, ALICE);
    assert.equal(standing[0]?.sourceMandateRef, mandate.id);
    assert.equal(standing[0]?.action, ENTERPRISE_TRANSFER_CAPABILITY);
    assert.equal(await heldScope(world, GA_DELEGATE_ACTOR_ID, ECONOMIC), null, 'the representative acquired nothing');
    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, ECONOMIC), null, 'and neither did the delegator');
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(7_500), 'and Alice still holds everything');
    assert.deepEqual(await available(world), bp(2_500));

    // 3000 no longer fits, though Alice's 7500 would cover it in isolation.
    assert.equal(await refusalCode(() => request(world, 'r-4b', transferOf(3_000, ALICE, CAROL), asAgent)), 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT');

    // Execute the first. The position moves once, and the commitment ends.
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], bp(5_000)));
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(2_500));
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), bp(5_000));
    assert.equal((await committed(world)).length, 0);

    // Availability is now 2500 — the position's own figure, not 2500 minus a
    // commitment that has already been spent.
    assert.deepEqual(await available(world), bp(2_500));
    await issue(world, 'r-4c', transferOf(2_500, ALICE, CAROL), asAgent);
  });

  it('5. cancelling the authorization returns the capacity and moves nothing', async () => {
    const world = await delegatedWorld();
    const mandate = await issue(world, 'r-5a', transferOf(5_000, ALICE, BOB), asAgent);
    assert.deepEqual(await available(world), bp(2_500));

    await world.transfer.revokeMandate(TENANT_CONTEXT, { mandateId: mandate.id, reason: 'withdrawn', requestedBy: GA_MANAGER_ACTOR_ID });

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(7_500), 'the position is untouched by a cancellation');
    assert.equal(await heldScope(world, BOB, ECONOMIC), null);
    assert.deepEqual(await available(world), bp(7_500), 'and the whole of it is committable again');

    const released = await world.authorityStore.listReservationsByMandateRef({ system: true }, GA_TENANT_A, mandate.id);
    assert.equal(released[0]?.status, 'released');

    // Releasing is not accumulating: revoking again is idempotent and cannot
    // free capacity twice. It could not anyway — availability is derived from
    // the commitments still active, not from a counter something could
    // decrement again — and that is exactly why this is safe to re-run.
    const again = await world.transfer.revokeMandate(TENANT_CONTEXT, { mandateId: mandate.id, reason: 'again', requestedBy: GA_MANAGER_ACTOR_ID });
    assert.equal(again.kind, 'already-revoked');
    assert.deepEqual(await available(world), bp(7_500));
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(7_500));
  });

  it('6. an execution retried after a completed movement debits once and consumes once', async () => {
    const world = await delegatedWorld();
    const mandate = await issue(world, 'r-6a', transferOf(5_000, ALICE, BOB), asAgent);

    const execution = conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], bp(5_000), { executionId: 'execution-fixed' });
    await world.transfer.recordExecution(TENANT_CONTEXT, execution);
    await assert.rejects(() => world.transfer.recordExecution(TENANT_CONTEXT, execution), 'the mandate store refuses the replay before it reaches authority twice');

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(2_500));
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), bp(5_000));
    const held = await world.authorityStore.listReservationsByMandateRef({ system: true }, GA_TENANT_A, mandate.id);
    assert.equal(held.length, 1);
    assert.equal(held[0]?.status, 'consumed');

    // Reconciliation is a no-op and does not re-consume anything either.
    assert.deepEqual(await world.transfer.reconcileAuthorityTransitions(TENANT_CONTEXT, mandate.id), []);
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(2_500));
  });

  it('7. the mandate stays valid, and its commitment stays live, after its upstream authority is withdrawn', async () => {
    // Phase 5.3 established that an issued mandate is an authorization artifact
    // in its own right: revoking the delegation or the representation it came
    // through does not retroactively invalidate it. Reservation must not
    // quietly reintroduce a dynamic dependency by releasing capacity the
    // still-valid mandate is relying on.
    const world = await delegatedWorld();
    const mandate = await issue(world, 'r-7a', transferOf(5_000, ALICE, BOB), asAgent);

    world.authorityRuntime.revokeDelegationGrant('delegation-manager-to-agent', GA_MANAGER_ACTOR_ID, 'phase-5-4-scenario');
    const representations = await world.authorityStore.listReservationsByMandateRef({ system: true }, GA_TENANT_A, mandate.id);
    assert.equal(representations[0]?.status, 'active', 'revoking the lineage does not release the commitment');
    assert.deepEqual(await available(world), bp(2_500), 'and the capacity is still unavailable to a competitor');

    // A *new* request through the revoked lineage is denied, as Phase 5.3
    // requires — the temporal boundary is unchanged in both directions.
    const fresh = await request(world, 'r-7b', transferOf(1_000, ALICE, CAROL), asAgent);
    assert.equal(fresh.status, 'denied');

    // And the still-valid mandate still executes.
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], bp(5_000)));
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), bp(5_000));
  });
});

// ---------------------------------------------------------------------------
// 3. One pool per holder, however many routes reach it.
// ---------------------------------------------------------------------------

describe('Reservation — every route to a holder draws on one pool', () => {
  it('8. the direct holder is accounted for exactly as a representative is', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    // No representation involved: Alice's own authority, committed by a request
    // the manager submits for her. Being the holder is not an exemption.
    await issue(world, 'r-8a', transferOf(4_000, ALICE, BOB));
    assert.equal(await refusalCode(() => request(world, 'r-8b', transferOf(4_000, ALICE, CAROL))), 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT');
  });

  it('9. two independent representatives of the same holder compete for the same capacity', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(5_000) });
    await grantRepresentation(world, GA_SECOND_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(5_000) });

    // Two bindings, granted independently, neither aware of the other. They
    // still spend the same 5000 bp, because it is Alice's authority both are
    // exercising.
    await issue(world, 'r-9a', transferOf(3_000, ALICE, BOB));
    assert.equal(await refusalCode(() => request(world, 'r-9b', transferOf(3_000, ALICE, CAROL))), 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT');
    assert.equal((await committed(world)).length, 1);
  });

  it('10. different holders, resources and rights stay independent', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    await seedPosition(world, BOB, ECONOMIC, bp(5_000));
    await seedPosition(world, ALICE, USAGE, bp(5_000));

    await issue(world, 'r-10a', transferOf(4_000, ALICE, CAROL));

    assert.deepEqual(await available(world, BOB), bp(5_000), 'Bob is not reduced by Alice’s commitment');
    assert.deepEqual(await available(world, ALICE, USAGE), bp(5_000), 'and neither is Alice’s usage right');

    // Bob may still commit his own, in full.
    await issue(world, 'r-10b', transferTerms(BOB, CAROL, [ECONOMIC], bp(5_000)));
    assert.deepEqual(await available(world, BOB), bp(0));
    assert.deepEqual(await available(world, ALICE), bp(1_000), 'and Alice is unaffected by Bob’s');
  });
});

// ---------------------------------------------------------------------------
// 4. Reservation narrows and never widens.
// ---------------------------------------------------------------------------

describe('Reservation — narrowing only, and never a rescue', () => {
  it('11. no commitment is created when action authority fails', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    // An actor with no capability token and no grant.
    const denied = await request(world, 'r-11', transferOf(1_000, ALICE, BOB), {
      requestedBy: 'actor-unauthorized-administrator',
      context: { passportId: 'passport-unauthorized-administrator' },
    });
    assert.equal(denied.status, 'denied');
    assert.equal((await committed(world)).length, 0, 'a denial leaks no commitment');
    assert.deepEqual(await available(world), bp(5_000));
  });

  it('12. no commitment is created when holder-bound representation fails', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    // The manager represents Alice, but the request names Bob as transferor.
    await seedPosition(world, BOB, ECONOMIC, bp(5_000));
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(5_000) });

    const denied = await request(world, 'r-12', transferTerms(BOB, CAROL, [ECONOMIC], bp(1_000)));
    assert.equal(denied.status, 'denied');
    assert.ok(denied.reasonCodes.includes(AOC_KERNEL_REASON_CODES.AUTHORITY_REPRESENTATION_MISSING));
    assert.equal((await committed(world, BOB)).length, 0, 'and emphatically none against the holder that was named');
    assert.deepEqual(await available(world, BOB), bp(5_000));
  });

  it('13. no commitment is created when the holder does not hold the right at all', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, USAGE, bp(5_000));

    // The resource is enrolled by the usage-right position, so the economic
    // interest is enforced strictly.
    const denied = await request(world, 'r-13', transferOf(1_000, ALICE, BOB));
    assert.equal(denied.status, 'denied');
    assert.ok(denied.reasonCodes.includes(AOC_KERNEL_REASON_CODES.AUTHORITY_GOVERNED_RIGHT_MISSING));
    assert.equal((await committed(world, ALICE, USAGE)).length, 0);
  });

  it('14. no commitment is created when the delegated lineage has lapsed', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true, managerDelegationDepth: 2 });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const delegation = world.authorityRuntime.createDelegationGrant({
      id: 'delegation-lapsing',
      delegatorActorId: GA_MANAGER_ACTOR_ID,
      delegateActorId: GA_DELEGATE_ACTOR_ID,
      delegateActorType: 'agent',
      trustDomainId: GA_TRUST_DOMAIN_ID,
      sourceAuthorityGrantId: GA_MANAGER_GRANT_ID,
      capability: ENTERPRISE_TRANSFER_CAPABILITY,
      actions: [ENTERPRISE_TRANSFER_CAPABILITY],
      resourceScopes: [GA_ASSET_SCOPE],
      canRedelegate: false,
    }).id;
    await grantRepresentation(world, GA_DELEGATE_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(5_000), actions: [ENTERPRISE_TRANSFER_CAPABILITY] });
    world.authorityRuntime.revokeDelegationGrant(delegation, GA_MANAGER_ACTOR_ID, 'phase-5-4-scenario');

    const denied = await request(world, 'r-14', transferOf(1_000, ALICE, BOB), {
      requestedBy: GA_DELEGATE_ACTOR_ID,
      context: { passportId: GA_DELEGATE_PASSPORT_ID, capabilityTokenId: GA_DELEGATE_TOKEN_ID },
    });
    assert.equal(denied.status, 'denied');
    assert.equal((await committed(world)).length, 0);
    assert.deepEqual(await available(world), bp(5_000));
  });

  it('15. available capacity never rescues a request the chain already denied', async () => {
    // The matrix, stated as one assertion: with the whole 5000 bp uncommitted
    // and therefore maximally available, each of the four prior proofs failing
    // still denies. Availability can only ever subtract.
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    assert.deepEqual(await available(world), bp(5_000), 'nothing is committed, so capacity is at its maximum');

    // Representation is configured but never granted, so C fails while A, B and
    // D all hold and E is as permissive as it can be.
    const denied = await request(world, 'r-15', transferOf(1_000, ALICE, BOB));
    assert.equal(denied.status, 'denied');
    assert.equal((await committed(world)).length, 0);
  });
});

// ---------------------------------------------------------------------------
// 5. Which actions this applies to, measured rather than assumed.
// ---------------------------------------------------------------------------

describe('Reservation — action applicability', () => {
  it('0. the classification names exactly one conserving action, and it is TRANSFER', () => {
    // The single semantic location, asserted directly. The classifications
    // below are measured behaviourally; this pins the table they are measured
    // against, so a rename or a well-meaning addition cannot quietly change
    // which actions commit capacity.
    //
    // *Conserving* still means exactly one thing and names exactly one action:
    // executing it debits a `GovernedAuthorityPosition`. That is unchanged, and
    // `TRANSFER` is still the only action that does it.
    assert.deepEqual([...GOVERNED_AUTHORITY_CONSERVING_ACTIONS], [ENTERPRISE_TRANSFER_CAPABILITY]);
    assert.equal(governedActionCommitsAuthority(ENTERPRISE_TRANSFER_CAPABILITY), true);

    // *Committing* is the wider question, and `COLLATERALIZE` now answers it
    // yes. This is a deliberate reclassification, not a drift: the earlier
    // finding was that a reservation released at execution would free capacity
    // at exactly the moment the encumbrance became real, which was correct
    // while there was nowhere for the commitment to go. There is now — see
    // `GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS` and the encumbrance suite — so
    // the commitment is handed over rather than released, and withholding
    // reservation from it would leave the cross-mandate hole open instead.
    assert.deepEqual([...GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS], [ENTERPRISE_COLLATERALIZE_CAPABILITY]);
    assert.equal(governedActionCommitsAuthority(ENTERPRISE_COLLATERALIZE_CAPABILITY), true);
    assert.equal(governedActionConservesAuthority(ENTERPRISE_COLLATERALIZE_CAPABILITY), false, 'collateralizing still debits no position');

    for (const capability of [ENTERPRISE_TOKENIZE_CAPABILITY, ENTERPRISE_LICENSE_CAPABILITY]) {
      assert.equal(governedActionCommitsAuthority(capability), false, `${capability} commits no governed authority`);
      assert.equal(governedActionEncumbersAuthority(capability), false, `${capability} constrains no governed authority`);
    }
  });

  it('16. TOKENIZE and LICENSE commit nothing, because neither debits a position nor constrains one', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(10_000));

    // Both draw on Alice's authority and both are authorized against it — and
    // neither moves it nor leaves anything standing over it afterwards, so
    // neither has finite capacity for a competing authorization to overpromise.
    // Committing on their behalf would be inventing a scarcity their own
    // semantics do not have: a tokenization's ceiling is bounded inside its own
    // mandate, and the licence contract records that licensed units
    // deliberately do not accumulate. See `reservation-lifecycle.ts` and
    // `encumbrance-lifecycle.ts` for the per-action evidence.
    const tokenized = await world.tokenization.requestTokenization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      tokenizationRequest('r-16-tokenize', ALICE, tokenizationTerms([ECONOMIC], bp(6_000))),
    );
    const licensed = await world.license.requestLicense(TENANT_CONTEXT, GA_TENANT_A, licenseRequest('r-16-license', ALICE, licenseTerms([ECONOMIC])));

    for (const [action, outcome] of [
      ['TOKENIZE', tokenized],
      ['LICENSE', licensed],
    ] as const) {
      assert.equal(outcome.status, 'allowed', `${action} is still authorized`);
    }
    assert.equal((await committed(world)).length, 0, 'and neither committed any of Alice’s authority');
    assert.deepEqual(await available(world), bp(10_000));

    // Which means a TRANSFER after them still sees the whole position — the
    // deliberate consequence of classifying them as neither conserving nor
    // encumbering, and the reason the ADRs record inter-action conflict policy
    // as a separate, deferred question rather than something generic capacity
    // accounting decides.
    await issue(world, 'r-16-transfer', transferOf(10_000, ALICE, BOB));
  });

  it('16b. COLLATERALIZE now commits, because a successful one leaves the holder’s authority constrained', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(10_000));

    const collateralized = await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest('r-16b-collateral', ALICE, collateralizationTerms([ECONOMIC], bp(6_000))),
    );
    assert.equal(collateralized.status, 'allowed');

    // The measured difference from the previous phase. A collateralization now
    // holds capacity from the moment its mandate exists — and still moves
    // nothing: Alice's position is untouched.
    const held = await committed(world);
    assert.equal(held.length, 1, 'the authorization committed the holder’s capacity');
    assert.equal(held[0]?.action, ENTERPRISE_COLLATERALIZE_CAPABILITY);
    assert.equal(held[0]?.holderRef, ALICE, 'against the holder, never the requester');
    assert.deepEqual(await available(world), bp(4_000));
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(10_000), 'and nothing moved');
  });

  it('17. LICENSE with no fractional scope commits nothing and is not read as the whole', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(1));

    // One basis point covers an unquantified permission exactly as 10 000 would.
    // If reservation had been forced onto LICENSE, an absent scope would have
    // had to become a number, and the only available number would have been
    // 10 000 — which is precisely the synthetic quantity this model refuses.
    const licensed = await world.license.requestLicense(TENANT_CONTEXT, GA_TENANT_A, licenseRequest('r-17', ALICE, licenseTerms([ECONOMIC])));
    assert.equal(licensed.status, 'allowed');
    assert.equal((await committed(world)).length, 0);
    assert.deepEqual(await available(world), bp(1), 'still one basis point, not a fabricated 10 000');
  });
});

// ---------------------------------------------------------------------------
// 6. Legacy compatibility.
// ---------------------------------------------------------------------------

describe('Reservation — enrolment is what turns it on', () => {
  it('18. a resource with no authority state keeps its prior behaviour, and enrolling it enforces from then on', async () => {
    const world = buildGovernedAuthorityWorld();

    // Nothing seeded: this deployment holds no governed authority state for the
    // asset, so there is no capacity to commit and no double commitment to
    // prevent. The request proceeds exactly as it did before this layer.
    await issue(world, 'r-18a', transferOf(4_000, ALICE, BOB));
    await issue(world, 'r-18b', transferOf(4_000, ALICE, CAROL));
    assert.equal((await committed(world)).length, 0, 'and nothing was committed for either');

    // The moment the resource is enrolled, it is enforced — including for the
    // rights nobody was bootstrapped into. Loss of reservation rows could never
    // downgrade it, because enrolment is decided by positions.
    const enrolled = buildGovernedAuthorityWorld();
    await seedPosition(enrolled, ALICE, ECONOMIC, bp(5_000));
    await issue(enrolled, 'r-18c', transferOf(4_000, ALICE, BOB));
    assert.equal(
      await refusalCode(() => request(enrolled, 'r-18d', transferOf(4_000, ALICE, CAROL))),
      'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    );
  });
});
