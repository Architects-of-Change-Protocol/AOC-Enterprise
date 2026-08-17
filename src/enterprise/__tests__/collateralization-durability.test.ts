import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES,
  ENTERPRISE_COLLATERAL_RELEASE_TYPES,
  enterpriseCollateralizationMandateAuthorizes,
  serializeEnterpriseCollateralizationTerms,
} from '@aoc-enterprise/collateralization-mandate';

import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
import { isCollateralizationGovernanceError, type CollateralizationGovernanceError } from '../collateralization-governance/errors.js';
import { createSqliteCollateralizationMandateStore } from '../collateralization-governance/sqlite-mandate-store.js';
import { toCanonicalCollateralizationMandate } from '../collateralization-governance/lifecycle.js';
import type { CollateralizationGovernanceContext, CollateralizationMandateRecord } from '../collateralization-governance/contracts.js';
import {
  COLLATERALIZATION_MANDATE_EXPIRES_AT,
  COLLATERAL_ASSET,
  COLLATERAL_EXECUTOR_REF,
  COLLATERAL_STEWARD_ACTOR_ID,
  COLLATERAL_TENANT_A,
  COLLATERAL_TENANT_B,
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

/**
 * Durability and restart safety for the `COLLATERALIZE` enforcement path.
 *
 * Every test here crosses a real process-shaped boundary: stores are opened
 * against an on-disk SQLite file, fully closed, and reopened as a *new*
 * instance over the same file. Nothing is carried across in memory -- the
 * only thing that survives is what was actually written to disk. A test that
 * merely instantiated the same object twice would prove nothing, so none do.
 */

const workDir = mkdtempSync(join(tmpdir(), 'aoc-collateralization-durability-'));
let dbCounter = 0;

interface DurablePaths {
  readonly governancePath: string;
  readonly mandatePath: string;
}

function tempPaths(name: string): DurablePaths {
  dbCounter += 1;
  return {
    governancePath: join(workDir, `${name}-${dbCounter}-governance.sqlite`),
    mandatePath: join(workDir, `${name}-${dbCounter}-collateral.sqlite`),
  };
}

const TENANT_A_CONTEXT: CollateralizationGovernanceContext = { system: false, organizationId: COLLATERAL_TENANT_A, actorId: 'operator-a' };
const TENANT_B_CONTEXT: CollateralizationGovernanceContext = { system: false, organizationId: COLLATERAL_TENANT_B, actorId: 'operator-b' };

const ECONOMIC_RIGHTS = [
  ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.ECONOMIC_INTEREST,
  ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.REVENUE_RIGHT,
] as const;

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
  const mandateStore = await createSqliteCollateralizationMandateStore(paths.mandatePath);
  openStores.push(governanceStore, mandateStore);
  const world = buildCollateralizationWorld({ governanceStore, mandateStore, idSeed });
  return {
    ...world,
    async close() {
      await mandateStore.close();
      await governanceStore.close();
    },
  };
}

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

/** Structural comparison of a mandate across a restart. Everything must survive, not just the id. */
function assertMandatesIdentical(recovered: CollateralizationMandateRecord, original: CollateralizationMandateRecord): void {
  assert.deepEqual(recovered, original);
  // ...and the recovered row must project onto the same canonical artifact,
  // which is what every authorization decision is actually made against.
  assert.deepEqual(toCanonicalCollateralizationMandate(recovered), toCanonicalCollateralizationMandate(original));
}

async function tamper(dbPath: string, sql: string, params: readonly unknown[]): Promise<void> {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(dbPath);
  db.prepare(sql).run(...params);
  db.close();
}

// ---------------------------------------------------------------------------
// A. Durable mandate
// ---------------------------------------------------------------------------

describe('COLLATERALIZE durability — A. mandate survives restart', () => {
  it('recovers a mandate structurally identical to the one issued, with identical authorization semantics', async () => {
    const paths = tempPaths('mandate');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate);
    const issued = outcome.mandate;
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(TENANT_A_CONTEXT, issued.id);
    assertMandatesIdentical(recovered, issued);

    // Everything a reviewer needs is still there, verbatim.
    assert.deepEqual(recovered.terms.scope, { kind: 'proportional', basisPoints: 2000 }, '20% must still be 20% after a restart');
    assert.equal(recovered.terms.securedObligationRef, SECURED_OBLIGATION_REF);
    assert.equal(recovered.terms.securedPartyRef, SECURED_PARTY_REF);
    assert.equal(recovered.terms.executorRef, COLLATERAL_EXECUTOR_REF);
    assert.equal(recovered.organizationId, COLLATERAL_TENANT_A);
    assert.equal(recovered.expiresAt, COLLATERALIZATION_MANDATE_EXPIRES_AT);
    assert.deepEqual(recovered.terms.constraints, twentyPercentCollateralTerms().constraints);

    // And the authorization it expresses is unchanged.
    assert.deepEqual(
      enterpriseCollateralizationMandateAuthorizes(toCanonicalCollateralizationMandate(recovered), {
        executorRef: COLLATERAL_EXECUTOR_REF,
        securedObligationRef: SECURED_OBLIGATION_REF,
        securedPartyRef: SECURED_PARTY_REF,
        rights: [...ECONOMIC_RIGHTS],
        scope: { kind: 'proportional', basisPoints: 2000 },
        at: '2026-02-01T00:00:00.000Z',
        securedAmount: { minorUnits: 4_000_000_00, currency: 'unit-alpha' },
        externalRegistry: 'registry-alpha',
        jurisdiction: 'jurisdiction-a',
        priorityRank: 1,
      }),
      { authorized: true },
    );
    await processB.close();
  });

  it('recovers the mandate by the request that produced it, so a replay resolves to the original', async () => {
    const paths = tempPaths('mandate-by-request');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({ requestId: 'collateralization-request-durable', correlationId: 'correlation-durable' }),
    );
    assert.ok(outcome.mandate);
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const found = await processB.mandateStore.getMandateByRequestRef(TENANT_A_CONTEXT, 'collateralization-request-durable');
    assert.equal(found?.id, outcome.mandate.id);
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// B. Durable revocation
// ---------------------------------------------------------------------------

describe('COLLATERALIZE durability — B. revocation survives restart', () => {
  it('keeps a revoked mandate revoked, and refuses further collateralization after reopening', async () => {
    const paths = tempPaths('revocation');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const revoked = await processA.service.revokeMandate(TENANT_A_CONTEXT, {
      mandateId,
      reason: 'facility cancelled',
      requestedBy: COLLATERAL_STEWARD_ACTOR_ID,
    });
    assert.equal(revoked.kind, 'revoked');
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(recovered.status, 'revoked', 'a revoked authorization must not come back active');

    const error = await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
      processB.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId)),
    );
    assert.equal(error.details?.refusalCode, 'MANDATE_REVOKED');

    const revocation = await processB.mandateStore.getRevocation(TENANT_A_CONTEXT, mandateId);
    assert.equal(revocation?.reason, 'facility cancelled');
    assert.equal(revocation?.executionsAtRevocation, 0);
    await processB.close();
  });

  it('preserves how far the authorization had been exercised at the moment authority was withdrawn', async () => {
    const paths = tempPaths('revocation-evidence');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({ terms: divisibleCollateralTerms() }),
    );
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingExecution(mandateId, { executionId: 'exec-durable-1', committedScope: { kind: 'proportional', basisPoints: 1200 } }),
    );
    await processA.service.revokeMandate(TENANT_A_CONTEXT, { mandateId, reason: 'r', requestedBy: COLLATERAL_STEWARD_ACTOR_ID });
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const revocation = await processB.mandateStore.getRevocation(TENANT_A_CONTEXT, mandateId);
    assert.equal(revocation?.executionsAtRevocation, 1);
    assert.deepEqual(revocation?.committedScopeAtRevocation, { kind: 'proportional', basisPoints: 1200 });

    // Revocation withdrew authority; it did not claim to have released the
    // arrangement an external system already created, and the evidence of it
    // is still there.
    const executions = await processB.service.listExecutions(TENANT_A_CONTEXT, mandateId);
    assert.equal(executions.length, 1);
    assert.deepEqual(executions[0]?.committedScope, { kind: 'proportional', basisPoints: 1200 });
    assert.equal(executions[0]?.externalAgreementReference, 'agreement-2026-0001');
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// C. Durable external execution evidence and lineage
// ---------------------------------------------------------------------------

describe('COLLATERALIZE durability — C. external evidence and lineage survive restart', () => {
  it('recovers execution evidence, the cumulative committed scope, and the full lineage after reopening', async () => {
    const paths = tempPaths('execution');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({ terms: divisibleCollateralTerms() }),
    );
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;

    await processA.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingExecution(mandateId, { executionId: 'exec-a', committedScope: { kind: 'proportional', basisPoints: 800 } }),
    );
    await processA.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingExecution(mandateId, { executionId: 'exec-b', committedScope: { kind: 'proportional', basisPoints: 700 } }),
    );
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const mandate = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.deepEqual(mandate.committedScope, { kind: 'proportional', basisPoints: 1500 }, 'the cumulative committed scope is durable');
    assert.equal(mandate.executionCount, 2);

    const executions = await processB.service.listExecutions(TENANT_A_CONTEXT, mandateId);
    assert.deepEqual(
      executions.map((execution) => execution.id),
      ['exec-a', 'exec-b'],
      'append order is restart-stable',
    );
    assert.equal(executions[0]?.securedObligationRef, SECURED_OBLIGATION_REF);
    assert.equal(executions[0]?.securedPartyRef, SECURED_PARTY_REF);
    assert.deepEqual(executions[0]?.securedAmount, { minorUnits: 4_000_000_00, currency: 'unit-alpha' });
    assert.equal(executions[0]?.externalFilingReference, 'filing-2026-0001');
    assert.equal(executions[0]?.jurisdiction, 'jurisdiction-a');
    assert.equal(executions[0]?.priorityRank, 1);

    const lineage = await processB.service.getEvidenceLineage(TENANT_A_CONTEXT, mandateId);
    assert.equal(lineage.decisionRef, outcome.decisionId);
    assert.equal(lineage.evaluationRef, outcome.evaluationId);
    assert.equal(lineage.securedObligationRef, SECURED_OBLIGATION_REF);
    assert.equal(lineage.securedPartyRef, SECURED_PARTY_REF);
    assert.equal(lineage.executorRef, COLLATERAL_EXECUTOR_REF);
    assert.deepEqual(lineage.executionRefs, ['exec-a', 'exec-b']);
    assert.deepEqual(lineage.committedScope, { kind: 'proportional', basisPoints: 1500 });

    // The governance aggregate that authorized it is still reachable, still
    // integrity-verifiable, and still points at both the mandate and the
    // external evidence recorded under it.
    const record = await processB.governanceStore.getByEvaluationId({ system: true, organizationId: COLLATERAL_TENANT_A }, outcome.evaluationId);
    assert.ok(record);
    const referencedIds = (record.references ?? []).map((reference) => reference.externalId);
    assert.ok(referencedIds.includes(mandateId));
    assert.ok(referencedIds.includes('exec-a'));
    assert.ok(referencedIds.includes('exec-b'));
    const verification = await processB.governanceStore.verify({ system: true, organizationId: COLLATERAL_TENANT_A }, outcome.evaluationId);
    assert.equal(verification.valid, true, `governance record integrity failed: ${JSON.stringify(verification.failures)}`);
    await processB.close();
  });

  it('recovers reported release evidence without it having restored any headroom', async () => {
    const paths = tempPaths('release');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const executed = await processA.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-released' }));
    await processA.service.recordRelease(TENANT_A_CONTEXT, {
      releaseId: 'release-1',
      mandateId,
      executionId: executed.execution.id,
      reportedBy: COLLATERAL_EXECUTOR_REF,
      releasedAt: '2026-03-01T00:00:00.000Z',
      releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.DISCHARGED,
      externalReleaseReference: 'discharge-2026-0001',
    });
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const releases = await processB.service.listReleases(TENANT_A_CONTEXT, mandateId);
    assert.equal(releases.length, 1);
    assert.equal(releases[0]?.id, 'release-1');
    assert.equal(releases[0]?.executionId, 'exec-released');
    assert.equal(releases[0]?.releaseType, 'discharged');
    assert.equal(releases[0]?.externalReleaseReference, 'discharge-2026-0001');

    const mandate = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(mandate.status, 'active', 'a reported release is never a mandate state transition, before or after a restart');
    assert.deepEqual(
      mandate.committedScope,
      { kind: 'proportional', basisPoints: 2000 },
      'a reported release must never manufacture fresh collateralization headroom, before or after a restart',
    );

    const lineage = await processB.service.getEvidenceLineage(TENANT_A_CONTEXT, mandateId);
    assert.deepEqual(lineage.releaseRefs, ['release-1']);
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// D. Replay safety
// ---------------------------------------------------------------------------

describe('COLLATERALIZE durability — D. replay safety survives restart', () => {
  it('does not create a second mandate when the same request is replayed after a restart', async () => {
    const paths = tempPaths('replay-request');
    const submission = buildCollateralStewardRequest({
      requestId: 'collateralization-request-durable-replay',
      correlationId: 'correlation-durable-replay',
    });

    const processA = await openProcess(paths);
    const first = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, submission);
    assert.ok(first.mandate);
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const replay = await processB.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, submission);
    assert.equal(replay.mandate?.id, first.mandate.id, 'a replayed request must recover the original authorization, never mint a second');

    // And the persistence boundary refuses independently of the replay path.
    await expectCollateralizationError('COLLATERALIZATION_MANDATE_ALREADY_EXISTS', () =>
      processB.mandateStore.issueMandate(TENANT_A_CONTEXT, {
        id: 'collateralization-mandate-durable-second',
        organizationId: COLLATERAL_TENANT_A,
        assetKind: COLLATERAL_ASSET.kind,
        assetId: COLLATERAL_ASSET.id,
        terms: twentyPercentCollateralTerms(),
        requestedTerms: twentyPercentCollateralTerms(),
        requestRef: 'collateralization-request-durable-replay',
        requestedBy: COLLATERAL_STEWARD_ACTOR_ID,
        decisionRef: 'decision-durable-replay',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        expiresAt: COLLATERALIZATION_MANDATE_EXPIRES_AT,
        correlationId: 'correlation-durable-second',
      }),
    );
    await processB.close();
  });

  it('does not commit a replayed execution’s scope twice after a restart', async () => {
    const paths = tempPaths('replay-execution');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({ terms: divisibleCollateralTerms() }),
    );
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;

    const execution = buildConformingExecution(mandateId, {
      executionId: 'collateralization-execution-durable',
      committedScope: { kind: 'proportional', basisPoints: 1200 },
    });
    await processA.service.recordExecution(TENANT_A_CONTEXT, execution);
    await processA.close();

    const processB = await openProcess(paths, 1000);
    await expectCollateralizationError('COLLATERALIZATION_EXECUTION_ALREADY_RECORDED', () =>
      processB.service.recordExecution(TENANT_A_CONTEXT, execution),
    );

    const mandate = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.deepEqual(mandate.committedScope, { kind: 'proportional', basisPoints: 1200 }, 'a replayed execution must not commit its scope twice');
    assert.equal(mandate.executionCount, 1);
    assert.equal((await processB.service.listExecutions(TENANT_A_CONTEXT, mandateId)).length, 1);
    await processB.close();
  });

  it('does not duplicate a replayed release after a restart', async () => {
    const paths = tempPaths('replay-release');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const executed = await processA.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-r' }));
    const releaseSubmission = {
      releaseId: 'collateralization-release-durable',
      mandateId,
      executionId: executed.execution.id,
      reportedBy: COLLATERAL_EXECUTOR_REF,
      releasedAt: '2026-03-01T00:00:00.000Z',
      releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.RELEASED,
    };
    await processA.service.recordRelease(TENANT_A_CONTEXT, releaseSubmission);
    await processA.close();

    const processB = await openProcess(paths, 1000);
    await expectCollateralizationError('COLLATERALIZATION_RELEASE_ALREADY_RECORDED', () =>
      processB.service.recordRelease(TENANT_A_CONTEXT, releaseSubmission),
    );
    assert.equal((await processB.service.listReleases(TENANT_A_CONTEXT, mandateId)).length, 1);
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// E. Tenant isolation across a restart
// ---------------------------------------------------------------------------

describe('COLLATERALIZE durability — E. tenant isolation survives restart', () => {
  it('never lets one tenant reach another tenant’s recovered mandate', async () => {
    const paths = tempPaths('tenancy');
    const submission = buildCollateralStewardRequest({ requestId: 'collateralization-request-tenancy', correlationId: 'correlation-tenancy' });

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, submission);
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const executed = await processA.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-tenancy' }));
    await processA.close();

    const processB = await openProcess(paths, 1000);
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => processB.service.getMandate(TENANT_B_CONTEXT, mandateId));
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => processB.service.listExecutions(TENANT_B_CONTEXT, mandateId));
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => processB.service.listReleases(TENANT_B_CONTEXT, mandateId));
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => processB.service.getEvidenceLineage(TENANT_B_CONTEXT, mandateId));
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () =>
      processB.service.revokeMandate(TENANT_B_CONTEXT, { mandateId, reason: 'r', requestedBy: 'actor-b' }),
    );
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () =>
      processB.service.recordExecution(TENANT_B_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-tenancy-b' })),
    );
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () =>
      processB.service.recordRelease(TENANT_B_CONTEXT, {
        mandateId,
        executionId: executed.execution.id,
        reportedBy: OTHER_EXECUTOR_REF,
        releasedAt: '2026-03-01T00:00:00.000Z',
        releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.RELEASED,
      }),
    );
    await expectCollateralizationError('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () =>
      processB.mandateStore.getMandateByRequestRef(TENANT_B_CONTEXT, 'collateralization-request-tenancy'),
    );

    // Tenant A is unaffected.
    assert.equal((await processB.service.getMandate(TENANT_A_CONTEXT, mandateId)).id, mandateId);
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// F. Substitution protection across a restart
// ---------------------------------------------------------------------------

describe('COLLATERALIZE durability — F. substitution protection survives restart', () => {
  it('refuses scope escalation, and obligation / party / executor substitution, against a recovered mandate', async () => {
    const paths = tempPaths('substitution');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    const processB = await openProcess(paths, 1000);
    for (const [override, refusalCode] of [
      [{ committedScope: { kind: 'proportional', basisPoints: 10_000 } as const }, 'SCOPE_EXCEEDS_MANDATE'],
      [{ securedObligationRef: OTHER_SECURED_OBLIGATION_REF }, 'SECURED_OBLIGATION_NOT_AUTHORIZED'],
      [{ securedPartyRef: OTHER_SECURED_PARTY_REF }, 'SECURED_PARTY_NOT_AUTHORIZED'],
      [{ executorRef: OTHER_EXECUTOR_REF }, 'EXECUTOR_NOT_AUTHORIZED'],
      [{ externalRegistry: 'registry-omega' }, 'REGISTRY_NOT_PERMITTED'],
      [{ jurisdiction: 'jurisdiction-z' }, 'JURISDICTION_NOT_PERMITTED'],
      [{ priorityRank: 3 }, 'PRIORITY_RANK_NOT_AUTHORIZED'],
      [{ securedAmount: { minorUnits: 9_999_999_00, currency: 'unit-alpha' } }, 'SECURED_AMOUNT_EXCEEDS_MANDATE'],
    ] as const) {
      const error = await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
        processB.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, override)),
      );
      assert.equal(error.details?.refusalCode, refusalCode);
    }

    // Nothing was committed by any of the refusals.
    const mandate = await processB.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(mandate.committedScope, undefined);
    assert.equal(mandate.executionCount, 0);
    await processB.close();
  });

  it('refuses a wider mandate written directly at the persistence boundary after a restart', async () => {
    const paths = tempPaths('escalation-boundary');

    const processA = await openProcess(paths);
    await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    await processA.close();

    const processB = await openProcess(paths, 1000);
    await expectCollateralizationError('COLLATERALIZATION_SCOPE_ESCALATION', () =>
      processB.mandateStore.issueMandate(TENANT_A_CONTEXT, {
        id: 'collateralization-mandate-widened',
        organizationId: COLLATERAL_TENANT_A,
        assetKind: COLLATERAL_ASSET.kind,
        assetId: COLLATERAL_ASSET.id,
        terms: twentyPercentCollateralTerms({ scope: { kind: 'proportional', basisPoints: 10_000 } }),
        requestedTerms: twentyPercentCollateralTerms(),
        requestRef: 'collateralization-request-widened',
        requestedBy: COLLATERAL_STEWARD_ACTOR_ID,
        decisionRef: 'decision-widened',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        expiresAt: COLLATERALIZATION_MANDATE_EXPIRES_AT,
        correlationId: 'correlation-widened',
      }),
    );
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// G. Corruption behaviour — fail closed
// ---------------------------------------------------------------------------

describe('COLLATERALIZE durability — G. corrupted durable records fail closed', () => {
  it('refuses a mandate whose stored terms were altered after commit', async () => {
    const paths = tempPaths('corrupt-terms');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    // Silently widen the persisted scope from 20% to 100% -- exactly the edit
    // an escalation would need, and precisely what the digest exists to catch.
    const widened = serializeEnterpriseCollateralizationTerms(twentyPercentCollateralTerms({ scope: { kind: 'proportional', basisPoints: 10_000 } }));
    await tamper(paths.mandatePath, `UPDATE collateralization_mandates SET terms_json = ? WHERE mandate_id = ?`, [
      JSON.stringify(widened),
      mandateId,
    ]);

    const processB = await openProcess(paths, 1000);
    await expectCollateralizationError('COLLATERALIZATION_RECORD_CORRUPTED', () => processB.service.getMandate(TENANT_A_CONTEXT, mandateId));
    // And no authorization can be exercised against it either.
    await expectCollateralizationError('COLLATERALIZATION_RECORD_CORRUPTED', () =>
      processB.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingExecution(mandateId, { committedScope: { kind: 'proportional', basisPoints: 10_000 } }),
      ),
    );
    await processB.close();
  });

  it('refuses a mandate whose stored secured party or secured obligation was substituted after commit', async () => {
    for (const substituted of [
      twentyPercentCollateralTerms({ securedPartyRef: OTHER_SECURED_PARTY_REF }),
      twentyPercentCollateralTerms({ securedObligationRef: OTHER_SECURED_OBLIGATION_REF }),
    ]) {
      const paths = tempPaths('corrupt-substitution');

      const processA = await openProcess(paths);
      const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
      assert.ok(outcome.mandate);
      const mandateId = outcome.mandate.id;
      await processA.close();

      await tamper(paths.mandatePath, `UPDATE collateralization_mandates SET terms_json = ? WHERE mandate_id = ?`, [
        JSON.stringify(serializeEnterpriseCollateralizationTerms(substituted)),
        mandateId,
      ]);

      const processB = await openProcess(paths, 1000);
      await expectCollateralizationError('COLLATERALIZATION_RECORD_CORRUPTED', () => processB.service.getMandate(TENANT_A_CONTEXT, mandateId));
      await processB.close();
    }
  });

  it('refuses a mandate whose stored terms became unreadable', async () => {
    const paths = tempPaths('corrupt-json');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    await tamper(paths.mandatePath, `UPDATE collateralization_mandates SET terms_json = ? WHERE mandate_id = ?`, ['{not json', mandateId]);

    const processB = await openProcess(paths, 1000);
    await expectCollateralizationError('COLLATERALIZATION_RECORD_CORRUPTED', () => processB.service.getMandate(TENANT_A_CONTEXT, mandateId));
    await processB.close();
  });

  it('refuses a mandate carrying an unrecognized status', async () => {
    const paths = tempPaths('corrupt-status');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    // 'released' is exactly the status a naive implementation would have
    // invented for this action. It is not a representable mandate state.
    await tamper(paths.mandatePath, `UPDATE collateralization_mandates SET status = ? WHERE mandate_id = ?`, ['released', mandateId]);

    const processB = await openProcess(paths, 1000);
    await expectCollateralizationError('COLLATERALIZATION_RECORD_CORRUPTED', () => processB.service.getMandate(TENANT_A_CONTEXT, mandateId));
    await processB.close();
  });

  it('refuses a mandate whose stored cumulative committed scope became malformed', async () => {
    const paths = tempPaths('corrupt-committed-scope');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-corrupt' }));
    await processA.close();

    await tamper(paths.mandatePath, `UPDATE collateralization_mandates SET committed_scope_json = ? WHERE mandate_id = ?`, [
      JSON.stringify({ kind: 'proportional', basisPoints: -5 }),
      mandateId,
    ]);

    const processB = await openProcess(paths, 1000);
    await expectCollateralizationError('COLLATERALIZATION_RECORD_CORRUPTED', () => processB.service.getMandate(TENANT_A_CONTEXT, mandateId));
    await processB.close();
  });

  it('refuses release evidence carrying an unrecognized release category', async () => {
    const paths = tempPaths('corrupt-release-type');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestCollateralization(TENANT_A_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const executed = await processA.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-rel' }));
    await processA.service.recordRelease(TENANT_A_CONTEXT, {
      releaseId: 'release-corrupt',
      mandateId,
      executionId: executed.execution.id,
      reportedBy: COLLATERAL_EXECUTOR_REF,
      releasedAt: '2026-03-01T00:00:00.000Z',
      releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.RELEASED,
    });
    await processA.close();

    // 'foreclosed' is not a category this contract can represent; a stored row
    // carrying it must never be read back as a usable observation.
    await tamper(paths.mandatePath, `UPDATE collateralization_releases SET release_type = ? WHERE release_id = ?`, ['foreclosed', 'release-corrupt']);

    const processB = await openProcess(paths, 1000);
    await expectCollateralizationError('COLLATERALIZATION_RECORD_CORRUPTED', () => processB.service.listReleases(TENANT_A_CONTEXT, mandateId));
    await processB.close();
  });

  it('refuses to open a database written under a different schema version', async () => {
    const paths = tempPaths('schema-guard');

    const store = await createSqliteCollateralizationMandateStore(paths.mandatePath);
    await store.close();

    await tamper(paths.mandatePath, `UPDATE collateralization_mandate_store_versions SET schema_version = ?`, [
      'aoc.collateralization-mandate-store.schema.v99',
    ]);

    await assert.rejects(
      () => createSqliteCollateralizationMandateStore(paths.mandatePath),
      (error: unknown) => isCollateralizationGovernanceError(error) && error.code === 'COLLATERALIZATION_STORE_UNAVAILABLE',
    );
  });
});

// ---------------------------------------------------------------------------
// H. The executable reference scenario, end to end, across three processes
// ---------------------------------------------------------------------------

describe('COLLATERALIZE durability — H. reference scenario', () => {
  it('runs Building A / economic rights / 20% / Obligation-001 / Lender B / Provider C end to end across restarts', async () => {
    const paths = tempPaths('reference-scenario');

    // --- Process 1: authority is recognized, the request is governed, a
    // --- mandate is issued and durably persisted.
    const process1 = await openProcess(paths);
    const outcome = await process1.service.requestCollateralization(
      TENANT_A_CONTEXT,
      COLLATERAL_TENANT_A,
      buildCollateralStewardRequest({ requestId: 'scenario-request', correlationId: 'scenario-correlation' }),
    );
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    assert.deepEqual(outcome.mandate.terms.scope, { kind: 'proportional', basisPoints: 2000 });
    await process1.close();

    // --- Process 2: the mandate is recovered from disk, an external provider
    // --- performs the collateralization, and reports evidence back.
    const process2 = await openProcess(paths, 1000);
    const recovered = await process2.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.deepEqual(recovered.terms.scope, { kind: 'proportional', basisPoints: 2000 }, '20% is still 20%');
    assert.equal(recovered.terms.securedObligationRef, SECURED_OBLIGATION_REF, 'the secured obligation is unchanged');
    assert.equal(recovered.terms.securedPartyRef, SECURED_PARTY_REF, 'the secured party is unchanged');
    assert.equal(recovered.terms.executorRef, COLLATERAL_EXECUTOR_REF, 'the executor is unchanged');
    assert.equal(recovered.organizationId, COLLATERAL_TENANT_A, 'the tenant is unchanged');
    assert.deepEqual(recovered.terms.constraints, twentyPercentCollateralTerms().constraints, 'the constraints are unchanged');

    await process2.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'scenario-execution' }));

    // An unauthorized attempt can do none of the things it might want to.
    for (const [override, refusalCode] of [
      // 100% is refused as scope escalation before anything else about the
      // exercise is even considered.
      [{ executionId: 'x1', committedScope: { kind: 'proportional', basisPoints: 10_000 } as const }, 'SCOPE_EXCEEDS_MANDATE'],
      [{ executionId: 'x2', securedObligationRef: OTHER_SECURED_OBLIGATION_REF }, 'SECURED_OBLIGATION_NOT_AUTHORIZED'],
      [{ executionId: 'x3', securedPartyRef: OTHER_SECURED_PARTY_REF }, 'SECURED_PARTY_NOT_AUTHORIZED'],
      [{ executionId: 'x4', executorRef: OTHER_EXECUTOR_REF }, 'EXECUTOR_NOT_AUTHORIZED'],
      // ...and even a scope this mandate *would* have authorized is refused,
      // because this authorization permits a single arrangement and has been
      // spent.
      [{ executionId: 'x5', committedScope: { kind: 'proportional', basisPoints: 100 } as const }, 'ADDITIONAL_COLLATERALIZATION_PROHIBITED'],
    ] as const) {
      const error = await expectCollateralizationError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
        process2.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, override)),
      );
      assert.equal(error.details?.refusalCode, refusalCode);
    }
    // Replaying the execution changes nothing.
    await expectCollateralizationError('COLLATERALIZATION_EXECUTION_ALREADY_RECORDED', () =>
      process2.service.recordExecution(TENANT_A_CONTEXT, buildConformingExecution(mandateId, { executionId: 'scenario-execution' })),
    );
    await process2.close();

    // --- Process 3: the whole lineage is reconstructed from disk, and the
    // --- external arrangement's later discharge is recorded as evidence.
    const process3 = await openProcess(paths, 2000);
    const lineage = await process3.service.getEvidenceLineage(TENANT_A_CONTEXT, mandateId);

    assert.equal(lineage.mandateId, mandateId);
    assert.equal(lineage.organizationId, COLLATERAL_TENANT_A);
    assert.deepEqual(lineage.asset, { kind: 'asset', id: 'building-a', tenantId: COLLATERAL_TENANT_A });
    assert.deepEqual([...lineage.terms.rights].sort(), [...ECONOMIC_RIGHTS].sort());
    assert.deepEqual(lineage.terms.scope, { kind: 'proportional', basisPoints: 2000 });
    assert.equal(lineage.requestRef, 'scenario-request');
    assert.equal(lineage.requestedBy, COLLATERAL_STEWARD_ACTOR_ID);
    assert.equal(lineage.securedObligationRef, SECURED_OBLIGATION_REF);
    assert.equal(lineage.securedPartyRef, SECURED_PARTY_REF);
    assert.equal(lineage.executorRef, COLLATERAL_EXECUTOR_REF);
    assert.equal(lineage.decisionRef, outcome.decisionId);
    assert.equal(lineage.evaluationRef, outcome.evaluationId);
    assert.deepEqual(lineage.executionRefs, ['scenario-execution']);
    assert.deepEqual(lineage.committedScope, { kind: 'proportional', basisPoints: 2000 });
    assert.equal(lineage.revocationRef, undefined);

    const discharged = await process3.service.recordRelease(TENANT_A_CONTEXT, {
      releaseId: 'scenario-release',
      mandateId,
      executionId: 'scenario-execution',
      reportedBy: COLLATERAL_EXECUTOR_REF,
      releasedAt: '2026-05-01T00:00:00.000Z',
      releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.DISCHARGED,
      externalReleaseReference: 'scenario-discharge',
    });
    assert.equal(discharged.releaseType, 'discharged');

    const finalLineage = await process3.service.getEvidenceLineage(TENANT_A_CONTEXT, mandateId);
    assert.deepEqual(finalLineage.releaseRefs, ['scenario-release']);
    assert.deepEqual(
      finalLineage.committedScope,
      { kind: 'proportional', basisPoints: 2000 },
      'even a reported discharge leaves the committed scope alone -- AOC records what it was told, and claims nothing more',
    );

    // Nothing in the whole scenario made AOC a lender, a registry, or a
    // valuer: the only monetary figure anywhere is the ceiling the requester
    // declared, and the only registry/filing values are the labels an external
    // system reported.
    const executions = await process3.service.listExecutions(TENANT_A_CONTEXT, mandateId);
    assert.equal(executions.length, 1);
    assert.deepEqual(executions[0]?.securedAmount, { minorUnits: 4_000_000_00, currency: 'unit-alpha' });
    assert.equal(executions[0]?.externalRegistry, 'registry-alpha');
    assert.equal(executions[0]?.externalFilingReference, 'filing-2026-0001');
    await process3.close();
  });
});
