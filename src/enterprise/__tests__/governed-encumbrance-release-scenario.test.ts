import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GovernedRightType } from '@aoc-enterprise/governed-authorization';

import { GOVERNED_AUTHORITY_RELEASING_ACTIONS } from '../authority-governance/encumbrance-lifecycle.js';
import { isAuthorityGovernanceError } from '../authority-governance/errors.js';
import { ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY } from '../encumbrance-release-governance/contracts.js';
import { isEncumbranceReleaseGovernanceError } from '../encumbrance-release-governance/errors.js';
import {
  createFailingEncumbranceReleaseExecutorPort,
  createInMemoryEncumbranceReleaseExecutorPort,
  createIndeterminateEncumbranceReleaseExecutorPort,
  createUnavailableEncumbranceReleaseExecutorPort,
} from '../encumbrance-release-governance/executor-port.js';
import {
  ADMIN_CONTEXT,
  ALICE,
  BOB,
  GA_ALICE_PASSPORT_ID,
  GA_ALICE_TOKEN_ID,
  GA_ASSET,
  GA_ASSET_SCOPE,
  GA_DELEGATE_ACTOR_ID,
  GA_DELEGATE_PASSPORT_ID,
  GA_DELEGATE_TOKEN_ID,
  GA_MANAGER_ACTOR_ID,
  GA_MANAGER_PASSPORT_ID,
  GA_MANAGER_TOKEN_ID,
  GA_NOW,
  GA_RELEASE_OFFICER_ACTOR_ID,
  GA_RELEASE_OFFICER_GRANT_ID,
  GA_RELEASE_OFFICER_TOKEN_ID,
  GA_SECURED_PARTY_PASSPORT_ID,
  GA_SECURED_PARTY_REF,
  GA_SECURED_PARTY_TOKEN_ID,
  GA_TENANT_A,
  GA_TENANT_B,
  GA_TENANT_B_ASSET,
  GA_TRUST_DOMAIN_ID,
  GOVERNED_RIGHT_TYPES,
  TENANT_B_CONTEXT,
  TENANT_CONTEXT,
  buildGovernedAuthorityWorld,
  collateralizationRequest,
  collateralizationTerms,
  encumbranceReleaseRequest,
  heldScope,
  seedPosition,
  transferRequest,
  transferTerms,
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
 * E  available authority      is enough of what the holder controls still uncommitted?
 * F  unencumbered authority   is enough of it still unconstrained by an action that
 *                             has ALREADY executed?
 * G  released authority       may a constraint from F legitimately STOP constraining,
 *                             and on whose say-so?
 * ```
 *
 * G exists because F is deliberately one-way. Phase 5.5 closed the hole where a
 * persistent constraint evaporated at execution, and closed it by making the
 * *only* exit a privileged operator override. That is safe and unusable: a
 * deployment whose collateral genuinely gets discharged had no governed path to
 * say so, and the caller-facing thing that looked like one — `recordRelease` —
 * is an unverified observation that touches no authority state at all.
 *
 * So the suite opens by measuring both halves of that gap against the real
 * runtimes, then closes it, and then spends most of its length on the ways the
 * closure could have been wrong: a holder discharging her own constraint, a
 * secured party discharging one it benefited from, a caller asserting an
 * executor's confirmation, an unknown outcome freeing capacity optimistically,
 * one confirmed release discharging a sibling it never covered.
 *
 * Every world below is the real Kernel, the real Recognition Runtime, the real
 * Authority Graph, the real Approval Runtime, the real Governance Store and the
 * real mandate stores. The only doubles are the executor adapters, and their
 * being doubles is the point: what they establish is that the *service* cannot
 * decide a release happened.
 */

const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;

function bp(basisPoints: number) {
  return { kind: 'proportional', basisPoints } as const;
}

/** The external executor reports it created exactly the arrangement the collateralization mandate authorized. */
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
    securedPartyRef: GA_SECURED_PARTY_REF,
    committedScope: bp(basisPoints),
    rights,
    externalRegistry: 'registry-alpha',
    ...overrides,
  };
}

/**
 * Drives a collateralization all the way to an active persistent constraint,
 * and returns it. The starting position of almost every test below.
 */
async function encumber(
  world: GovernedAuthorityWorld,
  requestId: string,
  basisPoints: number,
  options: { readonly holderRef?: string; readonly rights?: readonly GovernedRightType[] } = {},
) {
  const holderRef = options.holderRef ?? ALICE;
  const rights = options.rights ?? [ECONOMIC];
  const outcome = await world.collateralization.requestCollateralization(
    TENANT_CONTEXT,
    GA_TENANT_A,
    collateralizationRequest(requestId, holderRef, collateralizationTerms(rights, bp(basisPoints))),
  );
  assert.equal(outcome.status, 'allowed', `expected ${requestId} to be authorized`);
  assert.ok(outcome.mandate !== undefined);
  const executed = await world.collateralization.recordExecution(
    TENANT_CONTEXT,
    conformingCollateralExecution(outcome.mandate.id, basisPoints, rights),
  );
  const constraints = await world.authorityStore.listActiveEncumbrances(ADMIN_CONTEXT, {
    tenantId: GA_TENANT_A,
    holderRef,
    resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
    governedRight: rights[0] as GovernedRightType,
    at: GA_NOW,
  });
  const created = constraints.find((constraint) => constraint.sourceExecutionRef === executed.execution.id);
  assert.ok(created !== undefined, 'the collateralization left a persistent constraint behind');
  return { collateralMandate: outcome.mandate, collateralExecution: executed.execution, encumbrance: created };
}

/** What the holder's capacity currently is, as plain numbers, so assertions read like the scenario they describe. */
async function capacity(world: GovernedAuthorityWorld, holderRef = ALICE, governedRight: GovernedRightType = ECONOMIC) {
  return world.authorityStore.resolveAvailability(ADMIN_CONTEXT, {
    tenantId: GA_TENANT_A,
    holderRef,
    resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
    governedRight,
    at: GA_NOW,
  });
}

async function statusOf(world: GovernedAuthorityWorld, encumbranceId: string) {
  const found = await world.authorityStore.getEncumbrance(ADMIN_CONTEXT, GA_TENANT_A, encumbranceId);
  return found?.status;
}

/** The error code a refused release produced, or a clear failure if it was not refused. */
async function releaseRefusalCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (isEncumbranceReleaseGovernanceError(error)) return error.code;
    if (isAuthorityGovernanceError(error)) return error.code;
    assert.fail(`expected a governance error, received ${String(error)}`);
  }
  assert.fail('expected the operation to be refused');
}

// ---------------------------------------------------------------------------
// The measured gap this phase closes.
// ---------------------------------------------------------------------------

describe('the production release gap, before it is closed', () => {
  it('recordRelease is an observation and cannot free constrained authority', async () => {
    // The measurement the whole phase rests on, and it is a *reassuring*
    // measurement rather than a vulnerability: the pre-existing caller-facing
    // release surface reaches no authority state at all. Had it reached any,
    // every constraint in every deployment would already have been
    // discretionary.
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { collateralMandate, collateralExecution, encumbrance } = await encumber(world, 'req-legacy-release', 4_000);

    const before = await capacity(world);
    assert.ok(before.outcome === 'available');
    assert.deepEqual(before.available, bp(1_000));

    // An ordinary tenant caller reports a full release, naming itself as the
    // reporter. Accepted as evidence — AOC records what an external system
    // says — and it changes nothing about what Alice may commit.
    const observation = await world.collateralization.recordRelease(TENANT_CONTEXT, {
      mandateId: collateralMandate.id,
      executionId: collateralExecution.id,
      reportedBy: ALICE,
      releasedAt: GA_NOW,
      releaseType: 'released',
    });
    assert.ok(observation.id.length > 0, 'the observation is recorded');

    assert.equal(await statusOf(world, encumbrance.id), 'active', 'the canonical constraint is untouched');
    const after = await capacity(world);
    assert.ok(after.outcome === 'available');
    assert.deepEqual(after.encumbered, bp(4_000));
    assert.deepEqual(after.available, bp(1_000), 'and not one basis point was freed by saying so');
  });

  it('leaves an operator override as the only exit, which is why a governed action was needed', async () => {
    // The functional half of the gap. Before this phase there was exactly one
    // way out of `'active'`, it required a system context, and it recorded no
    // authorization, no mandate, no executor and no evidence. Safe, and unusable
    // as a production discharge path.
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-operator-only', 4_000);

    assert.equal(
      await releaseRefusalCode(() =>
        world.authorityStore.releaseEncumbrance(TENANT_CONTEXT, {
          tenantId: GA_TENANT_A,
          encumbranceId: encumbrance.id,
          basis: { kind: 'administrative', assertedBy: 'actor-test', reasonCode: 'because-i-said-so' },
        }),
      ),
      'GOVERNED_AUTHORITY_ENCUMBRANCE_RELEASE_NOT_PERMITTED',
    );
    assert.equal(await statusOf(world, encumbrance.id), 'active');
  });
});

// ---------------------------------------------------------------------------
// The governed lifecycle.
// ---------------------------------------------------------------------------

describe('governed encumbrance release, end to end', () => {
  it('runs the whole chain, and frees capacity only at the last link', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-e2e-collateralize', 4_000);

    // T0. The constraint stands.
    const t0 = await capacity(world);
    assert.ok(t0.outcome === 'available');
    assert.deepEqual(t0.held, bp(5_000));
    assert.deepEqual(t0.encumbered, bp(4_000));
    assert.deepEqual(t0.available, bp(1_000));

    // An unauthorized request is refused before any of this begins. The
    // manager can collateralize this very asset and cannot discharge what the
    // collateralization left behind.
    const unauthorized = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-e2e-unauthorized', encumbrance.id, {
        requestedBy: GA_MANAGER_ACTOR_ID,
        context: { passportId: GA_MANAGER_PASSPORT_ID, capabilityTokenId: GA_MANAGER_TOKEN_ID },
      }),
    );
    assert.equal(unauthorized.status, 'denied');
    assert.equal(unauthorized.mandate, undefined);
    assert.equal(await statusOf(world, encumbrance.id), 'active');

    // T1. The authorized request produces a mandate — and nothing else.
    const authorized = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-e2e-release', encumbrance.id),
    );
    assert.equal(authorized.status, 'allowed');
    assert.ok(authorized.mandate !== undefined);
    assert.equal(authorized.mandate.status, 'active');
    assert.equal(authorized.mandate.encumbranceRef, encumbrance.id);

    assert.equal(await statusOf(world, encumbrance.id), 'active', 'authorization is not effect');
    const t1 = await capacity(world);
    assert.ok(t1.outcome === 'available');
    assert.deepEqual(t1.available, bp(1_000), 'and no capacity is freed by being allowed to free it');

    // T3. A trusted executor confirms, and only now does the constraint end.
    const executed = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, {
      mandateId: authorized.mandate.id,
    });
    assert.equal(executed.execution.outcome, 'confirmed_success');
    assert.equal(executed.terminalized, true);
    assert.equal(executed.encumbrance.status, 'released');
    assert.equal(executed.encumbrance.releaseBasis, 'governed-execution');
    assert.equal(executed.encumbrance.releaseAction, ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY);
    assert.equal(executed.encumbrance.releaseMandateRef, authorized.mandate.id);
    assert.equal(executed.encumbrance.releaseExecutionRef, executed.execution.id);
    assert.equal(executed.mandate.status, 'executed', 'and the grant is spent');

    const t3 = await capacity(world);
    assert.ok(t3.outcome === 'available');
    assert.deepEqual(t3.held, bp(5_000), 'the position never moved, at any point');
    assert.equal(t3.encumbered, undefined, 'nothing constrains it any more');
    assert.deepEqual(t3.available, bp(5_000), 'and exactly what was constrained came back');

    // Release restores availability; it does not create authority. Not 9 000.
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000));
  });

  it('keeps the whole chain reconstructible afterwards', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { collateralMandate, collateralExecution, encumbrance } = await encumber(world, 'req-lineage', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-lineage-release', encumbrance.id),
    );
    assert.ok(outcome.mandate !== undefined);
    const executed = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate.id });

    const lineage = await world.encumbranceRelease.getEvidenceLineage(TENANT_CONTEXT, outcome.mandate.id);
    assert.equal(lineage.encumbranceRef, encumbrance.id);
    assert.equal(lineage.requestRef, 'req-lineage-release');
    assert.equal(lineage.requestedBy, GA_RELEASE_OFFICER_ACTOR_ID);
    assert.ok(lineage.decisionRef.length > 0);
    assert.ok(lineage.evaluationRef !== undefined);
    assert.deepEqual(lineage.executionRefs, [executed.execution.id]);
    assert.equal(lineage.releaseExecutionRef, executed.execution.id);
    assert.equal(lineage.encumbrance?.status, 'released');

    // And the constraint still points back at what created it. A release is
    // additive lineage, never a rewrite: the collateralization that produced
    // the constraint is exactly as auditable as it was.
    assert.equal(lineage.encumbrance?.sourceMandateRef, collateralMandate.id);
    assert.equal(lineage.encumbrance?.sourceExecutionRef, collateralExecution.id);
    assert.equal(lineage.encumbrance?.sourceAction, 'collateralize');

    // The released record is kept, not deleted.
    const stored = await world.authorityStore.getEncumbrance(ADMIN_CONTEXT, GA_TENANT_A, encumbrance.id);
    assert.ok(stored !== null);
    assert.equal(stored.status, 'released');
  });

  it('classifies exactly one action as releasing, and it is the fifth governed action', () => {
    // The capability constant and the accounting layer's allow-list are
    // deliberately declared in different modules — the generic authority layer
    // must not import an action module — so something has to hold them
    // together. This is that something.
    assert.deepEqual(GOVERNED_AUTHORITY_RELEASING_ACTIONS, [ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY]);
    assert.equal(ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY, 'release-encumbrance');
  });
});

// ---------------------------------------------------------------------------
// Who may release. The negative results are the load-bearing ones.
// ---------------------------------------------------------------------------

describe('release authority is explicit, and nothing implies it', () => {
  it('the encumbered holder cannot discharge her own constraint', async () => {
    // The single most important denial in this phase. Alice holds the
    // authority, Alice is the party the constraint is about, Alice is a
    // recognized actor with a passport and a capability token — and Alice has
    // no release grant, so she gets nowhere. A holder who could free her own
    // constraint by asking would make persistent encumbrance decorative.
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-holder-self', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-holder-self-release', encumbrance.id, {
        requestedBy: ALICE,
        context: { passportId: GA_ALICE_PASSPORT_ID, capabilityTokenId: GA_ALICE_TOKEN_ID },
      }),
    );
    assert.equal(outcome.status, 'denied');
    assert.equal(outcome.mandate, undefined);
    assert.equal(await statusOf(world, encumbrance.id), 'active');
    const after = await capacity(world);
    assert.ok(after.outcome === 'available');
    assert.deepEqual(after.available, bp(1_000));
  });

  it('the secured party cannot discharge a constraint it benefited from', async () => {
    // `securedPartyRef` records who benefits. The `COLLATERALIZE` contract says
    // so in as many words, and says nothing about control. This party is
    // recognized, passported and capability-tokened for all five actions and
    // still gets nowhere, because nobody granted it release authority.
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-secured-party', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-secured-party-release', encumbrance.id, {
        requestedBy: GA_SECURED_PARTY_REF,
        context: { passportId: GA_SECURED_PARTY_PASSPORT_ID, capabilityTokenId: GA_SECURED_PARTY_TOKEN_ID },
      }),
    );
    assert.equal(outcome.status, 'denied');
    assert.equal(await statusOf(world, encumbrance.id), 'active');
  });

  it('the actor that requested the collateralization holds no perpetual release privilege', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-original-requester', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-original-requester-release', encumbrance.id, {
        requestedBy: GA_MANAGER_ACTOR_ID,
        context: { passportId: GA_MANAGER_PASSPORT_ID, capabilityTokenId: GA_MANAGER_TOKEN_ID },
      }),
    );
    assert.equal(outcome.status, 'denied');
    assert.equal(await statusOf(world, encumbrance.id), 'active');
  });

  it('a principal with direct release authority may release, with no self-delegation', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-direct', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-direct-release', encumbrance.id),
    );
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate !== undefined);
    const executed = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate.id });
    assert.equal(executed.encumbrance.status, 'released');
  });

  it('release authority reaching a delegate through a valid lineage works, and stops when the lineage does', async () => {
    // Phase 5.3's derived-authority rules apply to the fifth action unchanged:
    // the delegation cannot broaden the resource, the action or the trust
    // domain, and revoking the parent revokes the child's reach.
    const world = buildGovernedAuthorityWorld({ releaseDelegationDepth: 1 });
    await seedPosition(world, ALICE, ECONOMIC, bp(10_000));
    const first = await encumber(world, 'req-delegated-a', 3_000);
    const second = await encumber(world, 'req-delegated-b', 2_000);

    world.authorityRuntime.createDelegationGrant({
      id: 'delegation-grant-release-agent',
      delegatorActorId: GA_RELEASE_OFFICER_ACTOR_ID,
      delegateActorId: GA_DELEGATE_ACTOR_ID,
      delegateActorType: 'agent',
      trustDomainId: GA_TRUST_DOMAIN_ID,
      sourceAuthorityGrantId: GA_RELEASE_OFFICER_GRANT_ID,
      capability: ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY,
      actions: [ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY],
      resourceScopes: [GA_ASSET_SCOPE],
      canRedelegate: false,
    });

    const asDelegate = {
      requestedBy: GA_DELEGATE_ACTOR_ID,
      principalActorId: GA_RELEASE_OFFICER_ACTOR_ID,
      actorType: 'agent',
      context: { passportId: GA_DELEGATE_PASSPORT_ID, capabilityTokenId: GA_DELEGATE_TOKEN_ID },
    };

    const allowed = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-delegated-release-a', first.encumbrance.id, asDelegate),
    );
    assert.equal(allowed.status, 'allowed', 'a valid lineage reaches the fifth action exactly as it reaches the other four');
    assert.ok(allowed.mandate !== undefined);
    const executed = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: allowed.mandate.id });
    assert.equal(executed.encumbrance.status, 'released');

    // Revoke the delegation; the same agent loses the same reach.
    world.authorityRuntime.revokeDelegationGrant('delegation-grant-release-agent', GA_RELEASE_OFFICER_ACTOR_ID, 'lineage withdrawn');
    const denied = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-delegated-release-b', second.encumbrance.id, asDelegate),
    );
    assert.equal(denied.status, 'denied');
    assert.equal(await statusOf(world, second.encumbrance.id), 'active');
  });

  it('withdrawn release authority denies before any mandate exists', async () => {
    // Request-time authority, and the direct-requester counterpart of revoking
    // a delegation. For a human acting for itself the capability token carries
    // the action authority, so withdrawing it is withdrawing the authority —
    // and a request that arrives afterwards produces no mandate at all, rather
    // than a mandate that would have been executable.
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(10_000));
    const before = await encumber(world, 'req-revoked-before', 3_000);
    const after = await encumber(world, 'req-revoked-after', 2_000);

    const allowed = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-revoked-a', before.encumbrance.id),
    );
    assert.equal(allowed.status, 'allowed', 'the officer could release a moment ago');

    world.recognitionRuntime.revokeCapabilityToken(GA_RELEASE_OFFICER_TOKEN_ID, GA_TRUST_DOMAIN_ID);

    const denied = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-revoked-b', after.encumbrance.id),
    );
    assert.equal(denied.status, 'denied');
    assert.equal(denied.mandate, undefined);
    assert.equal(await statusOf(world, after.encumbrance.id), 'active');

    // And the mandate issued before the withdrawal remains a durable
    // authorization: the temporal semantics are the ones every other governed
    // action already has, not a one-off. Withdrawing the requester's authority
    // does not retroactively unmake an authorization AOC already granted; what
    // ends a live mandate is revoking the mandate.
    const executed = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: allowed.mandate!.id });
    assert.equal(executed.encumbrance.status, 'released');
    assert.equal(await statusOf(world, after.encumbrance.id), 'active', 'and the constraint nobody was authorized to release still stands');
  });

  it('a grant scoped to one resource cannot discharge a constraint on another', async () => {
    // The release officer's grant names `asset:governed-asset-a` and no other
    // scope. A constraint over a second asset in the same tenant is out of its
    // reach, and the denial comes from the Authority Graph rather than from
    // anything release-specific.
    const world = buildGovernedAuthorityWorld();
    const otherAsset = { kind: 'asset', id: 'governed-asset-b' } as const;
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000), { resource: otherAsset });

    // Encumber the *other* asset directly through the store, since the release
    // officer's authority — not the collateralization path — is what is under
    // test here.
    const recorded = await world.authorityStore.recordEncumbrance(ADMIN_CONTEXT, {
      tenantId: GA_TENANT_A,
      holderRef: ALICE,
      resource: otherAsset,
      governedRight: ECONOMIC,
      scope: bp(4_000),
      sourceAction: 'collateralize',
      sourceMandateRef: 'mandate-other-asset',
      sourceExecutionRef: 'execution-other-asset',
      effectiveFrom: GA_NOW,
    });
    assert.ok(recorded.outcome === 'encumbered');

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-wrong-resource', recorded.encumbrance.id, { resource: otherAsset }),
    );
    assert.equal(outcome.status, 'denied');
    assert.equal(
      (await world.authorityStore.getEncumbrance(ADMIN_CONTEXT, GA_TENANT_A, recorded.encumbrance.id))?.status,
      'active',
    );
  });

  it('a request naming a resource the constraint does not stand over is refused, never coerced', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-resource-mismatch', 4_000);

    assert.equal(
      await releaseRefusalCode(() =>
        world.encumbranceRelease.requestEncumbranceRelease(
          TENANT_CONTEXT,
          GA_TENANT_A,
          encumbranceReleaseRequest('req-resource-mismatch-release', encumbrance.id, {
            resource: { kind: 'asset', id: 'governed-asset-b' },
          }),
        ),
      ),
      'ENCUMBRANCE_RELEASE_TARGET_MISMATCH',
    );
    assert.equal(await statusOf(world, encumbrance.id), 'active');
  });

  it('no tenant can reach another tenant’s constraint, and no identifier leaks', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-tenant', 4_000);

    // Tenant B naming tenant A's constraint reads as "no such constraint",
    // never as "denied" — so identifiers cannot be probed by telling the two
    // apart.
    assert.equal(
      await releaseRefusalCode(() =>
        world.encumbranceRelease.requestEncumbranceRelease(
          TENANT_B_CONTEXT,
          GA_TENANT_B,
          encumbranceReleaseRequest('req-cross-tenant', encumbrance.id, { resource: GA_TENANT_B_ASSET }),
        ),
      ),
      'ENCUMBRANCE_RELEASE_TARGET_NOT_FOUND',
    );
    assert.equal(await statusOf(world, encumbrance.id), 'active');

    // And a tenant that names its own organization while acting as another is
    // refused at the tenancy guard, before anything is read at all.
    assert.equal(
      await releaseRefusalCode(() =>
        world.encumbranceRelease.requestEncumbranceRelease(
          TENANT_B_CONTEXT,
          GA_TENANT_A,
          encumbranceReleaseRequest('req-cross-tenant-2', encumbrance.id),
        ),
      ),
      'ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION',
    );
    assert.equal(await statusOf(world, encumbrance.id), 'active');
  });

  it('denies every release when no actor in the deployment holds release authority', async () => {
    const world = buildGovernedAuthorityWorld({ withoutReleaseAuthority: true });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-no-authority', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-no-authority-release', encumbrance.id),
    );
    assert.equal(outcome.status, 'denied');
    assert.equal(await statusOf(world, encumbrance.id), 'active');
  });
});

// ---------------------------------------------------------------------------
// The mandate is an authorization, never an effect.
// ---------------------------------------------------------------------------

describe('a release mandate authorizes and does not release', () => {
  it('revoking it before execution leaves the constraint standing, and the executor is never called', async () => {
    const executor = createInMemoryEncumbranceReleaseExecutorPort({ now: () => GA_NOW });
    const world = buildGovernedAuthorityWorld({ releaseExecutor: executor });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-revoke', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-revoke-release', encumbrance.id),
    );
    assert.ok(outcome.mandate !== undefined);
    const revoked = await world.encumbranceRelease.revokeMandate(TENANT_CONTEXT, {
      mandateId: outcome.mandate.id,
      reason: 'withdrawn before execution',
      requestedBy: GA_RELEASE_OFFICER_ACTOR_ID,
    });
    assert.equal(revoked.mandate.status, 'revoked');

    assert.equal(
      await releaseRefusalCode(() => world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id })),
      'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
    );
    assert.equal(executor.attempts.length, 0, 'a withdrawn authorization must not produce an external release');
    assert.equal(await statusOf(world, encumbrance.id), 'active');
    const after = await capacity(world);
    assert.ok(after.outcome === 'available');
    assert.deepEqual(after.available, bp(1_000));
  });

  it('letting it expire is not a release', async () => {
    const executor = createInMemoryEncumbranceReleaseExecutorPort({ now: () => GA_NOW });
    const world = buildGovernedAuthorityWorld({ releaseExecutor: executor });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-expiry', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-expiry-release', encumbrance.id, { mandateExpiresAt: '2026-03-01T00:00:00.000Z' }),
    );
    assert.ok(outcome.mandate !== undefined);

    assert.equal(
      await releaseRefusalCode(() =>
        world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, {
          mandateId: outcome.mandate!.id,
          attemptedAt: '2026-04-01T00:00:00.000Z',
        }),
      ),
      'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
    );
    assert.equal(executor.attempts.length, 0);
    assert.equal(await statusOf(world, encumbrance.id), 'active');
  });

  it('refuses a second live authorization over one constraint', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-duplicate-mandate', 4_000);

    const first = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-duplicate-a', encumbrance.id),
    );
    assert.equal(first.status, 'allowed');

    assert.equal(
      await releaseRefusalCode(() =>
        world.encumbranceRelease.requestEncumbranceRelease(
          TENANT_CONTEXT,
          GA_TENANT_A,
          encumbranceReleaseRequest('req-duplicate-b', encumbrance.id),
        ),
      ),
      'ENCUMBRANCE_RELEASE_MANDATE_ALREADY_ACTIVE',
    );

    // Withdrawing the first frees the slot: the refusal is about concurrency,
    // not about the constraint having become undischargeable.
    await world.encumbranceRelease.revokeMandate(TENANT_CONTEXT, {
      mandateId: first.mandate!.id,
      reason: 'superseded',
      requestedBy: GA_RELEASE_OFFICER_ACTOR_ID,
    });
    const third = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-duplicate-c', encumbrance.id),
    );
    assert.equal(third.status, 'allowed');
  });

  it('replaying one request accumulates no second authorization', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-idempotent', 4_000);

    const first = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-idempotent-release', encumbrance.id),
    );
    const replay = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-idempotent-release', encumbrance.id),
    );
    assert.equal(replay.status, 'allowed');
    assert.equal(replay.mandate?.id, first.mandate?.id, 'the same authorization comes back, rather than a second one');
    assert.equal((await world.encumbranceReleaseStore.health()).mandateCount, 1);
  });

  it('an outstanding approval is not an authorization, and releases nothing', async () => {
    // `approval_required` is explicitly not authorization. An incomplete
    // governance chain produces no mandate, so there is nothing to execute and
    // the constraint stands — the same rule the four existing actions apply,
    // reached through the same machinery and with no release-specific path.
    const world = buildGovernedAuthorityWorld({ releaseRequiresApprovalBy: GA_MANAGER_ACTOR_ID });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-approval', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-approval-release', encumbrance.id),
    );
    assert.equal(outcome.status, 'approval_required');
    assert.equal(outcome.mandate, undefined, 'no authorization artifact exists while an approval is outstanding');

    assert.equal(await statusOf(world, encumbrance.id), 'active');
    const after = await capacity(world);
    assert.ok(after.outcome === 'available');
    assert.deepEqual(after.available, bp(1_000));

    // The evaluation is still durably recorded, so the outstanding approval is
    // auditable rather than lost.
    assert.ok(outcome.evaluationId.length > 0);
    assert.equal((await world.encumbranceReleaseStore.health()).mandateCount, 0);
  });

  it('refuses a request against a constraint that is already released', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-already-released', 4_000);

    const first = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-already-a', encumbrance.id),
    );
    await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: first.mandate!.id });

    // A new, unrelated request must not perform a second release, and must not
    // silently succeed either. It is refused deterministically, before any
    // decision exists.
    assert.equal(
      await releaseRefusalCode(() =>
        world.encumbranceRelease.requestEncumbranceRelease(
          TENANT_CONTEXT,
          GA_TENANT_A,
          encumbranceReleaseRequest('req-already-b', encumbrance.id),
        ),
      ),
      'ENCUMBRANCE_RELEASE_TARGET_NOT_ACTIVE',
    );
    const after = await capacity(world);
    assert.ok(after.outcome === 'available');
    assert.deepEqual(after.available, bp(5_000), 'and capacity was restored exactly once');
  });

  it('revoking the mandate after execution does not re-activate the constraint', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-post-revoke', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-post-revoke-release', encumbrance.id),
    );
    await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });

    assert.equal(
      await releaseRefusalCode(() =>
        world.encumbranceRelease.revokeMandate(TENANT_CONTEXT, {
          mandateId: outcome.mandate!.id,
          reason: 'too late',
          requestedBy: GA_RELEASE_OFFICER_ACTOR_ID,
        }),
      ),
      'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
    );
    assert.equal(await statusOf(world, encumbrance.id), 'released', 'release is monotonic');
  });
});

// ---------------------------------------------------------------------------
// Only a trusted confirmation releases.
// ---------------------------------------------------------------------------

describe('the executor decides whether a release happened, and nothing else does', () => {
  it('a confirmed failure leaves the constraint standing', async () => {
    const world = buildGovernedAuthorityWorld({
      releaseExecutor: createFailingEncumbranceReleaseExecutorPort({ failureCode: 'collateral_still_pledged' }),
    });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-fail', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-fail-release', encumbrance.id),
    );
    const executed = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });
    assert.equal(executed.execution.outcome, 'confirmed_failure');
    assert.equal(executed.execution.failureCode, 'collateral_still_pledged');
    assert.equal(executed.terminalized, false);
    assert.equal(executed.encumbrance.status, 'active');
    assert.equal(executed.mandate.status, 'active', 'and the authorization is not spent, so it can be retried');

    const after = await capacity(world);
    assert.ok(after.outcome === 'available');
    assert.deepEqual(after.available, bp(1_000));
  });

  it('an unknown outcome leaves the constraint standing, and is safe to retry', async () => {
    // The conservative direction, chosen deliberately. Blocking capacity that
    // may in fact be free is recoverable; freeing capacity for an arrangement
    // that may still exist is not.
    const world = buildGovernedAuthorityWorld({
      releaseExecutor: createIndeterminateEncumbranceReleaseExecutorPort({ reason: 'provider_timeout' }),
    });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-unknown', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-unknown-release', encumbrance.id),
    );
    const first = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });
    assert.equal(first.execution.outcome, 'indeterminate');
    assert.equal(first.execution.failureReason, 'provider_timeout');
    assert.equal(first.encumbrance.status, 'active');

    const second = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });
    assert.equal(second.execution.outcome, 'indeterminate');
    assert.equal(second.encumbrance.status, 'active');

    assert.equal((await world.encumbranceRelease.listExecutions(TENANT_CONTEXT, outcome.mandate!.id)).length, 2, 'both attempts are kept');
    const after = await capacity(world);
    assert.ok(after.outcome === 'available');
    assert.deepEqual(after.available, bp(1_000), 'and no capacity was freed optimistically');
  });

  it('an executor that cannot be reached is unknown, not failed', async () => {
    const world = buildGovernedAuthorityWorld({ releaseExecutor: createUnavailableEncumbranceReleaseExecutorPort() });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-unavailable', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-unavailable-release', encumbrance.id),
    );
    const executed = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });
    // A call that threw may still have reached the provider, so it is recorded
    // as unknown rather than as a definitive failure.
    assert.equal(executed.execution.outcome, 'indeterminate');
    assert.equal(executed.encumbrance.status, 'active');
  });

  it('a confirmation about a different constraint is refused and recorded as a failure', async () => {
    const world = buildGovernedAuthorityWorld({
      releaseExecutor: createInMemoryEncumbranceReleaseExecutorPort({
        now: () => GA_NOW,
        respondForEncumbranceRef: 'governed-authority-encumbrance-somebody-elses',
      }),
    });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-wrong-target', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-wrong-target-release', encumbrance.id),
    );
    assert.equal(
      await releaseRefusalCode(() => world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id })),
      'ENCUMBRANCE_RELEASE_EXECUTOR_TARGET_MISMATCH',
    );
    assert.equal(await statusOf(world, encumbrance.id), 'active');

    const attempts = await world.encumbranceRelease.listExecutions(TENANT_CONTEXT, outcome.mandate!.id);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]?.outcome, 'confirmed_failure');
    assert.equal(attempts[0]?.failureCode, 'executor_target_mismatch');
  });

  it('retrying a confirmed release performs one external call and one terminalization', async () => {
    const executor = createInMemoryEncumbranceReleaseExecutorPort({ now: () => GA_NOW });
    const world = buildGovernedAuthorityWorld({ releaseExecutor: executor });
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-retry', 4_000);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-retry-release', encumbrance.id),
    );
    const first = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });
    assert.equal(first.terminalized, true);

    const replay = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });
    assert.equal(replay.terminalized, false, 'the second call finds the work already done');
    assert.equal(replay.execution.id, first.execution.id, 'and reports the same confirmed execution');
    assert.equal(replay.encumbrance.status, 'released');

    assert.equal(executor.attempts.length, 1, 'the executor is not called again for a mandate already spent');
    assert.equal((await world.encumbranceRelease.listExecutions(TENANT_CONTEXT, outcome.mandate!.id)).length, 1);

    const after = await capacity(world);
    assert.ok(after.outcome === 'available');
    assert.deepEqual(after.available, bp(5_000), 'capacity restored exactly once');
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(5_000));
  });
});

// ---------------------------------------------------------------------------
// What a release must leave alone.
// ---------------------------------------------------------------------------

describe('a release changes exactly one thing', () => {
  it('releases the named constraint and leaves its siblings standing', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(10_000));
    const a = await encumber(world, 'req-sibling-a', 3_000);
    const b = await encumber(world, 'req-sibling-b', 2_000);

    const before = await capacity(world);
    assert.ok(before.outcome === 'available');
    assert.deepEqual(before.encumbered, bp(5_000));
    assert.deepEqual(before.available, bp(5_000));

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-sibling-release-a', a.encumbrance.id),
    );
    await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });

    assert.equal(await statusOf(world, a.encumbrance.id), 'released');
    assert.equal(await statusOf(world, b.encumbrance.id), 'active', 'the sibling is untouched');

    const after = await capacity(world);
    assert.ok(after.outcome === 'available');
    assert.deepEqual(after.encumbered, bp(2_000), 'exactly B still constrains');
    assert.deepEqual(after.available, bp(8_000), 'and not 10 000');
    assert.deepEqual(after.held, bp(10_000));
  });

  it('leaves a live reservation for another action intact', async () => {
    // A release ends a persistent constraint. It says nothing about a
    // *pre-execution* commitment some other authorization is holding, and
    // freeing that too would hand a competitor capacity a live mandate is still
    // entitled to execute against.
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const constrained = await encumber(world, 'req-reservation-a', 3_000);

    const pending = await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest('req-reservation-b', ALICE, collateralizationTerms([ECONOMIC], bp(2_000))),
    );
    assert.equal(pending.status, 'allowed', 'the second authorization takes the remaining 2 000 as a commitment');

    const midway = await capacity(world);
    assert.ok(midway.outcome === 'available');
    assert.deepEqual(midway.encumbered, bp(3_000));
    assert.deepEqual(midway.committed, bp(2_000));
    assert.deepEqual(midway.available, bp(0));

    const release = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-reservation-release', constrained.encumbrance.id),
    );
    await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: release.mandate!.id });

    const after = await capacity(world);
    assert.ok(after.outcome === 'available');
    assert.equal(after.encumbered, undefined, 'the constraint is gone');
    assert.deepEqual(after.committed, bp(2_000), 'and the other mandate still holds what it may still execute');
    assert.deepEqual(after.available, bp(3_000), 'so 3 000 comes back, not 5 000');
  });

  it('touches no other holder, no other right and no other resource', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    await seedPosition(world, ALICE, USAGE, bp(5_000));
    await seedPosition(world, BOB, ECONOMIC, bp(5_000));

    const aliceEconomic = await encumber(world, 'req-isolation-alice', 4_000);
    const aliceUsage = await encumber(world, 'req-isolation-usage', 4_000, { rights: [USAGE] });
    const bobEconomic = await encumber(world, 'req-isolation-bob', 4_000, { holderRef: BOB });

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-isolation-release', aliceEconomic.encumbrance.id),
    );
    await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });

    assert.equal(await statusOf(world, aliceEconomic.encumbrance.id), 'released');
    assert.equal(await statusOf(world, aliceUsage.encumbrance.id), 'active', 'a different right of the same holder');
    assert.equal(await statusOf(world, bobEconomic.encumbrance.id), 'active', 'and a different holder entirely');

    const bobCapacity = await capacity(world, BOB);
    assert.ok(bobCapacity.outcome === 'available');
    assert.deepEqual(bobCapacity.available, bp(1_000), 'Bob’s capacity is exactly what it was');
  });

  it('creates no transition, no reservation and no new constraint', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-no-side-effects', 4_000);

    const before = await world.authorityStore.getProvenance(ADMIN_CONTEXT, GA_TENANT_A, ALICE, { kind: GA_ASSET.kind, id: GA_ASSET.id }, ECONOMIC);

    const outcome = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-no-side-effects-release', encumbrance.id),
    );
    const executed = await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });

    const after = await world.authorityStore.getProvenance(ADMIN_CONTEXT, GA_TENANT_A, ALICE, { kind: GA_ASSET.kind, id: GA_ASSET.id }, ECONOMIC);
    assert.equal(after.transitions.length, before.transitions.length, 'a release is not a movement of authority');
    assert.deepEqual(after.position.scope, before.position.scope, 'and not a credit to the holder');

    // No reservation was acquired for the release action, and no second
    // constraint was created by discharging the first.
    assert.equal(
      (await world.authorityStore.listReservationsByMandateRef(ADMIN_CONTEXT, GA_TENANT_A, outcome.mandate!.id)).length,
      0,
      'a release commits nothing, so it reserves nothing',
    );
    assert.equal(
      (await world.authorityStore.listActiveEncumbrances(ADMIN_CONTEXT, {
        tenantId: GA_TENANT_A,
        holderRef: ALICE,
        resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
        governedRight: ECONOMIC,
        at: GA_NOW,
      })).length,
      0,
      'and releasing one constraint creates no second one',
    );

    // Nothing was credited to the secured party either — there is no position
    // for it at all, because a collateralization never moved anything to it.
    assert.equal(await heldScope(world, GA_SECURED_PARTY_REF, ECONOMIC), null);
    assert.equal(executed.encumbrance.holderRef, ALICE, 'and the constraint still records whose authority it constrained');
  });

  it('unblocks a transfer the constraint was blocking, without authorizing it', async () => {
    // Phase 5.5 left two defences between an active constraint and a transfer
    // that would strand it, and this measures which one actually fires.
    //
    // The *capacity gate* fires first: with 5 000 held and 4 000 constrained,
    // moving 2 000 cannot acquire its commitment at all, and the refusal is
    // `AVAILABILITY_INSUFFICIENT`. The structural invariant
    // (`ENCUMBRANCE_UNCOVERED`, exercised directly by
    // `governed-authority-encumbrance-scenario.test.ts`) sits behind it as the
    // belt-and-braces check for a movement that reached execution without one —
    // an unenrolled resource, an imported mandate, a deployment that adopted
    // reservation later. Both remain, and the honest statement of what a
    // reviewer will see through the ordinary path is the first.
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, bp(5_000));
    const { encumbrance } = await encumber(world, 'req-structural', 4_000);

    assert.equal(
      await releaseRefusalCode(() =>
        world.transfer.requestTransfer(
          TENANT_CONTEXT,
          GA_TENANT_A,
          transferRequest('req-structural-transfer-blocked', transferTerms(ALICE, BOB, [ECONOMIC], bp(2_000))),
        ),
      ),
      'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
      'the constraint blocks the transfer while it stands',
    );

    const release = await world.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-structural-release', encumbrance.id),
    );
    await world.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: release.mandate!.id });

    // The release did not perform the transfer, and did not pre-authorize it.
    // The same movement now has to be governed on its own terms, and is.
    const afterRelease = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('req-structural-transfer-allowed', transferTerms(ALICE, BOB, [ECONOMIC], bp(2_000))),
    );
    assert.equal(afterRelease.status, 'allowed');
    await world.transfer.recordExecution(TENANT_CONTEXT, {
      mandateId: afterRelease.mandate!.id,
      executedBy: 'provider-transfer-agent-c',
      executedAt: GA_NOW,
      transferorRef: ALICE,
      transfereeRef: BOB,
      rights: [ECONOMIC],
      transferredScope: bp(2_000),
      transferEffectiveAt: GA_NOW,
      registry: 'registry-alpha',
    });

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), bp(3_000));
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), bp(2_000));
  });
});
