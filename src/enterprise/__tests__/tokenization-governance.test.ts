import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ENTERPRISE_TOKENIZED_RIGHT_TYPES, ENTERPRISE_TOKENIZE_CAPABILITY } from '@aoc-enterprise/tokenization-mandate';

import { isTokenizationGovernanceError, TokenizationGovernanceError } from '../tokenization-governance/errors.js';
import type { TokenizationGovernanceContext } from '../tokenization-governance/contracts.js';
import {
  BUILDING_ASSET,
  BUILDING_SCOPE,
  DESK_ACTOR_ID,
  DESK_PASSPORT_ID,
  DESK_TOKEN_ID,
  EXECUTOR_REF,
  OUTSIDER_ACTOR_ID,
  STEWARD_ACTOR_ID,
  TENANT_A,
  TENANT_B,
  TENANT_B_ASSET,
  TOKENIZATION_MANDATE_EXPIRES_AT,
  TOKENIZATION_NOW,
  TRUST_DOMAIN_ID,
  buildStewardRequest,
  buildTokenizationWorld,
  twentyPercentEconomicTerms,
} from './tokenization-support.js';

const TENANT_A_CONTEXT: TokenizationGovernanceContext = { system: false, organizationId: TENANT_A, actorId: 'operator-a' };
const TENANT_B_CONTEXT: TokenizationGovernanceContext = { system: false, organizationId: TENANT_B, actorId: 'operator-b' };

const ECONOMIC_RIGHTS = [ENTERPRISE_TOKENIZED_RIGHT_TYPES.ECONOMIC_INTEREST, ENTERPRISE_TOKENIZED_RIGHT_TYPES.REVENUE_RIGHT] as const;

async function expectTokenizationError(code: string, run: () => Promise<unknown>): Promise<TokenizationGovernanceError> {
  try {
    await run();
  } catch (error) {
    assert.ok(isTokenizationGovernanceError(error), `expected a TokenizationGovernanceError, received ${String(error)}`);
    assert.equal(error.code, code);
    return error;
  }
  throw new Error(`expected ${code} to be thrown`);
}

/** The happy path, and the proof that it went through the canonical governance lifecycle rather than around it. */
describe('TOKENIZE — authorized request', () => {
  it('produces an allowed decision and a mandate carrying exactly the requested terms', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());

    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate, 'an allowed TOKENIZE decision must produce a mandate');
    const mandate = outcome.mandate;

    assert.equal(mandate.status, 'active');
    assert.equal(mandate.organizationId, TENANT_A);
    assert.equal(mandate.assetKind, BUILDING_ASSET.kind);
    assert.equal(mandate.assetId, BUILDING_ASSET.id);
    assert.equal(mandate.requestedBy, STEWARD_ACTOR_ID);
    assert.deepEqual(mandate.terms, twentyPercentEconomicTerms());
    assert.equal(mandate.decisionRef, outcome.decisionId);
    assert.equal(mandate.evaluationRef, outcome.evaluationId);
    assert.equal(mandate.expiresAt, TOKENIZATION_MANDATE_EXPIRES_AT);
    assert.equal(mandate.issuedUnits, 0);
    assert.equal(mandate.executionCount, 0);
  });

  it('routes the request through the Kernel as the TOKENIZE capability and commits it to the Governance Store', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());

    const record = await world.governanceStore.getByEvaluationId({ system: true, organizationId: TENANT_A }, outcome.evaluationId);
    assert.ok(record, 'the TOKENIZE evaluation must be durably recorded by the canonical Governance Store');
    assert.equal(record.request.actionType, ENTERPRISE_TOKENIZE_CAPABILITY);
    assert.equal(record.request.resourceScope, BUILDING_SCOPE);
    assert.equal(record.request.organizationId, TENANT_A);
    assert.equal(record.evaluation.status, 'allowed');
    assert.equal(record.evaluation.decisionId, outcome.decisionId);

    const verification = await world.governanceStore.verify({ system: true, organizationId: TENANT_A }, outcome.evaluationId);
    assert.equal(verification.valid, true, `governance record integrity failed: ${JSON.stringify(verification.failures)}`);
  });
});

describe('TOKENIZE — unauthorized requester', () => {
  it('is denied by the canonical decision path and produces no mandate', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(
      TENANT_A_CONTEXT,
      TENANT_A,
      buildStewardRequest({ requestedBy: OUTSIDER_ACTOR_ID, context: {} }),
    );

    assert.equal(outcome.status, 'denied');
    assert.equal(outcome.mandate, undefined);
    assert.ok(outcome.reasonCodes.includes('RECOGNITION_ACTOR_UNKNOWN'));

    // The denial is still durably recorded -- a denied TOKENIZE request is
    // evidence, not a non-event.
    const record = await world.governanceStore.getByEvaluationId({ system: true, organizationId: TENANT_A }, outcome.evaluationId);
    assert.equal(record?.evaluation.status, 'denied');
  });

  it('never lets a requester grant itself TOKENIZE authority by asking twice', async () => {
    const world = buildTokenizationWorld();
    const first = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest({ requestedBy: OUTSIDER_ACTOR_ID, context: {} }));
    const second = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest({ requestedBy: OUTSIDER_ACTOR_ID, context: {} }));

    assert.equal(first.status, 'denied');
    assert.equal(second.status, 'denied');
    assert.equal(second.mandate, undefined);
  });
});

describe('TOKENIZE — approval required', () => {
  it('does not produce authorization while an approval is still outstanding', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(
      TENANT_A_CONTEXT,
      TENANT_A,
      buildStewardRequest({
        requestedBy: DESK_ACTOR_ID,
        principalActorId: STEWARD_ACTOR_ID,
        context: { passportId: DESK_PASSPORT_ID, capabilityTokenId: DESK_TOKEN_ID },
      }),
    );

    assert.equal(outcome.status, 'approval_required');
    assert.equal(outcome.mandate, undefined, 'an outstanding approval is not authorization and must never yield a mandate');
    assert.ok(outcome.reasonCodes.includes('APPROVAL_REQUIRED'));
  });
});

describe('TOKENIZE — partial scope', () => {
  it('authorizes exactly the requested subset and refuses an exercise beyond it', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    const mandate = outcome.mandate;
    assert.ok(mandate);

    assert.deepEqual(mandate.terms.scope, { kind: 'proportional', basisPoints: 2000 });

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId: mandate.id,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 10_000 },
        rights: [...ECONOMIC_RIGHTS],
      }),
    );
    assert.equal(error.details?.refusalCode, 'SCOPE_EXCEEDS_MANDATE');
  });

  it('refuses an exercise over a right the mandate never authorized', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    const mandate = outcome.mandate;
    assert.ok(mandate);

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId: mandate.id,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 1000 },
        rights: [ENTERPRISE_TOKENIZED_RIGHT_TYPES.OWNERSHIP_INTEREST],
      }),
    );
    assert.equal(error.details?.refusalCode, 'RIGHTS_NOT_AUTHORIZED');
  });
});

describe('TOKENIZE — constraints are carried and enforced', () => {
  it('preserves every declared constraint on the issued mandate', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);

    assert.deepEqual(outcome.mandate.terms.constraints, {
      maximumIssuedUnits: 2_000_000,
      permittedNetworks: ['network-alpha'],
      permittedTokenStandards: ['standard-registry-v1'],
      permittedJurisdictions: ['jurisdiction-a'],
      transferRestricted: true,
      additionalIssuanceAllowed: false,
    });
  });

  it('refuses an executor other than the one the mandate names', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId: outcome.mandate!.id,
        executorRef: 'provider-someone-else',
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 1000 },
        rights: [...ECONOMIC_RIGHTS],
      }),
    );
    assert.equal(error.details?.refusalCode, 'EXECUTOR_NOT_AUTHORIZED');
  });

  it('refuses issuance beyond the declared maximum', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(
      TENANT_A_CONTEXT,
      TENANT_A,
      buildStewardRequest({ terms: twentyPercentEconomicTerms({ constraints: { maximumIssuedUnits: 1000, additionalIssuanceAllowed: true } }) }),
    );
    assert.ok(outcome.mandate);

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId: outcome.mandate!.id,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 2000 },
        rights: [...ECONOMIC_RIGHTS],
        issuedUnits: 1001,
      }),
    );
    assert.equal(error.details?.refusalCode, 'MAXIMUM_ISSUANCE_EXCEEDED');
  });

  it('refuses a second issuance when the mandate prohibits additional issuance', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;

    const first = await world.service.recordExecution(TENANT_A_CONTEXT, {
      mandateId,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 2000 },
      rights: [...ECONOMIC_RIGHTS],
      issuedUnits: 500_000,
      externalSystem: 'provider-x',
      externalNetwork: 'network-alpha',
      externalTokenStandard: 'standard-registry-v1',
      externalContractReference: 'external-contract-1',
      externalTransactionReference: 'external-tx-1',
    });
    assert.equal(first.mandate.executionCount, 1);
    assert.equal(first.mandate.issuedUnits, 500_000);

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-03-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 2000 },
        rights: [...ECONOMIC_RIGHTS],
        issuedUnits: 1,
      }),
    );
    assert.equal(error.details?.refusalCode, 'ADDITIONAL_ISSUANCE_PROHIBITED');
  });

  it('rejects a replayed execution id rather than double-counting issued units', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(
      TENANT_A_CONTEXT,
      TENANT_A,
      buildStewardRequest({ terms: twentyPercentEconomicTerms({ constraints: { maximumIssuedUnits: 1_000, additionalIssuanceAllowed: true } }) }),
    );
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;

    const execution = {
      executionId: 'tokenization-execution-fixed',
      mandateId,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 2000 } as const,
      rights: [...ECONOMIC_RIGHTS],
      issuedUnits: 600,
    };
    await world.service.recordExecution(TENANT_A_CONTEXT, execution);
    await expectTokenizationError('TOKENIZATION_EXECUTION_ALREADY_RECORDED', () => world.service.recordExecution(TENANT_A_CONTEXT, execution));

    const mandate = await world.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(mandate.issuedUnits, 600, 'a replayed execution must not create additional issuance headroom');
    assert.equal(mandate.executionCount, 1);
  });
});

describe('TOKENIZE — revocation and expiration', () => {
  it('withdraws authority for further issuance without erasing evidence of issuance already performed', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(
      TENANT_A_CONTEXT,
      TENANT_A,
      buildStewardRequest({ terms: twentyPercentEconomicTerms({ constraints: { additionalIssuanceAllowed: true } }) }),
    );
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;

    await world.service.recordExecution(TENANT_A_CONTEXT, {
      mandateId,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 1000 },
      rights: [...ECONOMIC_RIGHTS],
      issuedUnits: 100,
      externalTransactionReference: 'external-tx-before-revocation',
    });

    const revoked = await world.service.revokeMandate(TENANT_A_CONTEXT, {
      mandateId,
      reason: 'authority-withdrawn',
      requestedBy: STEWARD_ACTOR_ID,
      revokedAt: '2026-03-01T00:00:00.000Z',
    });
    assert.equal(revoked.kind, 'revoked');
    assert.equal(revoked.mandate.status, 'revoked');
    assert.equal(revoked.revocation.executionsAtRevocation, 1);

    // Already-recorded external issuance evidence survives revocation intact:
    // AOC withdrew authority, it did not reach into an external system.
    const executions = await world.service.listExecutions(TENANT_A_CONTEXT, mandateId);
    assert.equal(executions.length, 1);
    assert.equal(executions[0]?.externalTransactionReference, 'external-tx-before-revocation');

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-04-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 500 },
        rights: [...ECONOMIC_RIGHTS],
      }),
    );
    assert.equal(error.details?.refusalCode, 'MANDATE_REVOKED');
  });

  it('is idempotent when revoked twice', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);

    const first = await world.service.revokeMandate(TENANT_A_CONTEXT, { mandateId: outcome.mandate.id, reason: 'authority-withdrawn', requestedBy: STEWARD_ACTOR_ID });
    const second = await world.service.revokeMandate(TENANT_A_CONTEXT, { mandateId: outcome.mandate.id, reason: 'authority-withdrawn', requestedBy: STEWARD_ACTOR_ID });

    assert.equal(first.kind, 'revoked');
    assert.equal(second.kind, 'already-revoked');
    assert.equal(second.revocation.id, first.revocation.id);
  });

  it('refuses an exercise attempted after the mandate expires', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId: outcome.mandate!.id,
        executorRef: EXECUTOR_REF,
        executedAt: '2027-01-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 1000 },
        rights: [...ECONOMIC_RIGHTS],
      }),
    );
    assert.equal(error.details?.refusalCode, 'MANDATE_EXPIRED');
  });
});

describe('TOKENIZE — evidence lineage', () => {
  it('traces an approved mandate back through the governance chain to the asset and the decision', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;

    await world.service.recordExecution(TENANT_A_CONTEXT, {
      mandateId,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 2000 },
      rights: [...ECONOMIC_RIGHTS],
      issuedUnits: 1_000,
    });

    const lineage = await world.service.getEvidenceLineage(TENANT_A_CONTEXT, mandateId);
    assert.equal(lineage.mandateId, mandateId);
    assert.deepEqual(lineage.asset, { kind: BUILDING_ASSET.kind, id: BUILDING_ASSET.id, tenantId: TENANT_A });
    assert.equal(lineage.decisionRef, outcome.decisionId);
    assert.equal(lineage.evaluationRef, outcome.evaluationId);
    assert.equal(lineage.executionRefs.length, 1);
    assert.deepEqual(lineage.terms.scope, { kind: 'proportional', basisPoints: 2000 });

    // Every reference resolves against a canonical store -- the mandate and the
    // external execution are both linked to the committed governance aggregate
    // via the Governance Store's own reference surface.
    const record = await world.governanceStore.getByEvaluationId({ system: true, organizationId: TENANT_A }, outcome.evaluationId);
    assert.ok(record);
    const referencedIds = record.references.map((reference) => reference.externalId);
    assert.ok(referencedIds.includes(mandateId), 'the mandate must be referenced from its own governance aggregate');
    assert.ok(referencedIds.includes(lineage.executionRefs[0] as string), 'external execution evidence must be referenced from the same aggregate');
  });
});

describe('TOKENIZE — tenant isolation', () => {
  it("refuses a request over another tenant's governed asset", async () => {
    const world = buildTokenizationWorld();
    await expectTokenizationError('TOKENIZATION_ASSET_TENANT_MISMATCH', () =>
      world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest({ asset: TENANT_B_ASSET })),
    );
  });

  it("refuses a caller acting outside its own organization's scope", async () => {
    const world = buildTokenizationWorld();
    await expectTokenizationError('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () =>
      world.service.requestTokenization(TENANT_B_CONTEXT, TENANT_A, buildStewardRequest()),
    );
  });

  it("never discloses another tenant's mandate, executions, or lineage", async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;

    await expectTokenizationError('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () => world.service.getMandate(TENANT_B_CONTEXT, mandateId));
    await expectTokenizationError('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () => world.service.listExecutions(TENANT_B_CONTEXT, mandateId));
    await expectTokenizationError('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () => world.service.getEvidenceLineage(TENANT_B_CONTEXT, mandateId));
    await expectTokenizationError('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () =>
      world.service.revokeMandate(TENANT_B_CONTEXT, { mandateId, reason: 'authority-withdrawn', requestedBy: 'actor-b' }),
    );
  });

  it('requires an organization scope from a non-system caller', async () => {
    const world = buildTokenizationWorld();
    await expectTokenizationError('TOKENIZATION_TENANT_SCOPE_REQUIRED', () =>
      world.service.requestTokenization({ system: false }, TENANT_A, buildStewardRequest()),
    );
  });
});

describe('TOKENIZE — escalation between request and mandate', () => {
  it('rejects a mandate whose terms are wider than the terms that were requested', async () => {
    const world = buildTokenizationWorld();
    const requestedTerms = twentyPercentEconomicTerms();
    const widened = twentyPercentEconomicTerms({ scope: { kind: 'proportional', basisPoints: 10_000 } });

    const error = await expectTokenizationError('TOKENIZATION_SCOPE_ESCALATION', () =>
      world.mandateStore.issueMandate(TENANT_A_CONTEXT, {
        id: 'mandate-escalated',
        organizationId: TENANT_A,
        assetKind: BUILDING_ASSET.kind,
        assetId: BUILDING_ASSET.id,
        assetTenantId: TENANT_A,
        terms: widened,
        requestedTerms,
        requestRef: 'request-1',
        requestedBy: STEWARD_ACTOR_ID,
        decisionRef: 'decision-1',
        effectiveFrom: TOKENIZATION_NOW,
        expiresAt: TOKENIZATION_MANDATE_EXPIRES_AT,
        correlationId: 'correlation-1',
      }),
    );
    assert.deepEqual(error.details?.mandateScope, { kind: 'proportional', basisPoints: 10_000 });

    await expectTokenizationError('TOKENIZATION_MANDATE_NOT_FOUND', () => world.mandateStore.getMandate(TENANT_A_CONTEXT, 'mandate-escalated'));
  });

  it('never issues a second mandate for a replayed request', async () => {
    const world = buildTokenizationWorld();
    // A true replay is byte-identical: same request id *and* same correlation
    // id, so the Governance Store recognizes it rather than treating it as a
    // second, different request wearing the same id.
    const submission = buildStewardRequest({ requestId: 'tokenization-request-replayed', correlationId: 'correlation-replayed' });

    const first = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, submission);
    assert.ok(first.mandate);

    const replay = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, submission);
    assert.equal(replay.mandate?.id, first.mandate.id, 'a replayed request must return the original authorization, never a new one');

    // And the persistence boundary refuses independently, so no future write
    // path can accumulate authorization by replaying a request either.
    await expectTokenizationError('TOKENIZATION_MANDATE_ALREADY_EXISTS', () =>
      world.mandateStore.issueMandate(TENANT_A_CONTEXT, {
        id: 'mandate-second-for-same-request',
        organizationId: TENANT_A,
        assetKind: BUILDING_ASSET.kind,
        assetId: BUILDING_ASSET.id,
        terms: twentyPercentEconomicTerms(),
        requestedTerms: twentyPercentEconomicTerms(),
        requestRef: 'tokenization-request-replayed',
        requestedBy: STEWARD_ACTOR_ID,
        decisionRef: 'decision-replay',
        effectiveFrom: TOKENIZATION_NOW,
        expiresAt: TOKENIZATION_MANDATE_EXPIRES_AT,
        correlationId: 'correlation-replay',
      }),
    );
  });

  it('rejects reusing one request id for a materially different request', async () => {
    const world = buildTokenizationWorld();
    await world.service.requestTokenization(
      TENANT_A_CONTEXT,
      TENANT_A,
      buildStewardRequest({ requestId: 'tokenization-request-reused', correlationId: 'correlation-reused' }),
    );

    await expectTokenizationError('TOKENIZATION_REQUEST_CONFLICT', () =>
      world.service.requestTokenization(
        TENANT_A_CONTEXT,
        TENANT_A,
        buildStewardRequest({
          requestId: 'tokenization-request-reused',
          correlationId: 'correlation-reused',
          terms: twentyPercentEconomicTerms({ scope: { kind: 'proportional', basisPoints: 10_000 } }),
        }),
      ),
    );
  });

  it('rejects a mandate that loosens a declared constraint', async () => {
    const world = buildTokenizationWorld();
    await expectTokenizationError('TOKENIZATION_SCOPE_ESCALATION', () =>
      world.mandateStore.issueMandate(TENANT_A_CONTEXT, {
        id: 'mandate-loosened',
        organizationId: TENANT_A,
        assetKind: BUILDING_ASSET.kind,
        assetId: BUILDING_ASSET.id,
        terms: twentyPercentEconomicTerms({
          constraints: { maximumIssuedUnits: 5_000_000, permittedNetworks: ['network-alpha'], additionalIssuanceAllowed: true },
        }),
        requestedTerms: twentyPercentEconomicTerms(),
        requestRef: 'request-2',
        requestedBy: STEWARD_ACTOR_ID,
        decisionRef: 'decision-2',
        effectiveFrom: TOKENIZATION_NOW,
        expiresAt: TOKENIZATION_MANDATE_EXPIRES_AT,
        correlationId: 'correlation-2',
      }),
    );
  });
});

describe('TOKENIZE — request validation', () => {
  it('rejects a request that names no rights', async () => {
    const world = buildTokenizationWorld();
    const error = await expectTokenizationError('TOKENIZATION_VALIDATION_ERROR', () =>
      world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest({ terms: twentyPercentEconomicTerms({ rights: [] }) })),
    );
    const issues = error.details?.issues as readonly { readonly code: string }[];
    assert.ok(issues.some((issue) => issue.code === 'EMPTY_RIGHTS'));
  });

  it('rejects a proportional scope expressed outside the basis-point range', async () => {
    const world = buildTokenizationWorld();
    await expectTokenizationError('TOKENIZATION_VALIDATION_ERROR', () =>
      world.service.requestTokenization(
        TENANT_A_CONTEXT,
        TENANT_A,
        buildStewardRequest({ terms: twentyPercentEconomicTerms({ scope: { kind: 'proportional', basisPoints: 10_001 } }) }),
      ),
    );
  });

  it('rejects a non-UTC mandate expiry rather than recording an ambiguous instant', async () => {
    const world = buildTokenizationWorld();
    await expectTokenizationError('TOKENIZATION_INVALID_TIMESTAMP', () =>
      world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest({ mandateExpiresAt: '2026-07-01T00:00:00+02:00' })),
    );
  });

  it('carries the requester trust domain through to the Kernel unchanged', async () => {
    const world = buildTokenizationWorld();
    const outcome = await world.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest({ trustDomainId: 'trust-domain-unknown' }));
    assert.equal(outcome.status, 'denied', `a request presented in an unknown trust domain must not be authorized (${TRUST_DOMAIN_ID} is the seeded one)`);
    assert.equal(outcome.mandate, undefined);
  });
});
