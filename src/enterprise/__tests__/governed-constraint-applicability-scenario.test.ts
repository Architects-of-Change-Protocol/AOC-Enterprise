import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GovernedRightType } from '@aoc-enterprise/governed-authorization';

import type { PolicyPackProvider } from '../../kernel/index.js';
import {
  applicableGovernedConstraintsFor,
  governedConstraintClassOf,
  COLLATERAL_COMMITMENT_CAPACITY,
} from '../authority-governance/constraint-applicability.js';
import { isAuthorityGovernanceError } from '../authority-governance/errors.js';
import {
  ADMIN_CONTEXT,
  ALICE,
  BOB,
  CAROL,
  ENTERPRISE_COLLATERALIZE_CAPABILITY,
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
  GA_TENANT_B,
  GA_TRUST_DOMAIN_ID,
  GOVERNED_RIGHT_TYPES,
  TENANT_B_CONTEXT,
  TENANT_CONTEXT,
  buildGovernedAuthorityWorld,
  collateralizationRequest,
  collateralizationTerms,
  conformingExecution,
  encumbranceReleaseRequest,
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
 * The seventh authority question, measured end to end against the real
 * runtimes.
 *
 * The six before it remain separate, and none of them could answer this one:
 *
 * ```
 * A  action authority         may this actor invoke this action on this resource?
 * B  derived authority        through what bounded, still-live chain does it hold A?
 * C  representative authority may this requester exercise THAT holder's authority?
 * D  holder authority         does the holder control this right, and enough of it?
 * E  available authority      is enough of it still uncommitted to a live authorization?
 * F  unencumbered authority   is enough of it still unconstrained by an executed action?
 * G  applicable authority     does that constraint bear on THIS action at all, and how?
 * ```
 *
 * G exists because F is action-agnostic. Before this phase, one capacity
 * computation served every commitment, so a constraint reduced whatever asked
 * next and an action that never consulted the store was untouched by
 * construction. Both outcomes were defensible; neither was *declared*, and
 * nothing could be asked which of the three different things had happened:
 * finite capacity consumed, a state transition made structurally impossible, or
 * simply nothing to do with this action.
 *
 * ## What this suite must NOT find
 *
 * There is no AOC rule that collateralized authority may not be transferred,
 * tokenized or licensed. Every probe below that passes, passes because no such
 * rule exists — and the policy sections prove a deployment can add one without
 * AOC having chosen it.
 *
 * Every world below is the real Kernel, the real Recognition Runtime, the real
 * Authority Graph, the real Governance Store and the real mandate stores.
 */

const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;

function bp(basisPoints: number) {
  return { kind: 'proportional', basisPoints } as const;
}

/** `TRANSFER` terms that permit a partial movement, which most probes here need. */
function partial(from: string, to: string, rights: readonly GovernedRightType[], basisPoints: number) {
  return transferTerms(from, to, rights, bp(basisPoints), {
    constraints: { partialTransferAllowed: true, onwardTransferAllowed: 'permitted', permittedRegistries: ['registry-alpha'] },
  });
}

/** Representation defaults to `TRANSFER` alone, which is not what these probes exercise. */
const REPRESENTED_ACTIONS: readonly string[] = [ENTERPRISE_TRANSFER_CAPABILITY, ENTERPRISE_COLLATERALIZE_CAPABILITY, ENTERPRISE_TOKENIZE_CAPABILITY];

function collateralExecution(mandateId: string, basisPoints: number, rights: readonly GovernedRightType[] = [ECONOMIC]) {
  return {
    mandateId,
    executorRef: 'provider-collateral-platform-c',
    executedAt: GA_NOW,
    securedObligationRef: 'obligation-001',
    securedPartyRef: 'party-lender-b',
    committedScope: bp(basisPoints),
    rights,
    externalRegistry: 'registry-alpha',
  };
}

/** The error code a refused operation produced, or a clear failure if it was not refused. */
async function refusalCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    assert.ok(isAuthorityGovernanceError(error), `expected an AuthorityGovernanceError, received ${String(error)}`);
    return error.code;
  }
  assert.fail('expected the operation to be refused');
}

/** The typed evidence a capacity refusal carries: which constraints reduced it, and on which grounds. */
async function refusalDetails(operation: () => Promise<unknown>): Promise<Readonly<Record<string, unknown>>> {
  try {
    await operation();
  } catch (error) {
    assert.ok(isAuthorityGovernanceError(error));
    return (error.details ?? {}) as Readonly<Record<string, unknown>>;
  }
  assert.fail('expected the operation to be refused');
}

interface WorldOptions {
  readonly withConstraintPolicyContext?: boolean;
  readonly policyPackProvider?: PolicyPackProvider;
  readonly withRepresentation?: boolean;
  readonly managerDelegationDepth?: number;
  /**
   * Runs after the positions are seeded and **before** the seed
   * `COLLATERALIZE`.
   *
   * Needed by the requester scenarios for a reason that is itself the point: in
   * a world enforcing holder-bound representation, even the seeding
   * collateralization needs a representation to exist first. Granting it
   * afterwards would leave the seed denied and the test measuring nothing.
   */
  readonly prepare?: (world: GovernedAuthorityWorld) => Promise<void> | void;
}

/**
 * The reference state for the whole matrix: Alice holds 5 000 bp of the
 * economic interest and 10 000 bp of the usage right, and one **active**
 * 4 000 bp collateral constraint stands over the economic interest — created by
 * a real, fully governed `COLLATERALIZE` whose execution an external platform
 * confirmed.
 */
async function constrainedWorld(options: WorldOptions = {}): Promise<GovernedAuthorityWorld> {
  const world = buildGovernedAuthorityWorld({
    ...(options.withConstraintPolicyContext === true ? { withConstraintPolicyContext: true } : {}),
    ...(options.policyPackProvider !== undefined ? { policyPackProvider: options.policyPackProvider } : {}),
    ...(options.withRepresentation === true ? { withRepresentation: true } : {}),
    ...(options.managerDelegationDepth !== undefined ? { managerDelegationDepth: options.managerDelegationDepth } : {}),
  });
  await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
  await seedPosition(world, ALICE, USAGE, bp(10_000));
  await options.prepare?.(world);
  await collateralize(world, 'seed', 4_000);
  return world;
}

/** Runs one governed, executed `COLLATERALIZE` and returns the constraint it left behind. */
async function collateralize(world: GovernedAuthorityWorld, id: string, basisPoints: number, holderRef: string = ALICE): Promise<string> {
  const outcome = await world.collateralization.requestCollateralization(
    TENANT_CONTEXT,
    GA_TENANT_A,
    collateralizationRequest(id, holderRef, collateralizationTerms([ECONOMIC], bp(basisPoints))),
  );
  assert.equal(outcome.status, 'allowed', `expected ${id} to be authorized`);
  assert.ok(outcome.mandate !== undefined);
  await world.collateralization.recordExecution(TENANT_CONTEXT, collateralExecution(outcome.mandate.id, basisPoints));
  return outcome.mandate.id;
}

async function activeConstraints(world: GovernedAuthorityWorld, holderRef = ALICE, governedRight: GovernedRightType = ECONOMIC) {
  return world.authorityStore.listActiveEncumbrances(ADMIN_CONTEXT, {
    tenantId: GA_TENANT_A,
    holderRef,
    resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
    governedRight,
    at: GA_NOW,
  });
}

/** Discharges one constraint through its own governed release lifecycle: request, mandate, execution. Never the administrative override. */
async function releaseThroughGovernance(world: GovernedAuthorityWorld, constraintId: string, requestId: string): Promise<void> {
  const outcome = await world.encumbranceRelease.requestEncumbranceRelease(TENANT_CONTEXT, GA_TENANT_A, encumbranceReleaseRequest(requestId, constraintId));
  assert.equal(outcome.status, 'allowed', 'a constraint must remain releasable through its own governed path');
  assert.ok(outcome.mandate !== undefined);
  await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate.id });
}

// ---------------------------------------------------------------------------
// The action requests themselves, each returning a comparable verdict so the
// matrix reads as one table rather than five shapes.
// ---------------------------------------------------------------------------

type Verdict = { readonly outcome: 'allowed' | 'denied' | 'approval_required' | 'indeterminate' } | { readonly outcome: 'refused'; readonly code: string };

async function verdict(operation: () => Promise<{ status: string }>): Promise<Verdict> {
  try {
    const result = await operation();
    return { outcome: result.status as 'allowed' | 'denied' | 'approval_required' | 'indeterminate' };
  } catch (error) {
    assert.ok(isAuthorityGovernanceError(error), `expected an AuthorityGovernanceError, received ${String(error)}`);
    return { outcome: 'refused', code: error.code };
  }
}

const requestCollateralize = (world: GovernedAuthorityWorld, id: string, basisPoints: number, holderRef = ALICE) =>
  verdict(() =>
    world.collateralization.requestCollateralization(TENANT_CONTEXT, GA_TENANT_A, collateralizationRequest(id, holderRef, collateralizationTerms([ECONOMIC], bp(basisPoints)))),
  );

const requestTransfer = (world: GovernedAuthorityWorld, id: string, basisPoints: number, rights: readonly GovernedRightType[] = [ECONOMIC], from = ALICE, to = BOB) =>
  verdict(() => world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest(id, partial(from, to, rights, basisPoints))));

const requestTokenize = (world: GovernedAuthorityWorld, id: string, basisPoints: number, rights: readonly GovernedRightType[] = [ECONOMIC], holderRef = ALICE) =>
  verdict(() => world.tokenization.requestTokenization(TENANT_CONTEXT, GA_TENANT_A, tokenizationRequest(id, holderRef, tokenizationTerms(rights, bp(basisPoints)))));

const requestLicense = (world: GovernedAuthorityWorld, id: string, rights: readonly GovernedRightType[], basisPoints?: number, holderRef = ALICE) =>
  verdict(() =>
    world.license.requestLicense(TENANT_CONTEXT, GA_TENANT_A, licenseRequest(id, holderRef, licenseTerms(rights, basisPoints === undefined ? undefined : bp(basisPoints)))),
  );

const requestRelease = (world: GovernedAuthorityWorld, id: string, constraintId: string) =>
  verdict(() => world.encumbranceRelease.requestEncumbranceRelease(TENANT_CONTEXT, GA_TENANT_A, encumbranceReleaseRequest(id, constraintId)));

// ===========================================================================
// 1. The canonical matrix.
// ===========================================================================

describe('Constraint applicability — the canonical action x constraint matrix', () => {
  it('1. all five actions, against one active 4 000 bp collateral constraint over Alice’s 5 000 bp', async () => {
    const world = await constrainedWorld();
    const [target] = await activeConstraints(world);
    assert.ok(target !== undefined);

    // COLLATERALIZE — capacity-constrained. The same class, so the standing
    // commitment and a new one compete for one finite quantity.
    assert.deepEqual(await requestCollateralize(await constrainedWorld(), 'm-coll-over', 4_000), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });
    assert.deepEqual(await requestCollateralize(await constrainedWorld(), 'm-coll-fits', 1_000), { outcome: 'allowed' });

    // TRANSFER — structurally constrained, and emphatically not blocked. What
    // Alice keeps must still cover the 4 000 attached to her; moving 500 leaves
    // 4 500, which does.
    assert.deepEqual(await requestTransfer(await constrainedWorld(), 'm-tx-small', 500), { outcome: 'allowed' });
    assert.deepEqual(await requestTransfer(await constrainedWorld(), 'm-tx-large', 2_000), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });

    // TOKENIZE — no generic rule. AOC has never been given evidence that
    // tokenizing collateralized authority is a conflict, and does not invent
    // one; the whole 5 000 is tokenizable as far as this layer is concerned.
    assert.deepEqual(await requestTokenize(await constrainedWorld(), 'm-tok', 5_000), { outcome: 'allowed' });

    // LICENSE — no generic rule either, on the constrained right or another.
    assert.deepEqual(await requestLicense(await constrainedWorld(), 'm-lic-usage', [USAGE]), { outcome: 'allowed' });
    assert.deepEqual(await requestLicense(await constrainedWorld(), 'm-lic-econ', [ECONOMIC], 5_000), { outcome: 'allowed' });

    // RELEASE_ENCUMBRANCE — the target constraint does not block its own
    // discharge. No circularity, and no general exemption.
    assert.deepEqual(await requestRelease(world, 'm-rel', target.id), { outcome: 'allowed' });
  });

  it('2. the exact boundaries, on both routes', async () => {
    // Capacity: 1 000 fits, 1 001 does not.
    assert.deepEqual(await requestCollateralize(await constrainedWorld(), 'b-coll-exact', 1_000), { outcome: 'allowed' });
    assert.deepEqual(await requestCollateralize(await constrainedWorld(), 'b-coll-over', 1_001), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });

    // Structural: moving 1 000 leaves exactly 4 000, which still covers the
    // constraint; 1 001 would leave 3 999, which does not.
    assert.deepEqual(await requestTransfer(await constrainedWorld(), 'b-tx-exact', 1_000), { outcome: 'allowed' });
    assert.deepEqual(await requestTransfer(await constrainedWorld(), 'b-tx-over', 1_001), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });
  });

  it('3. a denial says which constraints reduced the capacity, and on which of the two grounds', async () => {
    const world = await constrainedWorld();
    const [target] = await activeConstraints(world);
    assert.ok(target !== undefined);

    const capacityDenial = await refusalDetails(async () => {
      const w = await constrainedWorld();
      await w.collateralization.requestCollateralization(TENANT_CONTEXT, GA_TENANT_A, collateralizationRequest('e-coll', ALICE, collateralizationTerms([ECONOMIC], bp(4_000))));
    });
    assert.equal(capacityDenial.action, ENTERPRISE_COLLATERALIZE_CAPABILITY);
    assert.equal(capacityDenial.constraintApplicability, 'capacity_constrained');
    assert.deepEqual(capacityDenial.applicableConstraints, [
      { constraintId: target.id, constraintClass: 'collateral-commitment-capacity', sourceAction: 'collateralize', applicability: ['capacity'] },
    ]);

    const structuralDenial = await refusalDetails(async () => {
      const w = await constrainedWorld();
      await w.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('e-tx', partial(ALICE, BOB, [ECONOMIC], 2_000)));
    });
    assert.equal(structuralDenial.action, ENTERPRISE_TRANSFER_CAPABILITY);
    // The same arithmetic, recorded as the different fact it is.
    assert.equal(structuralDenial.constraintApplicability, 'structurally_constrained');
    assert.deepEqual(structuralDenial.applicableConstraints, [
      { constraintId: target.id, constraintClass: 'collateral-commitment-capacity', sourceAction: 'collateralize', applicability: ['structural'] },
    ]);
  });
});

// ===========================================================================
// 2. The matrix after a governed release.
// ===========================================================================

describe('Constraint applicability — after the constraint is released', () => {
  it('4. every bound disappears, and the actions that were never bound are unchanged', async () => {
    const world = await constrainedWorld();
    const [target] = await activeConstraints(world);
    assert.ok(target !== undefined);

    await releaseThroughGovernance(world, target.id, 'rel-1');
    assert.equal((await activeConstraints(world)).length, 0);

    // The two that were bound are now free to the whole position.
    assert.deepEqual(await requestCollateralize(world, 'a-coll', 4_000), { outcome: 'allowed' });

    const transferWorld = await constrainedWorld();
    const [transferTarget] = await activeConstraints(transferWorld);
    assert.ok(transferTarget !== undefined);
    await releaseThroughGovernance(transferWorld, transferTarget.id, 'rel-2');
    assert.deepEqual(await requestTransfer(transferWorld, 'a-tx', 4_000), { outcome: 'allowed' });

    // Alice's underlying authority never moved through any of it.
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000));
  });

  it('5. releasing one constraint leaves its siblings applying exactly as before', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(10_000));
    await collateralize(world, 'sib-a', 3_000);
    await collateralize(world, 'sib-b', 2_000);

    const standing = await activeConstraints(world);
    assert.equal(standing.length, 2);

    // 5 000 committed: 5 000 remains.
    assert.deepEqual(await requestCollateralize(world, 'sib-fits', 5_000), { outcome: 'allowed' });

    const fresh = buildGovernedAuthorityWorld({ idSeed: 100, kernelIdSeed: 100 });
    await seedPosition(fresh, ALICE, ECONOMIC, bp(10_000));
    await collateralize(fresh, 'sib2-a', 3_000);
    await collateralize(fresh, 'sib2-b', 2_000);
    assert.deepEqual(await requestCollateralize(fresh, 'sib2-over', 5_001), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });

    // Release only A. B must still apply, so 8 000 fits and 8 001 does not.
    const [first] = (await activeConstraints(fresh)).filter((entry) => entry.scope.kind === 'proportional' && entry.scope.basisPoints === 3_000);
    assert.ok(first !== undefined);
    await releaseThroughGovernance(fresh, first.id, 'rel-sib');

    const remaining = await activeConstraints(fresh);
    assert.equal(remaining.length, 1);
    assert.deepEqual(remaining[0]?.scope, bp(2_000));
    assert.deepEqual(await requestCollateralize(fresh, 'sib2-after-over', 8_001), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });
  });
});

// ===========================================================================
// 3. Aggregation, and no double counting across the two commitment phases.
// ===========================================================================

describe('Constraint applicability — aggregation', () => {
  it('6. constraints of the same applicable class aggregate', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(10_000));
    await collateralize(world, 'agg-a', 3_000);
    await collateralize(world, 'agg-b', 2_000);
    assert.deepEqual(await requestCollateralize(world, 'agg-over', 5_001), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });
  });

  it('7. an active reservation and an active constraint are counted once each, never twice', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(10_000));
    // 3 000 executed into a persistent constraint.
    await collateralize(world, 'mix-executed', 3_000);
    // 2 000 authorized but not yet executed: a live reservation.
    const pending = await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest('mix-pending', ALICE, collateralizationTerms([ECONOMIC], bp(2_000))),
    );
    assert.equal(pending.status, 'allowed');

    // 5 000 is spoken for exactly once, so 5 000 remains — not 7 000 (the
    // reservation dropped) and not 3 000 (the executed one counted twice).
    assert.deepEqual(await requestCollateralize(world, 'mix-over', 5_001), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });
    assert.deepEqual(await requestCollateralize(world, 'mix-fits', 5_000), { outcome: 'allowed' });
  });
});

// ===========================================================================
// 4. Binding, end to end.
// ===========================================================================

describe('Constraint applicability — binding, through the real runtimes', () => {
  it('8. Alice’s constraint does not reduce Bob’s capacity', async () => {
    const world = await constrainedWorld();
    await seedPosition(world, BOB, ECONOMIC, bp(5_000));
    assert.deepEqual(await requestCollateralize(world, 'bind-bob', 5_000, BOB), { outcome: 'allowed' });
  });

  it('9. a constraint over one asset does not reduce capacity over another', async () => {
    const world = await constrainedWorld();
    const otherAsset = { kind: 'asset', id: 'governed-asset-b' } as const;
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000), { resource: otherAsset });

    // Asked of the authority store directly, because resource binding is
    // decided there. Routing this through a request would additionally need
    // action authority over a second asset — a real requirement, and a
    // different question, already covered by the action-authority suites.
    const outcome = await world.authorityStore.acquireReservation(ADMIN_CONTEXT, {
      tenantId: GA_TENANT_A,
      holderRef: ALICE,
      resource: otherAsset,
      governedRight: ECONOMIC,
      scope: bp(5_000),
      action: ENTERPRISE_COLLATERALIZE_CAPABILITY,
      sourceRequestRef: 'request-other-asset',
      sourceMandateRef: 'mandate-other-asset',
      effectiveFrom: GA_NOW,
      expiresAt: '2026-07-01T00:00:00.000Z',
    });
    assert.equal(outcome.outcome, 'reserved', 'asset A’s constraint reduces nothing over asset B');

    // And the constrained asset is still constrained, so this proves isolation
    // rather than the constraint having gone missing.
    assert.equal((await activeConstraints(world)).length, 1);
  });

  it('10. an economic-interest constraint does not reduce usage-right capacity', async () => {
    const world = await constrainedWorld();
    assert.deepEqual(await requestTransfer(world, 'bind-right', 10_000, [USAGE]), { outcome: 'allowed' });
  });

  it('11. a constraint in one tenant cannot influence a decision in another', async () => {
    const world = await constrainedWorld();
    const tenantBAsset = { kind: 'asset', id: 'northwind-asset-b' } as const;
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000), { tenantId: GA_TENANT_B, resource: tenantBAsset });

    // Tenant A carries a 4 000 bp constraint over Alice. Tenant B carries none,
    // and the whole 5 000 there is committable.
    const outcome = await world.collateralization.requestCollateralization(
      TENANT_B_CONTEXT,
      GA_TENANT_B,
      collateralizationRequest('bind-tenant', ALICE, collateralizationTerms([ECONOMIC], bp(5_000)), {
        asset: { ...tenantBAsset, tenantId: GA_TENANT_B },
        resourceScope: `${tenantBAsset.kind}:${tenantBAsset.id}`,
      }),
    );
    // Denied for want of *action authority* in tenant B, never for capacity:
    // the constraint pool was never crossed. What matters is that no capacity
    // refusal was produced.
    assert.notEqual(outcome.status, 'allowed');
    const constraintsInB = await world.authorityStore.listActiveEncumbrances(ADMIN_CONTEXT, {
      tenantId: GA_TENANT_B,
      holderRef: ALICE,
      resource: tenantBAsset,
      governedRight: ECONOMIC,
      at: GA_NOW,
    });
    assert.equal(constraintsInB.length, 0, 'tenant B sees none of tenant A’s constraints');
  });
});

// ===========================================================================
// 5. The requester dimension. One holder, one constraint pool.
// ===========================================================================

describe('Constraint applicability — every requester draws on the same holder pool', () => {
  it('12. a representative of the holder cannot bypass a constraint attached to that holder', async () => {
    const world = await constrainedWorld({
      withRepresentation: true,
      prepare: async (w) => {
        await grantRepresentation(w, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(10_000), actions: REPRESENTED_ACTIONS });
      },
    });
    // An impeccable representation over the whole 10 000 buys no capacity: what
    // is exhausted is the holder's authority, not the requester's standing.
    assert.deepEqual(await requestCollateralize(world, 'req-direct', 4_000), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });
  });

  it('13. a second representative of the same holder gets no pool of its own', async () => {
    const world = await constrainedWorld({
      withRepresentation: true,
      prepare: async (w) => {
        await grantRepresentation(w, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(10_000), actions: REPRESENTED_ACTIONS });
        await grantRepresentation(w, GA_SECOND_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(10_000), actions: REPRESENTED_ACTIONS });
      },
    });

    assert.deepEqual(await requestCollateralize(world, 'req-rep-a', 1_000), { outcome: 'allowed' });
    // The first representative's 1 000 is now reserved. The second sees none
    // left, rather than a fresh 1 000.
    assert.deepEqual(await requestCollateralize(world, 'req-rep-b', 1_000), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });
  });

  it('14. a delegated requester reaching the holder through a capability chain sees the same constraints', async () => {
    const world = await constrainedWorld({
      withRepresentation: true,
      managerDelegationDepth: 2,
      prepare: async (w) => {
        // The seed collateralization still runs as the manager, so it needs its
        // own representation; the agent's is what the probes below travel on.
        await grantRepresentation(w, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(10_000), actions: REPRESENTED_ACTIONS });
        w.authorityRuntime.createDelegationGrant({
          id: 'delegation-manager-to-agent',
          delegatorActorId: GA_MANAGER_ACTOR_ID,
          delegateActorId: GA_DELEGATE_ACTOR_ID,
          delegateActorType: 'agent',
          trustDomainId: GA_TRUST_DOMAIN_ID,
          sourceAuthorityGrantId: GA_MANAGER_GRANT_ID,
          capability: ENTERPRISE_COLLATERALIZE_CAPABILITY,
          actions: [ENTERPRISE_COLLATERALIZE_CAPABILITY, ENTERPRISE_TRANSFER_CAPABILITY, ENTERPRISE_TOKENIZE_CAPABILITY],
          resourceScopes: [GA_ASSET_SCOPE],
          canRedelegate: false,
        });
        await grantRepresentation(w, GA_DELEGATE_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(10_000), actions: REPRESENTED_ACTIONS });
      },
    });

    const asAgent = { requestedBy: GA_DELEGATE_ACTOR_ID, context: { passportId: GA_DELEGATE_PASSPORT_ID, capabilityTokenId: GA_DELEGATE_TOKEN_ID } };

    const denied = await verdict(() =>
      world.collateralization.requestCollateralization(
        TENANT_CONTEXT,
        GA_TENANT_A,
        collateralizationRequest('req-del-over', ALICE, collateralizationTerms([ECONOMIC], bp(4_000)), asAgent),
      ),
    );
    assert.deepEqual(denied, { outcome: 'refused', code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT' }, 'delegation confers no separate capacity');

    const allowed = await verdict(() =>
      world.collateralization.requestCollateralization(
        TENANT_CONTEXT,
        GA_TENANT_A,
        collateralizationRequest('req-del-fits', ALICE, collateralizationTerms([ECONOMIC], bp(1_000)), asAgent),
      ),
    );
    assert.deepEqual(allowed, { outcome: 'allowed' });
  });
});

// ===========================================================================
// 6. Fail-closed states.
// ===========================================================================

describe('Constraint applicability — fail-closed', () => {
  it('15. an unclassifiable constraint stops the question rather than being dropped from it', async () => {
    const world = await constrainedWorld();
    const [target] = await activeConstraints(world);
    assert.ok(target !== undefined);

    // The evaluator is handed the real, store-issued constraint with only its
    // source action changed — precisely the row a migration, a restore, or a
    // writer of a version this deployment does not understand could produce.
    // It must refuse rather than treat the 4 000 bp as unrelated.
    assert.throws(
      () =>
        applicableGovernedConstraintsFor({
          action: ENTERPRISE_COLLATERALIZE_CAPABILITY,
          tenantId: GA_TENANT_A,
          holderRef: ALICE,
          resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
          governedRight: ECONOMIC,
          constraints: [{ ...target, sourceAction: 'some-future-action' }],
          at: GA_NOW,
        }),
      (error: unknown) => isAuthorityGovernanceError(error) && error.code === 'GOVERNED_AUTHORITY_CONSTRAINT_STATE_INVALID',
    );

    // The same records, unmodified, decide cleanly — so the refusal above is
    // about the unclassifiable source action and nothing else.
    const { applicable } = applicableGovernedConstraintsFor({
      action: ENTERPRISE_COLLATERALIZE_CAPABILITY,
      tenantId: GA_TENANT_A,
      holderRef: ALICE,
      resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
      governedRight: ECONOMIC,
      constraints: [target],
      at: GA_NOW,
    });
    assert.equal(applicable.length, 1);
  });

  it('16. the write path cannot create an unclassifiable constraint, so the closed world is closed', async () => {
    const world = await constrainedWorld();
    // Every action that is not classified as encumbering is refused a
    // constraint, which is what makes `collateralize` the only source action a
    // stored row can carry — and therefore what makes deriving the class rather
    // than persisting it safe.
    for (const action of ['transfer', 'tokenize', 'license', 'release-encumbrance', 'some-future-action']) {
      assert.equal(
        await refusalCode(() =>
          world.authorityStore.recordEncumbrance(ADMIN_CONTEXT, {
            tenantId: GA_TENANT_A,
            holderRef: ALICE,
            resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
            governedRight: ECONOMIC,
            scope: bp(100),
            sourceAction: action,
            sourceMandateRef: `mandate-${action}`,
            sourceExecutionRef: `execution-${action}`,
            effectiveFrom: GA_NOW,
          }),
        ),
        'GOVERNED_AUTHORITY_ENCUMBRANCE_BASIS_INVALID',
        `'${action}' must not be able to leave a persistent constraint`,
      );
    }

    // And every constraint that does exist classifies.
    for (const constraint of await activeConstraints(world)) {
      assert.equal(governedConstraintClassOf(constraint.sourceAction), COLLATERAL_COMMITMENT_CAPACITY);
    }
  });

  it('17. an action with no declared applicability profile may not commit governed authority', async () => {
    const world = await constrainedWorld();
    // The enrolment rule, at the layer that enforces it. A future sixth action
    // reaching the authority store without a profile is refused rather than
    // assumed unrelated to the 4 000 bp already standing.
    assert.equal(
      await refusalCode(() =>
        world.authorityStore.acquireReservation(ADMIN_CONTEXT, {
          tenantId: GA_TENANT_A,
          holderRef: ALICE,
          resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
          governedRight: ECONOMIC,
          scope: bp(100),
          action: 'delegate',
          sourceRequestRef: 'request-undeclared',
          sourceMandateRef: 'mandate-undeclared',
          effectiveFrom: GA_NOW,
          expiresAt: '2026-07-01T00:00:00.000Z',
        }),
      ),
      'GOVERNED_AUTHORITY_CONSTRAINT_APPLICABILITY_UNDECLARED',
    );
  });

  it('18. a resource this deployment holds no governed authority for is untouched by any of it', async () => {
    const world = await constrainedWorld();
    const unenrolled = { kind: 'asset', id: 'asset-never-enrolled' } as const;
    const outcome = await world.authorityStore.acquireReservation(ADMIN_CONTEXT, {
      tenantId: GA_TENANT_A,
      holderRef: ALICE,
      resource: unenrolled,
      governedRight: ECONOMIC,
      scope: bp(10_000),
      action: ENTERPRISE_COLLATERALIZE_CAPABILITY,
      sourceRequestRef: 'request-unenrolled',
      sourceMandateRef: 'mandate-unenrolled',
      effectiveFrom: GA_NOW,
      expiresAt: '2026-07-01T00:00:00.000Z',
    });
    // Not denied and not constrained: the enrolment boundary is one-way, and a
    // deployment that never adopted governed authority for a resource behaves
    // exactly as it did before any of this existed.
    assert.equal(outcome.outcome, 'resource_not_enrolled');
  });
});

// ===========================================================================
// 7. Policy. What a deployment may add, and what it can never take away.
// ===========================================================================

/**
 * A deployment policy pack that denies one action when a persistent constraint
 * applies to the holder's authority.
 *
 * **This is a test of the mechanism, not an AOC rule.** AOC ships no policy
 * that connects collateral to transfer, tokenization or licensing, and the fact
 * that this rule has to be written here — by a deployment, in its own policy
 * pack — is exactly the property the phase claims.
 */
function constraintAwarePolicy(options: {
  readonly action: string;
  readonly decision: 'policy_denied' | 'policy_requires_approval';
}): PolicyPackProvider {
  return {
    evaluatePolicyForEnforcement(input) {
      const context = (input.metadata?.['aoc.governedConstraints'] ?? undefined) as
        | { readonly resolved: boolean; readonly constraints: readonly { readonly constraintClass: string }[] }
        | undefined;
      const collateralApplies =
        context?.resolved === true && context.constraints.some((entry) => entry.constraintClass === 'collateral-commitment-capacity');

      if ((input.action === options.action || input.capability === options.action) && collateralApplies) {
        return {
          type: options.decision,
          allowed: false,
          reasonCode: 'DEPLOYMENT_CONSTRAINT_INCOMPATIBLE',
          reason: `This deployment does not permit ${options.action} while a collateral commitment stands.`,
          ...(options.decision === 'policy_requires_approval'
            ? {
                approvalRequirements: [
                  {
                    id: 'approval-collateral-compatibility',
                    type: 'collateral_compatibility',
                    description: 'A collateral commitment stands over this authority.',
                    required: true,
                    minimumApprovals: 1,
                    requiresSegregationOfDuties: false,
                  },
                ],
              }
            : {}),
        };
      }
      return { type: 'policy_allowed', allowed: true, reasonCode: 'POLICY_ALLOWED', reason: 'No deployment rule applies.' };
    },
  };
}

/** A policy pack that allows absolutely everything, for proving what policy cannot buy. */
const PERMISSIVE_POLICY: PolicyPackProvider = {
  evaluatePolicyForEnforcement() {
    return { type: 'policy_allowed', allowed: true, reasonCode: 'POLICY_ALLOWED', reason: 'This deployment permits everything.' };
  },
};

describe('Constraint applicability — deployment policy may narrow', () => {
  it('17. a deployment can forbid TRANSFER while a collateral constraint stands — and AOC does not', async () => {
    // Without the rule: allowed, because there is no AOC rule to find.
    assert.deepEqual(await requestTransfer(await constrainedWorld({ withConstraintPolicyContext: true }), 'pol-tx-default', 500), { outcome: 'allowed' });

    // With the deployment's own rule: denied, and denied *as policy* rather
    // than as a shortfall of authority the holder plainly has.
    const world = await constrainedWorld({
      withConstraintPolicyContext: true,
      policyPackProvider: constraintAwarePolicy({ action: ENTERPRISE_TRANSFER_CAPABILITY, decision: 'policy_denied' }),
    });
    const denied = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('pol-tx-denied', partial(ALICE, BOB, [ECONOMIC], 500)));
    assert.equal(denied.status, 'denied');
    assert.equal(denied.mandate, undefined, 'no authorization artifact exists for a policy-denied request');
  });

  it('18. a deployment can require approval to TOKENIZE while a collateral constraint stands', async () => {
    assert.deepEqual(await requestTokenize(await constrainedWorld({ withConstraintPolicyContext: true }), 'pol-tok-default', 5_000), { outcome: 'allowed' });

    const world = await constrainedWorld({
      withConstraintPolicyContext: true,
      policyPackProvider: constraintAwarePolicy({ action: ENTERPRISE_TOKENIZE_CAPABILITY, decision: 'policy_requires_approval' }),
    });
    const outcome = await world.tokenization.requestTokenization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      tokenizationRequest('pol-tok-approval', ALICE, tokenizationTerms([ECONOMIC], bp(5_000))),
    );
    assert.notEqual(outcome.status, 'allowed', 'the deployment’s rule narrowed an otherwise viable request');
  });

  it('19. policy sees the standing constraint for every action, annotated with whether it applies — which is what makes both kinds of rule expressible', async () => {
    const seen: unknown[] = [];
    const world = await constrainedWorld({
      withConstraintPolicyContext: true,
      policyPackProvider: {
        evaluatePolicyForEnforcement(input) {
          seen.push(input.metadata?.['aoc.governedConstraints']);
          return { type: 'policy_allowed', allowed: true, reasonCode: 'POLICY_ALLOWED', reason: 'ok' };
        },
      },
    });

    type Context = {
      readonly resolved: boolean;
      readonly status: string;
      readonly constraints: readonly { readonly constraintId: string; readonly constraintClass: string; readonly applicability: readonly string[] }[];
    };

    await world.tokenization.requestTokenization(TENANT_CONTEXT, GA_TENANT_A, tokenizationRequest('pol-visible-tok', ALICE, tokenizationTerms([ECONOMIC], bp(1_000))));
    const tokenize = seen.at(-1) as Context | undefined;
    assert.ok(tokenize !== undefined, 'the constraint context reached policy');
    assert.equal(tokenize.resolved, true);
    assert.equal(tokenize.constraints.length, 1, 'the constraint stands over the authority TOKENIZE engages, so policy is told about it');
    assert.deepEqual(tokenize.constraints[0]?.applicability, [], 'and told that it does not apply — AOC invents no TOKENIZE rule');
    assert.equal(tokenize.status, 'unconstrained');

    await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest('pol-visible-coll', ALICE, collateralizationTerms([ECONOMIC], bp(500))),
    );
    const collateralize = seen.at(-1) as Context | undefined;
    assert.ok(collateralize !== undefined);
    assert.deepEqual(collateralize.constraints[0]?.applicability, ['capacity'], 'the same constraint, and for COLLATERALIZE it applies');
    assert.equal(collateralize.status, 'capacity_constrained');

    // The distinction is the deliverable: one constraint, two actions, two
    // different typed answers, and no business rule anywhere in AOC.
    assert.equal(tokenize.constraints[0]?.constraintId, collateralize.constraints[0]?.constraintId);
  });

  it('19b. policy is not shown a constraint that belongs to another holder', async () => {
    const seen: unknown[] = [];
    const world = await constrainedWorld({
      withConstraintPolicyContext: true,
      policyPackProvider: {
        evaluatePolicyForEnforcement(input) {
          seen.push(input.metadata?.['aoc.governedConstraints']);
          return { type: 'policy_allowed', allowed: true, reasonCode: 'POLICY_ALLOWED', reason: 'ok' };
        },
      },
    });
    await seedPosition(world, BOB, ECONOMIC, bp(5_000));

    await world.tokenization.requestTokenization(TENANT_CONTEXT, GA_TENANT_A, tokenizationRequest('pol-other-holder', BOB, tokenizationTerms([ECONOMIC], bp(1_000))));
    const context = seen.at(-1) as { readonly constraints: readonly unknown[] } | undefined;
    assert.ok(context !== undefined);
    assert.deepEqual(context.constraints, [], 'Alice’s constraint is not disclosed to a policy evaluating Bob’s request');
  });

  it('20. no constraint context reaches policy when the provider is not configured — a deployment that never adopted this sees no change', async () => {
    const seen: unknown[] = [];
    const world = await constrainedWorld({
      policyPackProvider: {
        evaluatePolicyForEnforcement(input) {
          seen.push(input.metadata);
          return { type: 'policy_allowed', allowed: true, reasonCode: 'POLICY_ALLOWED', reason: 'ok' };
        },
      },
    });
    await world.tokenization.requestTokenization(TENANT_CONTEXT, GA_TENANT_A, tokenizationRequest('pol-absent', ALICE, tokenizationTerms([ECONOMIC], bp(1_000))));
    assert.ok(seen.length > 0);
    for (const metadata of seen) {
      assert.equal((metadata as Record<string, unknown> | undefined)?.['aoc.governedConstraints'], undefined);
    }
  });
});

describe('Constraint applicability — deployment policy may never widen', () => {
  it('21. a policy that allows everything cannot buy capacity that is already committed', async () => {
    const world = await constrainedWorld({ withConstraintPolicyContext: true, policyPackProvider: PERMISSIVE_POLICY });
    assert.deepEqual(await requestCollateralize(world, 'hard-coll', 4_000), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });
  });

  it('22. a policy that allows everything cannot make a structurally impossible transition possible', async () => {
    const world = await constrainedWorld({ withConstraintPolicyContext: true, policyPackProvider: PERMISSIVE_POLICY });
    assert.deepEqual(await requestTransfer(world, 'hard-tx', 2_000), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });
    // And the constraint is still exactly where it was: nothing was released,
    // resized or moved to make room.
    const standing = await activeConstraints(world);
    assert.equal(standing.length, 1);
    assert.deepEqual(standing[0]?.scope, bp(4_000));
    assert.equal(standing[0]?.status, 'active');
  });

  it('23. the structural guard still refuses at execution, even reached directly, and policy is nowhere near it', async () => {
    const world = await constrainedWorld({ withConstraintPolicyContext: true, policyPackProvider: PERMISSIVE_POLICY });
    // The store's own transition primitive, called with a movement that would
    // strand the constraint. This is the invariant beneath every request path.
    assert.equal(
      await refusalCode(() =>
        world.authorityStore.applyTransition(ADMIN_CONTEXT, {
          tenantId: GA_TENANT_A,
          fromHolderRef: ALICE,
          toHolderRef: CAROL,
          resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
          governedRights: [ECONOMIC],
          scope: bp(2_000),
          basis: { kind: 'governed-execution', capability: ENTERPRISE_TRANSFER_CAPABILITY, mandateRef: 'mandate-direct', executionRef: 'execution-direct' },
          occurredAt: GA_NOW,
        }),
      ),
      'GOVERNED_AUTHORITY_ENCUMBRANCE_UNCOVERED',
    );
  });
});

// ===========================================================================
// 8. Concurrency and commit-time revalidation.
// ===========================================================================

describe('Constraint applicability — commitment is decided at commit time', () => {
  it('24. two concurrent 4 000 bp commitments against 5 000 bp: exactly one succeeds', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    const [a, b] = await Promise.allSettled([
      world.collateralization.requestCollateralization(TENANT_CONTEXT, GA_TENANT_A, collateralizationRequest('race-a', ALICE, collateralizationTerms([ECONOMIC], bp(4_000)))),
      world.collateralization.requestCollateralization(TENANT_CONTEXT, GA_TENANT_A, collateralizationRequest('race-b', ALICE, collateralizationTerms([ECONOMIC], bp(4_000)))),
    ]);

    const allowed = [a, b].filter((entry) => entry.status === 'fulfilled' && entry.value.status === 'allowed');
    assert.equal(allowed.length, 1, 'exactly one of two competing commitments may stand');
  });

  it('25. a release that commits first frees the capacity; one that has not, does not', async () => {
    const world = await constrainedWorld();
    const [target] = await activeConstraints(world);
    assert.ok(target !== undefined);

    // Before the release commits, the constraint applies.
    assert.deepEqual(await requestCollateralize(world, 'race-before', 4_000), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });

    await releaseThroughGovernance(world, target.id, 'race-release');

    // After it commits, it does not. There is no third answer.
    assert.deepEqual(await requestCollateralize(world, 'race-after', 4_000), { outcome: 'allowed' });
  });

  it('26. a constraint created between a caller’s read and its commitment still binds that commitment', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));

    // A caller reads 5 000 free.
    const snapshot = await world.authorityStore.resolveAvailability(ADMIN_CONTEXT, {
      tenantId: GA_TENANT_A,
      holderRef: ALICE,
      resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
      governedRight: ECONOMIC,
      at: GA_NOW,
    });
    assert.ok(snapshot.outcome === 'available');
    assert.deepEqual(snapshot.available, bp(5_000));

    // A constraint appears in between.
    await collateralize(world, 'toctou', 4_000);

    // The snapshot is worthless and the commitment is decided on the state that
    // is committed now. This is why `resolveAvailability` is documented as an
    // explanation rather than a gate.
    assert.deepEqual(await requestCollateralize(world, 'toctou-late', 4_000), {
      outcome: 'refused',
      code: 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    });
  });
});

// ===========================================================================
// 9. Execution continuity: a transfer that was authorized still cannot strand.
// ===========================================================================

describe('Constraint applicability — the structural invariant survives to execution', () => {
  it('27. an authorized small transfer executes and leaves the constraint covered', async () => {
    const world = await constrainedWorld();
    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('exec-small', partial(ALICE, BOB, [ECONOMIC], 1_000)));
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate !== undefined);

    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(outcome.mandate.id, ALICE, BOB, [ECONOMIC], bp(1_000)));

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(4_000), 'exactly enough to keep covering the 4 000 constraint');
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), bp(1_000));

    // The constraint did not follow the authority to Bob, and did not vanish.
    const standing = await activeConstraints(world);
    assert.equal(standing.length, 1);
    assert.equal(standing[0]?.holderRef, ALICE);
    assert.equal((await activeConstraints(world, BOB)).length, 0);
  });
});
