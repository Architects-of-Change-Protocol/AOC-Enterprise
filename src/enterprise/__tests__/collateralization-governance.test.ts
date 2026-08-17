import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES,
  ENTERPRISE_COLLATERALIZE_CAPABILITY,
  ENTERPRISE_COLLATERAL_RELEASE_TYPES,
} from '@aoc-enterprise/collateralization-mandate';

import { CollateralizationGovernanceError, isCollateralizationGovernanceError } from '../collateralization-governance/errors.js';
import type { CollateralizationGovernanceContext } from '../collateralization-governance/contracts.js';
import {
  COLLATERALIZATION_MANDATE_EXPIRES_AT,
  COLLATERAL_ASSET,
  COLLATERAL_ASSET_SCOPE,
  COLLATERAL_DESK_ACTOR_ID,
  COLLATERAL_DESK_PASSPORT_ID,
  COLLATERAL_DESK_TOKEN_ID,
  COLLATERAL_EXECUTOR_REF,
  COLLATERAL_OUTSIDER_ACTOR_ID,
  COLLATERAL_STEWARD_ACTOR_ID,
  COLLATERAL_TENANT_A,
  COLLATERAL_TENANT_B,
  COLLATERAL_TENANT_B_ASSET,
  COLLATERAL_TRUST_DOMAIN_ID,
  OTHER_EXECUTOR_REF,
  OTHER_SECURED_OBLIGATION_REF,
  OTHER_SECURED_PARTY_REF,
  SECURED_OBLIGATION_REF,
  SECURED_PARTY_REF,
  buildCollateralStewardRequest,
  buildCollateralizationWorld,
  buildConformingExecution,
  divisibleCollateralTerms,
  twentyPercentCollateralTerms,
} from './collateralization-support.js';

const TENANT_A_CONTEXT: CollateralizationGovernanceContext = { system: false, organizationId: COLLATERAL_TENANT_A, actorId: 'operator-a' };
const TENANT_B_CONTEXT: CollateralizationGovernanceContext = { system: false, organizationId: COLLATERAL_TENANT_B, actorId: 'operator-b' };

const ECONOMIC_RIGHTS = [
  ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.ECONOMIC_INTEREST,
  ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.REVENUE_RIGHT,
] as const;

async function expectCollateralizationError(code: string, run: () => Promise<unknown>): Promise<CollateralizationGovernanceError> {
  try {
    await run();
  } catch (error) {
    assert.ok(isCollateralizationGovernanceError(error), `expected a CollateralizationGovernanceError, received ${String(error)}`);
    assert.equal(error.code, code);
    return error;
  }
  throw new Error(`expected ${code} to be thrown`);
}

/** The happy path, and the proof that it went through the canonical governance lifecycle rather than around it. */
describe('COLLATERALIZE — authorized request', () => {
  it('produces an allowed decision and a mandate carrying exactly the requested terms', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());

    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate, 'an allowed COLLATERALIZE decision must produce a mandate');
    const mandate = outcome.mandate;

    assert.equal(mandate.status, 'active');
    assert.equal(mandate.organizationId, COLLATERAL_TENANT_A);
    assert.equal(mandate.assetKind, COLLATERAL_ASSET.kind);
    assert.equal(mandate.assetId, COLLATERAL_ASSET.id);
    assert.equal(mandate.requestedBy, COLLATERAL_STEWARD_ACTOR_ID);
    assert.deepEqual(mandate.terms, twentyPercentCollateralTerms());
    assert.equal(mandate.decisionRef, outcome.decisionId);
    assert.equal(mandate.evaluationRef, outcome.evaluationId);
    assert.equal(mandate.expiresAt, COLLATERALIZATION_MANDATE_EXPIRES_AT);
    assert.equal(mandate.committedScope, undefined, 'nothing has been committed until an external arrangement is reported');
    assert.equal(mandate.executionCount, 0);
  });

  it('keeps the requester, the secured party and the executor as three distinct identities', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandate = outcome.mandate;
    assert.ok(mandate);

    assert.equal(mandate.requestedBy, COLLATERAL_STEWARD_ACTOR_ID);
    assert.equal(mandate.terms.securedPartyRef, SECURED_PARTY_REF);
    assert.equal(mandate.terms.executorRef, COLLATERAL_EXECUTOR_REF);
    assert.equal(mandate.terms.securedObligationRef, SECURED_OBLIGATION_REF);

    const distinct = new Set([mandate.requestedBy, mandate.terms.securedPartyRef, mandate.terms.executorRef, mandate.terms.securedObligationRef]);
    assert.equal(distinct.size, 4, 'the requester, secured party, executor and secured obligation must never collapse into one another');
  });

  it('routes the request through the Kernel as the COLLATERALIZE action and commits it to the Governance Store', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());

    const record = await world.governanceStore.getByEvaluationId({ system: true, organizationId: COLLATERAL_TENANT_A }, outcome.evaluationId);
    assert.ok(record, 'the COLLATERALIZE evaluation must be durably recorded by the canonical Governance Store');
    assert.equal(record.request.actionType, ENTERPRISE_COLLATERALIZE_CAPABILITY);
    assert.equal(record.request.resourceScope, COLLATERAL_ASSET_SCOPE);
    assert.equal(record.request.organizationId, COLLATERAL_TENANT_A);
    assert.equal(record.evaluation.status, 'allowed');
    assert.equal(record.evaluation.decisionId, outcome.decisionId);

    const verification = await world.governanceStore.verify({ system: true, organizationId: COLLATERAL_TENANT_A }, outcome.evaluationId);
    assert.equal(verification.valid, true, `governance record integrity failed: ${JSON.stringify(verification.failures)}`);
  });

  it('links the issued mandate to the governance aggregate that produced it', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());

    const record = await world.governanceStore.getByEvaluationId({ system: true, organizationId: COLLATERAL_TENANT_A }, outcome.evaluationId);
    const referencedIds = (record?.references ?? []).map((reference) => reference.externalId);
    assert.ok(referencedIds.includes(outcome.mandate?.id ?? ''), 'the mandate must be reachable from the evaluation that authorized it');
  });
});

describe('COLLATERALIZE — authority', () => {
  it('gives an unrecognized requester no mandate', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({ requestedBy: COLLATERAL_OUTSIDER_ACTOR_ID, context: {} }),
    );

    assert.notEqual(outcome.status, 'allowed');
    assert.equal(outcome.mandate, undefined, 'an actor with no recognized authority must never receive a mandate');
    // The denial is still a governed outcome: it is durably recorded.
    const record = await world.governanceStore.getByEvaluationId({ system: true, organizationId: COLLATERAL_TENANT_A }, outcome.evaluationId);
    assert.ok(record, 'a denial is a governance outcome and must be durably recorded like any other');
  });

  it('never converts a governance denial into an exception', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({ requestedBy: COLLATERAL_OUTSIDER_ACTOR_ID, context: {} }),
    );
    assert.ok(outcome.reasonCodes.length > 0, 'a denial must carry the Kernel’s own reason codes');
  });
});

describe('COLLATERALIZE — approvals', () => {
  it('issues no mandate while an approval is still outstanding', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({
        requestedBy: COLLATERAL_DESK_ACTOR_ID,
        principalActorId: COLLATERAL_STEWARD_ACTOR_ID,
        actorType: 'agent',
        context: { passportId: COLLATERAL_DESK_PASSPORT_ID, capabilityTokenId: COLLATERAL_DESK_TOKEN_ID },
      }),
    );

    assert.notEqual(outcome.status, 'allowed', 'an outstanding approval is not authorization');
    assert.equal(outcome.mandate, undefined);
  });
});

describe('COLLATERALIZE — scope', () => {
  it('keeps 20% as 20% and never silently becomes 100%', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.deepEqual(outcome.mandate?.terms.scope, { kind: 'proportional', basisPoints: 2000 });
  });

  it('refuses an execution that claims the whole of the rights', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';

    const error = await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingExecution(mandateId, { committedScope: { kind: 'proportional', basisPoints: 10_000 } }),
      ),
    );
    assert.equal(error.details?.refusalCode, 'SCOPE_EXCEEDS_MANDATE');
  });

  it('refuses a second commitment that would exceed the authorized scope cumulatively', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({ terms: divisibleCollateralTerms() }),
    );
    const mandateId = outcome.mandate?.id ?? '';

    const first = await world.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingExecution(mandateId, { executionId: 'exec-1', committedScope: { kind: 'proportional', basisPoints: 1500 } }),
    );
    assert.deepEqual(first.mandate.committedScope, { kind: 'proportional', basisPoints: 1500 });

    const error = await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingExecution(mandateId, { executionId: 'exec-2', committedScope: { kind: 'proportional', basisPoints: 1500 } }),
      ),
    );
    assert.equal(error.details?.refusalCode, 'CUMULATIVE_SCOPE_EXCEEDS_MANDATE');

    // The headroom that genuinely remains is still usable.
    const second = await world.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingExecution(mandateId, { executionId: 'exec-3', committedScope: { kind: 'proportional', basisPoints: 500 } }),
    );
    assert.deepEqual(second.mandate.committedScope, { kind: 'proportional', basisPoints: 2000 });
  });
});

describe('COLLATERALIZE — identity bindings', () => {
  it('refuses an execution that substitutes the secured obligation', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const error = await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingExecution(outcome.mandate?.id ?? '', { securedObligationRef: OTHER_SECURED_OBLIGATION_REF }),
      ),
    );
    assert.equal(error.details?.refusalCode, 'SECURED_OBLIGATION_NOT_AUTHORIZED');
  });

  it('refuses an execution that substitutes the secured party', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const error = await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(outcome.mandate?.id ?? '', { securedPartyRef: OTHER_SECURED_PARTY_REF })),
    );
    assert.equal(error.details?.refusalCode, 'SECURED_PARTY_NOT_AUTHORIZED');
  });

  it('refuses an execution by an unauthorized executor', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const error = await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(outcome.mandate?.id ?? '', { executorRef: OTHER_EXECUTOR_REF })),
    );
    assert.equal(error.details?.refusalCode, 'EXECUTOR_NOT_AUTHORIZED');
  });

  it('refuses an execution reported from a registry, jurisdiction or ranking the mandate does not permit', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';

    for (const [override, refusalCode] of [
      [{ externalRegistry: 'registry-omega' }, 'REGISTRY_NOT_PERMITTED'],
      [{ jurisdiction: 'jurisdiction-z' }, 'JURISDICTION_NOT_PERMITTED'],
      [{ priorityRank: 2 }, 'PRIORITY_RANK_NOT_AUTHORIZED'],
      [{ securedAmount: { minorUnits: 9_999_999_00, currency: 'unit-alpha' } }, 'SECURED_AMOUNT_EXCEEDS_MANDATE'],
    ] as const) {
      const error = await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
        world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, override)),
      );
      assert.equal(error.details?.refusalCode, refusalCode);
    }
  });
});

describe('COLLATERALIZE — external execution evidence', () => {
  it('records a conforming arrangement and advances the committed scope', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';

    const recorded = await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId));

    assert.equal(recorded.execution.mandateId, mandateId);
    assert.equal(recorded.execution.securedObligationRef, SECURED_OBLIGATION_REF);
    assert.equal(recorded.execution.securedPartyRef, SECURED_PARTY_REF);
    assert.equal(recorded.execution.externalAgreementReference, 'agreement-2026-0001');
    assert.deepEqual(recorded.mandate.committedScope, { kind: 'proportional', basisPoints: 2000 });
    assert.equal(recorded.mandate.executionCount, 1);
    assert.equal(recorded.mandate.status, 'active', 'recording evidence never changes the authorization’s own status');
  });

  it('refuses a second arrangement when the mandate prohibits additional collateralization', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';

    await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-1' }));
    const error = await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingExecution(mandateId, { executionId: 'exec-2', committedScope: { kind: 'proportional', basisPoints: 1 } }),
      ),
    );
    assert.equal(error.details?.refusalCode, 'ADDITIONAL_COLLATERALIZATION_PROHIBITED');
  });

  it('refuses to record the same arrangement twice', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';

    await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-1' }));
    await expectCollateralizationError('COLLATERALIZATION_EXECUTION_ALREADY_RECORDED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-1' })),
    );

    const executions = await world.service.listExecutions(TENANT_A_CONTEXT, mandateId);
    assert.equal(executions.length, 1, 'a replayed execution must never accumulate a second commitment');
  });
});

describe('COLLATERALIZE — release and discharge evidence', () => {
  it('records a reported release without changing the authorization or restoring headroom', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';

    const executed = await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-1' }));

    const release = await world.service.recordRelease(TENANT_A_CONTEXT, {
      mandateId,
      executionId: executed.execution.id,
      reportedBy: COLLATERAL_EXECUTOR_REF,
      releasedAt: '2026-03-01T00:00:00.000Z',
      releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.DISCHARGED,
      externalReleaseReference: 'discharge-2026-0001',
    });

    assert.equal(release.executionId, executed.execution.id);
    assert.equal(release.releaseType, 'discharged');

    const after = await world.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(after.status, 'active', 'a reported release is an observation, never a mandate state transition');
    assert.deepEqual(after.committedScope, { kind: 'proportional', basisPoints: 2000 }, 'a reported release must never manufacture fresh headroom');
    assert.equal(after.executionCount, 1);
  });

  it('refuses a release that references an arrangement AOC has no evidence of', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';

    await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_FOUND', () =>
      world.service.recordRelease(TENANT_A_CONTEXT, {
        mandateId,
        executionId: 'execution-that-never-happened',
        reportedBy: COLLATERAL_EXECUTOR_REF,
        releasedAt: '2026-03-01T00:00:00.000Z',
        releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.RELEASED,
      }),
    );
  });

  it('accepts a release reported after authority was revoked', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';
    const executed = await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-1' }));

    await world.service.revokeMandate(TENANT_A_CONTEXT, {
      mandateId,
      reason: 'facility refinanced',
      requestedBy: COLLATERAL_STEWARD_ACTOR_ID,
    });

    // Reports about an arrangement's end arrive after authority has lapsed
    // far more often than before it; refusing them would discard exactly the
    // evidence an auditor needs.
    const release = await world.service.recordRelease(TENANT_A_CONTEXT, {
      mandateId,
      executionId: executed.execution.id,
      reportedBy: COLLATERAL_EXECUTOR_REF,
      releasedAt: '2026-04-01T00:00:00.000Z',
      releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.SATISFIED,
    });
    assert.equal(release.releaseType, 'satisfied');
  });
});

describe('COLLATERALIZE — revocation', () => {
  it('withdraws authority for further collateralization without touching evidence already recorded', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({ terms: divisibleCollateralTerms() }),
    );
    const mandateId = outcome.mandate?.id ?? '';

    await world.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingExecution(mandateId, { executionId: 'exec-1', committedScope: { kind: 'proportional', basisPoints: 1000 } }),
    );

    const revoked = await world.service.revokeMandate(TENANT_A_CONTEXT, {
      mandateId,
      reason: 'facility cancelled',
      requestedBy: COLLATERAL_STEWARD_ACTOR_ID,
    });

    assert.equal(revoked.kind, 'revoked');
    assert.equal(revoked.mandate.status, 'revoked');
    assert.equal(revoked.revocation.executionsAtRevocation, 1);
    assert.deepEqual(
      revoked.revocation.committedScopeAtRevocation,
      { kind: 'proportional', basisPoints: 1000 },
      'revocation preserves how far the authorization had already been exercised',
    );

    // The already-recorded arrangement is untouched: AOC never claims to have
    // released a security interest an external system created.
    const executions = await world.service.listExecutions(TENANT_A_CONTEXT, mandateId);
    assert.equal(executions.length, 1);
    assert.deepEqual(executions[0]?.committedScope, { kind: 'proportional', basisPoints: 1000 });

    // But no further collateralization is authorized.
    const error = await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingExecution(mandateId, { executionId: 'exec-2', committedScope: { kind: 'proportional', basisPoints: 100 } }),
      ),
    );
    assert.equal(error.details?.refusalCode, 'MANDATE_REVOKED');
  });

  it('is idempotent', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';

    const first = await world.service.revokeMandate(TENANT_A_CONTEXT, { mandateId, reason: 'r', requestedBy: COLLATERAL_STEWARD_ACTOR_ID });
    const second = await world.service.revokeMandate(TENANT_A_CONTEXT, { mandateId, reason: 'r', requestedBy: COLLATERAL_STEWARD_ACTOR_ID });

    assert.equal(first.kind, 'revoked');
    assert.equal(second.kind, 'already-revoked');
    assert.equal(second.revocation.id, first.revocation.id);
  });
});

describe('COLLATERALIZE — replay', () => {
  it('returns the original authorization when a request is replayed, never a second one', async () => {
    const world = buildCollateralizationWorld();
    // Both the request id *and* the correlation id are pinned: the whole
    // serialized request travels into the governed payload, so an
    // auto-generated correlation id would make the replay a genuinely
    // different request rather than a replay of the same one.
    const input = buildCollateralStewardRequest({
      requestId: 'collateralization-request-fixed',
      correlationId: 'collateralization-correlation-fixed',
    });

    const first = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, input);
    const second = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, input);

    assert.equal(first.status, 'allowed');
    assert.ok(first.mandate);
    assert.equal(second.mandate?.id, first.mandate?.id, 'replaying a request must return the original authorization, never a second one');
    assert.equal(second.evaluationId, first.evaluationId, 'the replay resolves to the already-committed governance aggregate');
  });

  it('issues no mandate at all when the Kernel suppresses the replay as a duplicate action', async () => {
    const world = buildCollateralizationWorld();
    // With an `idempotencyKey`, the duplicate is caught earlier — by the
    // Kernel, which denies it outright rather than re-deriving the original
    // decision. The invariant that matters is the same either way: exactly
    // one mandate exists for the request.
    const input = buildCollateralStewardRequest({
      requestId: 'collateralization-request-keyed',
      correlationId: 'collateralization-correlation-keyed',
      idempotencyKey: 'idem-1',
    });

    const first = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, input);
    const second = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, input);

    assert.equal(first.status, 'allowed');
    assert.ok(first.mandate);
    assert.notEqual(second.status, 'allowed');
    assert.equal(second.mandate, undefined);
    assert.ok(second.reasonCodes.includes('ACTION_DUPLICATE_SUPPRESSED'));

    const stored = await world.mandateStore.getMandateByRequestRef(TENANT_A_CONTEXT, 'collateralization-request-keyed');
    assert.equal(stored?.id, first.mandate.id, 'exactly one mandate exists for the request, whichever layer caught the duplicate');
  });
});

describe('COLLATERALIZE — tenancy', () => {
  it('refuses to collateralize another tenant’s asset before the Kernel is ever consulted', async () => {
    const world = buildCollateralizationWorld();
    await expectCollateralizationError('COLLATERALIZATION_ASSET_TENANT_MISMATCH', () =>
      world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest({ asset: COLLATERAL_TENANT_B_ASSET })),
    );
  });

  it('never lets one tenant read, revoke, or record against another tenant’s mandate', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';

    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => world.service.getMandate(TENANT_B_CONTEXT, mandateId));
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () =>
      world.service.revokeMandate(TENANT_B_CONTEXT, { mandateId, reason: 'r', requestedBy: 'actor-b' }),
    );
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () =>
      world.service.recordExecution(TENANT_B_CONTEXT, buildConformingExecution(mandateId)),
    );
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => world.service.listExecutions(TENANT_B_CONTEXT, mandateId));
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => world.service.listReleases(TENANT_B_CONTEXT, mandateId));
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => world.service.getEvidenceLineage(TENANT_B_CONTEXT, mandateId));
  });

  it('requires a non-system caller to name a tenant scope', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    await expectCollateralizationError('COLLATERALIZATION_TENANT_SCOPE_REQUIRED', () =>
      world.service.getMandate({ system: false }, outcome.mandate?.id ?? ''),
    );
  });
});

describe('COLLATERALIZE — evidence lineage', () => {
  it('reconstructs the whole governance chain from stored references alone', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';

    const executed = await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-1' }));
    await world.service.recordRelease(TENANT_A_CONTEXT, {
      mandateId,
      executionId: executed.execution.id,
      reportedBy: COLLATERAL_EXECUTOR_REF,
      releasedAt: '2026-03-01T00:00:00.000Z',
      releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.RELEASED,
    });

    const lineage = await world.service.getEvidenceLineage(TENANT_A_CONTEXT, mandateId);

    // Why was collateralization permitted? Who had authority?
    assert.equal(lineage.decisionRef, outcome.decisionId);
    assert.equal(lineage.evaluationRef, outcome.evaluationId);
    assert.equal(lineage.requestedBy, COLLATERAL_STEWARD_ACTOR_ID);
    assert.equal(lineage.requestRef, outcome.requestId);
    // What rights, and what portion of them?
    assert.deepEqual([...lineage.terms.rights].sort(), [...ECONOMIC_RIGHTS].sort());
    assert.deepEqual(lineage.terms.scope, { kind: 'proportional', basisPoints: 2000 });
    assert.deepEqual(lineage.committedScope, { kind: 'proportional', basisPoints: 2000 });
    // What obligation was secured, for whom, executed by whom?
    assert.equal(lineage.securedObligationRef, SECURED_OBLIGATION_REF);
    assert.equal(lineage.securedPartyRef, SECURED_PARTY_REF);
    assert.equal(lineage.executorRef, COLLATERAL_EXECUTOR_REF);
    // Was there an external execution, and a reported release?
    assert.deepEqual(lineage.executionRefs, ['exec-1']);
    assert.equal(lineage.releaseRefs.length, 1);
    assert.equal(lineage.revocationRef, undefined);
  });

  it('correlates external execution and release evidence back to the authorizing aggregate', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';
    const executed = await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-1' }));
    const release = await world.service.recordRelease(TENANT_A_CONTEXT, {
      mandateId,
      executionId: executed.execution.id,
      reportedBy: COLLATERAL_EXECUTOR_REF,
      releasedAt: '2026-03-01T00:00:00.000Z',
      releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.TERMINATED,
    });

    const record = await world.governanceStore.getByEvaluationId({ system: true, organizationId: COLLATERAL_TENANT_A }, outcome.evaluationId);
    const referencedIds = (record?.references ?? []).map((reference) => reference.externalId);
    assert.ok(referencedIds.includes(mandateId));
    assert.ok(referencedIds.includes('exec-1'));
    assert.ok(referencedIds.includes(release.id));
  });
});

describe('COLLATERALIZE — boundary', () => {
  it('never asserts that AOC created, perfected, valued or ranked anything', async () => {
    const world = buildCollateralizationWorld();
    const outcome = await world.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    const mandateId = outcome.mandate?.id ?? '';
    const executed = await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-1' }));

    // Everything AOC holds about the external world came from the report, and
    // is stored under an `external*`/reported name -- never as a determination.
    assert.equal(executed.execution.priorityRank, 1, 'the ranking is what the external system reported');
    assert.equal(executed.execution.externalFilingReference, 'filing-2026-0001');
    assert.equal(executed.execution.externalRegistry, 'registry-alpha');

    // The mandate itself carries no valuation, no interest rate, no LTV, and
    // no lien record: only the declared ceiling the requester asked for.
    const mandate = await world.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.deepEqual(mandate.terms.constraints.maximumSecuredAmount, { minorUnits: 5_000_000_00, currency: 'unit-alpha' });
    assert.equal(Object.prototype.hasOwnProperty.call(mandate, 'valuation'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(mandate, 'interestRate'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(mandate, 'loanToValue'), false);
  });

  it('does not prohibit a second collateral interest as a universal rule', async () => {
    const world = buildCollateralizationWorld();

    // Two separate authorizations over the same asset and rights, each within
    // its own scope, both succeed. Exclusivity, priority and aggregate limits
    // are policy/constraint decisions, never assumptions this module makes.
    const first = await world.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({
        requestId: 'collateralization-request-a',
        terms: twentyPercentCollateralTerms({ constraints: { ...twentyPercentCollateralTerms().constraints, exclusive: false } }),
      }),
    );
    const second = await world.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({
        requestId: 'collateralization-request-b',
        terms: twentyPercentCollateralTerms({
          scope: { kind: 'proportional', basisPoints: 1000 },
          securedObligationRef: OTHER_SECURED_OBLIGATION_REF,
          securedPartyRef: OTHER_SECURED_PARTY_REF,
          constraints: { ...twentyPercentCollateralTerms().constraints, exclusive: false, requiredPriorityRank: 2 },
        }),
      }),
    );

    assert.equal(first.status, 'allowed');
    assert.equal(second.status, 'allowed');
    assert.notEqual(second.mandate?.id, first.mandate?.id);
  });
});
