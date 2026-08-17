import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ENTERPRISE_TOKENIZED_RIGHT_TYPES,
  enterpriseTokenizationMandateAuthorizes,
  serializeEnterpriseTokenizationTerms,
} from '@aoc-enterprise/tokenization-mandate';

import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import { isTokenizationGovernanceError, type TokenizationGovernanceError } from '../tokenization-governance/errors.js';
import { createSqliteTokenizationMandateStore } from '../tokenization-governance/sqlite-mandate-store.js';
import { toCanonicalMandate } from '../tokenization-governance/lifecycle.js';
import type { TokenizationMandateStore } from '../tokenization-governance/mandate-store.js';
import type { TokenizationGovernanceContext, TokenizationMandateRecord } from '../tokenization-governance/contracts.js';
import {
  BUILDING_ASSET,
  EXECUTOR_REF,
  STEWARD_ACTOR_ID,
  TENANT_A,
  TENANT_B,
  TOKENIZATION_MANDATE_EXPIRES_AT,
  buildStewardRequest,
  buildTokenizationWorld,
  twentyPercentEconomicTerms,
} from './tokenization-support.js';

/**
 * Durability and restart safety for the `TOKENIZE` enforcement path.
 *
 * Every test here crosses a real process-shaped boundary: stores are opened
 * against an on-disk SQLite file, fully closed, and reopened as a *new*
 * instance over the same file. Nothing is carried across in memory -- the
 * only thing that survives is what was actually written to disk. A test that
 * merely instantiated the same object twice would prove nothing, so none do.
 */

const workDir = mkdtempSync(join(tmpdir(), 'aoc-tokenization-durability-'));
let dbCounter = 0;

interface DurablePaths {
  readonly governancePath: string;
  readonly mandatePath: string;
}

function tempPaths(name: string): DurablePaths {
  dbCounter += 1;
  return {
    governancePath: join(workDir, `${name}-${dbCounter}-governance.sqlite`),
    mandatePath: join(workDir, `${name}-${dbCounter}-mandates.sqlite`),
  };
}

const TENANT_A_CONTEXT: TokenizationGovernanceContext = { system: false, organizationId: TENANT_A, actorId: 'operator-a' };
const TENANT_B_CONTEXT: TokenizationGovernanceContext = { system: false, organizationId: TENANT_B, actorId: 'operator-b' };

const ECONOMIC_RIGHTS = [ENTERPRISE_TOKENIZED_RIGHT_TYPES.ECONOMIC_INTEREST, ENTERPRISE_TOKENIZED_RIGHT_TYPES.REVENUE_RIGHT] as const;

const openStores: Array<{ close(): Promise<void> }> = [];
after(async () => {
  await Promise.all(openStores.map((store) => store.close().catch(() => {})));
});

/**
 * Opens one "process" over the given database files: a freshly-composed
 * world whose durable stores are new instances backed by the same paths.
 * `idSeed` keeps the second process's generated ids from colliding with the
 * first's, exactly as two real processes with independent counters would.
 */
async function openProcess(paths: DurablePaths, idSeed = 0) {
  const governanceStore = await createSqliteGovernanceStore(paths.governancePath);
  const mandateStore = await createSqliteTokenizationMandateStore(paths.mandatePath);
  openStores.push(governanceStore, mandateStore);
  const world = buildTokenizationWorld({ governanceStore, mandateStore, idSeed });
  return {
    ...world,
    async close() {
      await mandateStore.close();
      await governanceStore.close();
    },
  };
}

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

/** Structural comparison of a mandate across a restart. Everything must survive, not just the id. */
function assertMandatesIdentical(recovered: TokenizationMandateRecord, original: TokenizationMandateRecord): void {
  assert.deepEqual(recovered, original);
  // ...and the recovered row must project onto the same canonical artifact,
  // which is what every authorization decision is actually made against.
  assert.deepEqual(toCanonicalMandate(recovered), toCanonicalMandate(original));
}

// ---------------------------------------------------------------------------
// A. Durable mandate
// ---------------------------------------------------------------------------

describe('TOKENIZE durability — A. mandate survives restart', () => {
  it('recovers a mandate structurally identical to the one issued, with identical authorization semantics', async () => {
    const paths = tempPaths('mandate');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate);
    const issued = outcome.mandate;
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(TENANT_A_CONTEXT, issued.id);
    assertMandatesIdentical(recovered, issued);

    // Authorization semantics are unchanged: the same exercise that would have
    // been permitted before the restart is still permitted after it.
    const decision = enterpriseTokenizationMandateAuthorizes(toCanonicalMandate(recovered), {
      executorRef: EXECUTOR_REF,
      rights: [...ECONOMIC_RIGHTS],
      scope: { kind: 'proportional', basisPoints: 2000 },
      at: '2026-02-01T00:00:00.000Z',
    });
    assert.deepEqual(decision, { authorized: true });
    await processB.close();
  });

  it('recovers the governance decision the mandate points at, with its integrity chain intact', async () => {
    const paths = tempPaths('decision-lineage');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const record = await processB.governanceStore.getByEvaluationId({ system: true, organizationId: TENANT_A }, outcome.evaluationId);
    assert.ok(record, 'the governance aggregate that authorized the mandate must survive restart');
    assert.equal(record.evaluation.decisionId, outcome.decisionId);
    assert.equal(record.evaluation.status, 'allowed');

    const verification = await processB.governanceStore.verify({ system: true, organizationId: TENANT_A }, outcome.evaluationId);
    assert.equal(verification.valid, true, `recovered governance record failed integrity verification: ${JSON.stringify(verification.failures)}`);
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// B. Durable revocation
// ---------------------------------------------------------------------------

describe('TOKENIZE durability — B. revocation survives restart', () => {
  it('keeps a revoked mandate revoked and denies authorization after reopening', async () => {
    const paths = tempPaths('revocation');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;

    const revoked = await processA.service.revokeMandate(TENANT_A_CONTEXT, {
      mandateId,
      reason: 'authority-withdrawn',
      requestedBy: STEWARD_ACTOR_ID,
      revokedAt: '2026-03-01T00:00:00.000Z',
      description: 'Board resolution 2026-09.',
    });
    assert.equal(revoked.kind, 'revoked');
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(recovered.status, 'revoked', 'stale active state must never reappear after restart');

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      processB.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-04-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 1000 },
        rights: [...ECONOMIC_RIGHTS],
      }),
    );
    assert.equal(error.details?.refusalCode, 'MANDATE_REVOKED');

    // The revocation record itself, including its reason and the execution
    // count at the moment authority was withdrawn, survives too.
    const revocation = await processB.mandateStore.getRevocation(TENANT_A_CONTEXT, mandateId);
    assert.equal(revocation?.reason, 'authority-withdrawn');
    assert.equal(revocation?.description, 'Board resolution 2026-09.');
    assert.equal(revocation?.executionsAtRevocation, 0);
    await processB.close();
  });

  it('remains idempotent across a restart rather than issuing a competing revocation', async () => {
    const paths = tempPaths('revocation-idempotent');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const first = await processA.service.revokeMandate(TENANT_A_CONTEXT, {
      mandateId: outcome.mandate.id,
      reason: 'authority-withdrawn',
      requestedBy: STEWARD_ACTOR_ID,
    });
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const second = await processB.service.revokeMandate(TENANT_A_CONTEXT, {
      mandateId: outcome.mandate.id,
      reason: 'authority-withdrawn',
      requestedBy: STEWARD_ACTOR_ID,
    });
    assert.equal(second.kind, 'already-revoked');
    assert.equal(second.revocation.id, first.revocation.id);
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// C. Durable execution evidence
// ---------------------------------------------------------------------------

describe('TOKENIZE durability — C. execution evidence survives restart', () => {
  it('reconstructs the full evidence lineage, including external references, after reopening', async () => {
    const paths = tempPaths('execution-evidence');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(
      TENANT_A_CONTEXT,
      TENANT_A,
      buildStewardRequest({ terms: twentyPercentEconomicTerms({ constraints: { maximumIssuedUnits: 2_000_000, additionalIssuanceAllowed: true } }) }),
    );
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;

    const recorded = await processA.service.recordExecution(TENANT_A_CONTEXT, {
      mandateId,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 2000 },
      rights: [...ECONOMIC_RIGHTS],
      issuedUnits: 750_000,
      externalSystem: 'provider-tokenizer-x',
      externalNetwork: 'network-alpha',
      externalTokenStandard: 'standard-registry-v1',
      externalContractReference: 'external-contract-abc',
      externalTransactionReference: 'external-tx-abc',
      evidenceRefs: ['evidence-issuance-1'],
    });
    await processA.close();

    const processB = await openProcess(paths, 1000);

    const executions = await processB.service.listExecutions(TENANT_A_CONTEXT, mandateId);
    assert.equal(executions.length, 1);
    assert.deepEqual(executions[0], recorded.execution);
    assert.equal(executions[0]?.externalContractReference, 'external-contract-abc');
    assert.equal(executions[0]?.externalTransactionReference, 'external-tx-abc');
    assert.deepEqual(executions[0]?.evidenceRefs, ['evidence-issuance-1']);

    const lineage = await processB.service.getEvidenceLineage(TENANT_A_CONTEXT, mandateId);
    assert.equal(lineage.decisionRef, outcome.decisionId);
    assert.equal(lineage.evaluationRef, outcome.evaluationId);
    assert.deepEqual(lineage.executionRefs, [recorded.execution.id]);
    assert.deepEqual(lineage.asset, { kind: BUILDING_ASSET.kind, id: BUILDING_ASSET.id, tenantId: TENANT_A });

    // The Governance Store's own reference rows -- the link from the committed
    // decision to both the mandate and the external execution -- survive in
    // their own database independently of the mandate store.
    const record = await processB.governanceStore.getByEvaluationId({ system: true, organizationId: TENANT_A }, outcome.evaluationId);
    const referencedIds = (record?.references ?? []).map((reference) => reference.externalId);
    assert.ok(referencedIds.includes(mandateId), 'the mandate reference must survive restart');
    assert.ok(referencedIds.includes(recorded.execution.id), 'the execution reference must survive restart');

    // The recovered issuance total is what the ceiling is enforced against.
    const mandate = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(mandate.issuedUnits, 750_000);
    assert.equal(mandate.executionCount, 1);
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// D. Replay safety
// ---------------------------------------------------------------------------

describe('TOKENIZE durability — D. replay safety survives restart', () => {
  it('does not create a second mandate when the same request is replayed after a restart', async () => {
    const paths = tempPaths('replay-request');
    const submission = buildStewardRequest({ requestId: 'tokenization-request-durable-replay', correlationId: 'correlation-durable-replay' });

    const processA = await openProcess(paths);
    const first = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, submission);
    assert.ok(first.mandate);
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const replay = await processB.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, submission);
    assert.equal(replay.mandate?.id, first.mandate.id, 'a replayed request must recover the original authorization, never mint a second');

    // And the persistence boundary refuses independently of the replay path.
    await expectTokenizationError('TOKENIZATION_MANDATE_ALREADY_EXISTS', () =>
      processB.mandateStore.issueMandate(TENANT_A_CONTEXT, {
        id: 'mandate-durable-second',
        organizationId: TENANT_A,
        assetKind: BUILDING_ASSET.kind,
        assetId: BUILDING_ASSET.id,
        terms: twentyPercentEconomicTerms(),
        requestedTerms: twentyPercentEconomicTerms(),
        requestRef: 'tokenization-request-durable-replay',
        requestedBy: STEWARD_ACTOR_ID,
        decisionRef: 'decision-durable-replay',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        expiresAt: TOKENIZATION_MANDATE_EXPIRES_AT,
        correlationId: 'correlation-durable-second',
      }),
    );
    await processB.close();
  });

  it('does not double-count a replayed execution after a restart', async () => {
    const paths = tempPaths('replay-execution');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(
      TENANT_A_CONTEXT,
      TENANT_A,
      buildStewardRequest({ terms: twentyPercentEconomicTerms({ constraints: { maximumIssuedUnits: 1_000, additionalIssuanceAllowed: true } }) }),
    );
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;

    const execution = {
      executionId: 'tokenization-execution-durable',
      mandateId,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 2000 } as const,
      rights: [...ECONOMIC_RIGHTS],
      issuedUnits: 600,
    };
    await processA.service.recordExecution(TENANT_A_CONTEXT, execution);
    await processA.close();

    const processB = await openProcess(paths, 1000);
    await expectTokenizationError('TOKENIZATION_EXECUTION_ALREADY_RECORDED', () => processB.service.recordExecution(TENANT_A_CONTEXT, execution));

    const mandate = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(mandate.issuedUnits, 600, 'a replayed execution must not create additional issuance headroom across a restart');
    assert.equal(mandate.executionCount, 1);
    assert.equal((await processB.service.listExecutions(TENANT_A_CONTEXT, mandateId)).length, 1);
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// E. Tenant isolation
// ---------------------------------------------------------------------------

describe('TOKENIZE durability — E. tenant isolation survives restart', () => {
  it("denies another tenant every read and every mutation after reopening", async () => {
    const paths = tempPaths('tenancy');

    const processA = await openProcess(paths);
    const submission = buildStewardRequest({ requestId: 'tokenization-request-tenancy', correlationId: 'correlation-tenancy' });
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, submission);
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    const processB = await openProcess(paths, 1000);

    await expectTokenizationError('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () => processB.service.getMandate(TENANT_B_CONTEXT, mandateId));
    await expectTokenizationError('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () => processB.service.listExecutions(TENANT_B_CONTEXT, mandateId));
    await expectTokenizationError('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () => processB.service.getEvidenceLineage(TENANT_B_CONTEXT, mandateId));
    await expectTokenizationError('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () =>
      processB.service.revokeMandate(TENANT_B_CONTEXT, { mandateId, reason: 'authority-withdrawn', requestedBy: 'actor-b' }),
    );
    await expectTokenizationError('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () =>
      processB.service.recordExecution(TENANT_B_CONTEXT, {
        mandateId,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 100 },
        rights: [...ECONOMIC_RIGHTS],
      }),
    );

    // There is no listing/query surface on this store, so a mandate cannot be
    // enumerated; the one lookup that takes a non-id key is tenant-scoped too.
    await expectTokenizationError('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () =>
      processB.mandateStore.getMandateByRequestRef(TENANT_B_CONTEXT, 'tokenization-request-tenancy'),
    );

    // Tenant A's mandate is untouched by every one of those attempts.
    const mandate = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(mandate.status, 'active');
    assert.equal(mandate.executionCount, 0);
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// F. Scope containment
// ---------------------------------------------------------------------------

describe('TOKENIZE durability — F. scope containment survives restart', () => {
  it('keeps 20% at 20% and still refuses 100% after reopening', async () => {
    const paths = tempPaths('scope');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    assert.deepEqual(outcome.mandate.terms.scope, { kind: 'proportional', basisPoints: 2000 });
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.deepEqual(recovered.terms.scope, { kind: 'proportional', basisPoints: 2000 }, 'persistence must never widen a partial scope');
    assert.deepEqual(recovered.terms.rights, [...ECONOMIC_RIGHTS]);

    // 20% is still authorized...
    const permitted = await processB.service.recordExecution(TENANT_A_CONTEXT, {
      mandateId,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 2000 },
      rights: [...ECONOMIC_RIGHTS],
      issuedUnits: 1_000,
    });
    assert.equal(permitted.mandate.executionCount, 1);
    await processB.close();

    // ...and 100% is still refused, in a third process for good measure.
    const processC = await openProcess(paths, 2000);
    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      processC.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-02-02T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 10_000 },
        rights: [...ECONOMIC_RIGHTS],
      }),
    );
    assert.equal(error.details?.refusalCode, 'SCOPE_EXCEEDS_MANDATE');
    await processC.close();
  });

  it('round-trips a unitized scope without collapsing it into a proportional one', async () => {
    const paths = tempPaths('scope-unitized');
    const unitized = twentyPercentEconomicTerms({ scope: { kind: 'unitized', units: 500, unitDenomination: 'entitlement-unit' } });

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest({ terms: unitized }));
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.deepEqual(recovered.terms.scope, { kind: 'unitized', units: 500, unitDenomination: 'entitlement-unit' });

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      processB.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'unitized', units: 501, unitDenomination: 'entitlement-unit' },
        rights: [...ECONOMIC_RIGHTS],
      }),
    );
    assert.equal(error.details?.refusalCode, 'SCOPE_EXCEEDS_MANDATE');
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// G. Executor and constraint integrity
// ---------------------------------------------------------------------------

describe('TOKENIZE durability — G. executor and constraint integrity survive restart', () => {
  it('still refuses a substituted executor after reopening', async () => {
    const paths = tempPaths('executor');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    const processB = await openProcess(paths, 1000);
    assert.equal((await processB.service.getMandate(TENANT_A_CONTEXT, mandateId)).terms.executorRef, EXECUTOR_REF);

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      processB.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId,
        executorRef: 'provider-tokenizer-y',
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 1000 },
        rights: [...ECONOMIC_RIGHTS],
      }),
    );
    assert.equal(error.details?.refusalCode, 'EXECUTOR_NOT_AUTHORIZED');
    await processB.close();
  });

  it('preserves every opaque constraint verbatim and still enforces the issuance ceiling', async () => {
    const paths = tempPaths('constraints');
    const constrained = twentyPercentEconomicTerms({
      constraints: {
        maximumIssuedUnits: 1_000,
        permittedNetworks: ['network-alpha', 'network-beta'],
        permittedTokenStandards: ['standard-registry-v1'],
        permittedJurisdictions: ['jurisdiction-a'],
        transferRestricted: true,
        additionalIssuanceAllowed: true,
      },
    });

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest({ terms: constrained }));
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.service.recordExecution(TENANT_A_CONTEXT, {
      mandateId,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 1000 },
      rights: [...ECONOMIC_RIGHTS],
      issuedUnits: 900,
    });
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.deepEqual(recovered.terms.constraints, constrained.constraints, 'opaque governance constraints must round-trip verbatim');

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      processB.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-03-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 1000 },
        rights: [...ECONOMIC_RIGHTS],
        issuedUnits: 200,
      }),
    );
    assert.equal(error.details?.refusalCode, 'MAXIMUM_ISSUANCE_EXCEEDED', 'the recovered issuance total must still bound the ceiling');
    await processB.close();
  });

  it('still refuses additional issuance after restart when the mandate prohibits it', async () => {
    const paths = tempPaths('single-issuance');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    assert.equal(outcome.mandate.terms.constraints.additionalIssuanceAllowed, false);

    await processA.service.recordExecution(TENANT_A_CONTEXT, {
      mandateId,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 2000 },
      rights: [...ECONOMIC_RIGHTS],
      issuedUnits: 500,
    });
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      processB.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-03-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 100 },
        rights: [...ECONOMIC_RIGHTS],
        issuedUnits: 1,
      }),
    );
    assert.equal(error.details?.refusalCode, 'ADDITIONAL_ISSUANCE_PROHIBITED');
    await processB.close();
  });

  it('still applies expiration after restart, derived from the persisted timestamps', async () => {
    const paths = tempPaths('expiration');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    // Expiry is derived, not stored as a status -- the recovered record still
    // carries only 'active', and the derived decision is what refuses.
    assert.equal(recovered.status, 'active');
    assert.equal(recovered.expiresAt, TOKENIZATION_MANDATE_EXPIRES_AT);

    const error = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      processB.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId,
        executorRef: EXECUTOR_REF,
        executedAt: '2027-01-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 1000 },
        rights: [...ECONOMIC_RIGHTS],
      }),
    );
    assert.equal(error.details?.refusalCode, 'MANDATE_EXPIRED');
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// Corruption behaviour — fail closed
// ---------------------------------------------------------------------------

describe('TOKENIZE durability — corrupted durable records fail closed', () => {
  async function tamper(dbPath: string, sql: string, params: readonly unknown[]): Promise<void> {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath);
    db.prepare(sql).run(...params);
    db.close();
  }

  it('refuses a mandate whose stored terms were altered after commit', async () => {
    const paths = tempPaths('corrupt-terms');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    // Silently widen the persisted scope from 20% to 100% -- exactly the edit
    // an escalation would need, and precisely what the digest exists to catch.
    const widened = serializeEnterpriseTokenizationTerms(twentyPercentEconomicTerms({ scope: { kind: 'proportional', basisPoints: 10_000 } }));
    await tamper(paths.mandatePath, `UPDATE tokenization_mandates SET terms_json = ? WHERE mandate_id = ?`, [JSON.stringify(widened), mandateId]);

    const processB = await openProcess(paths, 1000);
    await expectTokenizationError('TOKENIZATION_RECORD_CORRUPTED', () => processB.service.getMandate(TENANT_A_CONTEXT, mandateId));
    // And no authorization can be exercised against it either.
    await expectTokenizationError('TOKENIZATION_RECORD_CORRUPTED', () =>
      processB.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 10_000 },
        rights: [...ECONOMIC_RIGHTS],
      }),
    );
    await processB.close();
  });

  it('refuses a mandate whose stored terms became unreadable', async () => {
    const paths = tempPaths('corrupt-json');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    await tamper(paths.mandatePath, `UPDATE tokenization_mandates SET terms_json = ? WHERE mandate_id = ?`, ['{not json', mandateId]);

    const processB = await openProcess(paths, 1000);
    await expectTokenizationError('TOKENIZATION_RECORD_CORRUPTED', () => processB.service.getMandate(TENANT_A_CONTEXT, mandateId));
    await processB.close();
  });

  it('refuses a mandate carrying an unrecognized status', async () => {
    const paths = tempPaths('corrupt-status');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTokenization(TENANT_A_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    await tamper(paths.mandatePath, `UPDATE tokenization_mandates SET status = ? WHERE mandate_id = ?`, ['consumed', mandateId]);

    const processB = await openProcess(paths, 1000);
    await expectTokenizationError('TOKENIZATION_RECORD_CORRUPTED', () => processB.service.getMandate(TENANT_A_CONTEXT, mandateId));
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// Schema version guard
// ---------------------------------------------------------------------------

describe('TOKENIZE durability — schema version guard', () => {
  it('refuses a database written under a different schema version, without creating its own tables in it', async () => {
    const dbPath = join(workDir, 'foreign-schema-mandates.sqlite');
    const { default: Database } = await import('better-sqlite3');

    const seed = new Database(dbPath);
    seed.exec(`CREATE TABLE IF NOT EXISTS tokenization_mandate_store_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schema_version TEXT NOT NULL,
      migration_state TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )`);
    seed
      .prepare(`INSERT INTO tokenization_mandate_store_versions (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`)
      .run('aoc.tokenization-mandate-store.schema.v9', '2026-01-01T00:00:00.000Z');
    const tablesBefore = (seed.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as { name: string }[]).map((row) => row.name);
    seed.close();

    await expectTokenizationError('TOKENIZATION_STORE_UNAVAILABLE', () => createSqliteTokenizationMandateStore(dbPath));

    const after = new Database(dbPath);
    const tablesAfter = (after.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as { name: string }[]).map((row) => row.name);
    after.close();

    assert.deepEqual(tablesAfter, tablesBefore, 'a refused foreign-schema store must not be mutated by CREATE TABLE IF NOT EXISTS');
    assert.ok(!tablesAfter.includes('tokenization_mandates'), "this runtime's data tables must never be created in a refused store");
  });
});

// ---------------------------------------------------------------------------
// Reference scenario — the whole Enterprise lifecycle, no blockchain
// ---------------------------------------------------------------------------

describe('TOKENIZE reference scenario — durable governed action, end to end', () => {
  it('recognizes authority, decides, issues a mandate, survives restart, records external execution, and reconstructs lineage', async () => {
    const paths = tempPaths('reference-scenario');

    // --- Process 1: govern the action -------------------------------------
    // Asset: Building A. Governed Action: TOKENIZE. Requested rights:
    // economic interest. Requested scope: 2000 basis points (20%).
    // Executor: Tokenizer X.
    const day1 = await openProcess(paths);
    const outcome = await day1.service.requestTokenization(
      TENANT_A_CONTEXT,
      TENANT_A,
      buildStewardRequest({
        requestId: 'tokenization-request-building-a',
        correlationId: 'correlation-building-a',
        justification: 'Board resolution 2026-04: authorize partial economic participation.',
        terms: twentyPercentEconomicTerms({
          rights: [ENTERPRISE_TOKENIZED_RIGHT_TYPES.ECONOMIC_INTEREST],
          scope: { kind: 'proportional', basisPoints: 2000 },
          constraints: {
            maximumIssuedUnits: 2_000_000,
            permittedNetworks: ['network-alpha'],
            permittedTokenStandards: ['standard-registry-v1'],
            permittedJurisdictions: ['jurisdiction-a'],
            transferRestricted: true,
            additionalIssuanceAllowed: false,
          },
        }),
      }),
    );

    assert.equal(outcome.status, 'allowed', 'the steward holds recognized TOKENIZE authority over this asset');
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    assert.deepEqual(outcome.mandate.terms.rights, [ENTERPRISE_TOKENIZED_RIGHT_TYPES.ECONOMIC_INTEREST]);
    assert.deepEqual(outcome.mandate.terms.scope, { kind: 'proportional', basisPoints: 2000 });
    assert.equal(outcome.mandate.terms.executorRef, EXECUTOR_REF);
    await day1.close();

    // --- Process 2: the Enterprise restarts -------------------------------
    const day2 = await openProcess(paths, 1000);
    const recovered = await day2.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(recovered.status, 'active');
    assert.deepEqual(recovered.terms, outcome.mandate.terms, 'the recovered mandate authorizes exactly what was decided');

    // Tokenizer X performs issuance externally; AOC records only the evidence.
    // Nothing here mints, signs, or contacts anything.
    const execution = await day2.service.recordExecution(TENANT_A_CONTEXT, {
      mandateId,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-15T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 2000 },
      rights: [ENTERPRISE_TOKENIZED_RIGHT_TYPES.ECONOMIC_INTEREST],
      issuedUnits: 1_500_000,
      externalSystem: 'tokenizer-x',
      externalNetwork: 'network-alpha',
      externalTokenStandard: 'standard-registry-v1',
      externalContractReference: 'external-contract-building-a',
      externalTransactionReference: 'external-tx-building-a',
    });
    assert.equal(execution.mandate.executionCount, 1);
    await day2.close();

    // --- Process 3: reconstruct the whole chain from disk alone ------------
    const day3 = await openProcess(paths, 2000);
    const lineage = await day3.service.getEvidenceLineage(TENANT_A_CONTEXT, mandateId);

    assert.deepEqual(lineage.asset, { kind: 'asset', id: 'building-a', tenantId: TENANT_A });
    assert.equal(lineage.requestRef, 'tokenization-request-building-a');
    assert.equal(lineage.requestedBy, STEWARD_ACTOR_ID);
    assert.equal(lineage.decisionRef, outcome.decisionId);
    assert.equal(lineage.evaluationRef, outcome.evaluationId);
    assert.deepEqual(lineage.executionRefs, [execution.execution.id]);

    // Why was it permitted, and what exactly was permitted -- answered from
    // the durable governance aggregate, whose integrity chain still verifies.
    const record = await day3.governanceStore.getByEvaluationId({ system: true, organizationId: TENANT_A }, outcome.evaluationId);
    assert.ok(record);
    assert.equal(record.request.actionType, 'tokenize');
    assert.equal(record.evaluation.status, 'allowed');
    const verification = await day3.governanceStore.verify({ system: true, organizationId: TENANT_A }, outcome.evaluationId);
    assert.equal(verification.valid, true);

    // Was the external execution consistent with the authorization?
    const executions = await day3.service.listExecutions(TENANT_A_CONTEXT, mandateId);
    assert.equal(executions.length, 1);
    assert.equal(executions[0]?.externalTransactionReference, 'external-tx-building-a');
    assert.equal(executions[0]?.issuedUnits, 1_500_000);
    assert.deepEqual(executions[0]?.issuedScope, { kind: 'proportional', basisPoints: 2000 });

    // The mandate prohibited additional issuance, and still does.
    const refusal = await expectTokenizationError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      day3.service.recordExecution(TENANT_A_CONTEXT, {
        mandateId,
        executorRef: EXECUTOR_REF,
        executedAt: '2026-03-15T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 2000 },
        rights: [ENTERPRISE_TOKENIZED_RIGHT_TYPES.ECONOMIC_INTEREST],
        issuedUnits: 1,
      }),
    );
    assert.equal(refusal.details?.refusalCode, 'ADDITIONAL_ISSUANCE_PROHIBITED');
    await day3.close();
  });
});
