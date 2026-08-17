import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ENTERPRISE_TOKENIZED_RIGHT_TYPES } from '@aoc-enterprise/tokenization-mandate';

import { GOVERNANCE_REFERENCE_INTEGRITY_VERSION } from '../governance-store/contracts.js';
import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
import { createSqliteTokenizationMandateStore } from '../tokenization-governance/sqlite-mandate-store.js';
import { createSqliteCollateralizationMandateStore } from '../collateralization-governance/sqlite-mandate-store.js';
import type { TokenizationGovernanceContext } from '../tokenization-governance/contracts.js';
import type { CollateralizationGovernanceContext } from '../collateralization-governance/contracts.js';
import { EXECUTOR_REF, TENANT_A, buildStewardRequest, buildTokenizationWorld } from './tokenization-support.js';
import { COLLATERAL_TENANT_A, buildCollateralStewardRequest, buildCollateralizationWorld, buildConformingExecution } from './collateralization-support.js';

/**
 * Reference integrity along the two governed-action lineages that actually
 * exist:
 *
 *     TOKENIZE decision      -> TokenizationMandate      -> authorization_artifact
 *     COLLATERALIZE decision -> CollateralizationMandate -> authorization_artifact
 *     external execution     -> execution_record
 *
 * These go through the real enforcement services, not the Store directly, so
 * they prove the references those paths actually write are sealed — and then
 * tamper with the resulting SQLite files to prove the seal holds across a
 * restart.
 */

const workDir = mkdtempSync(join(tmpdir(), 'aoc-reference-lineage-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

let dbCounter = 0;
function tempPaths(name: string): { readonly governancePath: string; readonly mandatePath: string } {
  dbCounter += 1;
  return {
    governancePath: join(workDir, `${name}-${dbCounter}-governance.sqlite`),
    mandatePath: join(workDir, `${name}-${dbCounter}-mandates.sqlite`),
  };
}

async function openRawDb(path: string) {
  const { default: Database } = await import('better-sqlite3');
  return new Database(path);
}

const TOKENIZE_CONTEXT: TokenizationGovernanceContext = { system: false, organizationId: TENANT_A, actorId: 'operator-a' };
const COLLATERALIZE_CONTEXT: CollateralizationGovernanceContext = { system: false, organizationId: COLLATERAL_TENANT_A, actorId: 'operator-a' };
const SYSTEM_SCOPED = { system: true } as const;

// ---------------------------------------------------------------------------
// H. TOKENIZE
// ---------------------------------------------------------------------------

describe('reference integrity — H. TOKENIZE authorization lineage', () => {
  async function openTokenizeProcess(paths: ReturnType<typeof tempPaths>, idSeed = 0) {
    const governanceStore = await createSqliteGovernanceStore(paths.governancePath);
    const mandateStore = await createSqliteTokenizationMandateStore(paths.mandatePath);
    const world = buildTokenizationWorld({ governanceStore, mandateStore, idSeed });
    return {
      ...world,
      governanceStore,
      async close() {
        await mandateStore.close();
        await governanceStore.close();
      },
    };
  }

  it('seals the TokenizationMandate reference, and it verifies from a reopened store', async () => {
    const paths = tempPaths('tokenize-protected');

    const processA = await openTokenizeProcess(paths);
    const outcome = await processA.service.requestTokenization(TOKENIZE_CONTEXT, TENANT_A, buildStewardRequest());
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const evaluationId = outcome.evaluationId;
    await processA.close();

    const processB = await openTokenizeProcess(paths, 1000);
    const record = await processB.governanceStore.getByEvaluationId(SYSTEM_SCOPED, evaluationId);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
    await processB.close();

    const reference = (record?.references ?? []).find((entry) => entry.externalId === mandateId);
    assert.ok(reference, 'the mandate reference must survive the restart');
    assert.equal(reference.referenceType, 'authorization_artifact');
    assert.equal(reference.integrityVersion, GOVERNANCE_REFERENCE_INTEGRITY_VERSION, 'the enforcement path must write protected references');
    assert.equal(reference.sequence, 1);
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.equal(verification.referenceIntegrity.protectedValid, 1);
    assert.equal(verification.referenceIntegrity.legacyUnprotected, 0);
  });

  it('detects reference_type tampering on a persisted TOKENIZE authorization_artifact', async () => {
    const paths = tempPaths('tokenize-type-tamper');

    const processA = await openTokenizeProcess(paths);
    const outcome = await processA.service.requestTokenization(TOKENIZE_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const evaluationId = outcome.evaluationId;
    await processA.close();

    const db = await openRawDb(paths.governancePath);
    db.prepare(`UPDATE governance_references SET reference_type = 'external_artifact' WHERE reference_type = 'authorization_artifact'`).run();
    db.close();

    const processB = await openTokenizeProcess(paths, 1000);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
    await processB.close();

    assert.equal(verification.valid, false);
    assert.equal(verification.checks.referenceIntegrity, false);
    assert.equal(verification.checks.aggregateDigest, true, 'the governance decision record itself is untouched');
    assert.equal(verification.referenceIntegrity.protectedCorrupted, 1);
  });

  it('detects external_id tampering that repoints the reference at a different mandate', async () => {
    const paths = tempPaths('tokenize-id-tamper');

    const processA = await openTokenizeProcess(paths);
    const outcome = await processA.service.requestTokenization(TOKENIZE_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const evaluationId = outcome.evaluationId;
    await processA.close();

    const db = await openRawDb(paths.governancePath);
    db.prepare(`UPDATE governance_references SET external_id = 'mandate:M2' WHERE reference_type = 'authorization_artifact'`).run();
    db.close();

    const processB = await openTokenizeProcess(paths, 1000);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
    await processB.close();

    assert.equal(verification.valid, false);
    assert.equal(verification.referenceIntegrity.protectedCorrupted, 1);
  });

  it('protects external execution evidence with the same mechanism as the authorization', async () => {
    const paths = tempPaths('tokenize-execution');

    const processA = await openTokenizeProcess(paths);
    const outcome = await processA.service.requestTokenization(TOKENIZE_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const evaluationId = outcome.evaluationId;
    const recorded = await processA.service.recordExecution(TOKENIZE_CONTEXT, {
      mandateId,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 2000 },
      rights: [ENTERPRISE_TOKENIZED_RIGHT_TYPES.ECONOMIC_INTEREST, ENTERPRISE_TOKENIZED_RIGHT_TYPES.REVENUE_RIGHT],
    });
    await processA.close();

    const processB = await openTokenizeProcess(paths, 1000);
    const record = await processB.governanceStore.getByEvaluationId(SYSTEM_SCOPED, evaluationId);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
    await processB.close();

    const byId = new Map((record?.references ?? []).map((reference) => [reference.externalId, reference]));
    const authorization = byId.get(mandateId);
    const execution = byId.get(recorded.execution.id);
    assert.equal(authorization?.referenceType, 'authorization_artifact');
    assert.equal(execution?.referenceType, 'execution_record');

    // Same version, same chain, different sequence: the mechanism does not
    // know or care which of the two is AOC's own authorization.
    assert.equal(execution?.integrityVersion, GOVERNANCE_REFERENCE_INTEGRITY_VERSION);
    assert.equal(authorization?.sequence, 1);
    assert.equal(execution?.sequence, 2);
    assert.equal(execution?.previousReferenceDigest, authorization?.referenceDigest, 'the execution record links to the authorization that preceded it');
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.equal(verification.referenceIntegrity.protectedValid, 2);
  });

  it('detects tampering with a persisted execution_record', async () => {
    const paths = tempPaths('tokenize-execution-tamper');

    const processA = await openTokenizeProcess(paths);
    const outcome = await processA.service.requestTokenization(TOKENIZE_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);
    const evaluationId = outcome.evaluationId;
    await processA.service.recordExecution(TOKENIZE_CONTEXT, {
      mandateId: outcome.mandate.id,
      executorRef: EXECUTOR_REF,
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'proportional', basisPoints: 2000 },
      rights: [ENTERPRISE_TOKENIZED_RIGHT_TYPES.ECONOMIC_INTEREST, ENTERPRISE_TOKENIZED_RIGHT_TYPES.REVENUE_RIGHT],
    });
    await processA.close();

    const db = await openRawDb(paths.governancePath);
    db.prepare(`UPDATE governance_references SET external_id = 'exec-forged' WHERE reference_type = 'execution_record'`).run();
    db.close();

    const processB = await openTokenizeProcess(paths, 1000);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
    await processB.close();

    assert.equal(verification.valid, false);
    assert.equal(verification.referenceIntegrity.protectedValid, 1, 'the untouched authorization reference still verifies');
    assert.equal(verification.referenceIntegrity.protectedCorrupted, 1);
  });

  it('a replayed TOKENIZE request adds no second reference and leaves the chain intact', async () => {
    const paths = tempPaths('tokenize-replay');

    const processA = await openTokenizeProcess(paths);
    // A true replay is byte-identical: the same request id *and* the same
    // correlation id. An auto-generated correlation id would make the second
    // submission a genuinely different request rather than a replay.
    const request = buildStewardRequest({ requestId: 'tokenization-request-integrity-replay', correlationId: 'correlation-integrity-replay' });
    const first = await processA.service.requestTokenization(TOKENIZE_CONTEXT, TENANT_A, request);
    assert.ok(first.mandate);
    const second = await processA.service.requestTokenization(TOKENIZE_CONTEXT, TENANT_A, request);
    await processA.close();

    assert.equal(second.evaluationId, first.evaluationId, 'the replay resolves to the original aggregate');
    assert.equal(second.mandate?.id, first.mandate.id, 'and to the original mandate');

    const processB = await openTokenizeProcess(paths, 1000);
    const record = await processB.governanceStore.getByEvaluationId(SYSTEM_SCOPED, first.evaluationId);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, first.evaluationId);
    await processB.close();

    assert.equal(record?.references.length, 1, 'a replay must not accumulate a second reference');
    assert.equal(record?.references[0]?.sequence, 1, 'nor a second chain position');
    assert.equal(verification.valid, true);
    assert.equal(verification.referenceIntegrity.protectedValid, 1);
  });
});

// ---------------------------------------------------------------------------
// I. COLLATERALIZE
// ---------------------------------------------------------------------------

describe('reference integrity — I. COLLATERALIZE authorization lineage', () => {
  async function openCollateralizeProcess(paths: ReturnType<typeof tempPaths>, idSeed = 0) {
    const governanceStore = await createSqliteGovernanceStore(paths.governancePath);
    const mandateStore = await createSqliteCollateralizationMandateStore(paths.mandatePath);
    const world = buildCollateralizationWorld({ governanceStore, mandateStore, idSeed });
    return {
      ...world,
      governanceStore,
      async close() {
        await mandateStore.close();
        await governanceStore.close();
      },
    };
  }

  it('seals the CollateralizationMandate reference, and it verifies from a reopened store', async () => {
    const paths = tempPaths('collateralize-protected');

    const processA = await openCollateralizeProcess(paths);
    const outcome = await processA.service.requestCollateralization(COLLATERALIZE_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const evaluationId = outcome.evaluationId;
    await processA.close();

    const processB = await openCollateralizeProcess(paths, 1000);
    const record = await processB.governanceStore.getByEvaluationId(SYSTEM_SCOPED, evaluationId);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
    await processB.close();

    const reference = (record?.references ?? []).find((entry) => entry.externalId === mandateId);
    assert.ok(reference);
    assert.equal(reference.referenceType, 'authorization_artifact');
    assert.equal(reference.integrityVersion, GOVERNANCE_REFERENCE_INTEGRITY_VERSION);
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.equal(verification.referenceIntegrity.protectedValid, 1);
  });

  it('detects reference_type and external_id tampering on a persisted COLLATERALIZE authorization_artifact', async () => {
    for (const [label, sql] of [
      ['reference_type', `UPDATE governance_references SET reference_type = 'external_artifact' WHERE reference_type = 'authorization_artifact'`],
      ['external_id', `UPDATE governance_references SET external_id = 'mandate:M2' WHERE reference_type = 'authorization_artifact'`],
    ] as const) {
      const paths = tempPaths(`collateralize-tamper-${label}`);

      const processA = await openCollateralizeProcess(paths);
      const outcome = await processA.service.requestCollateralization(COLLATERALIZE_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
      assert.ok(outcome.mandate);
      const evaluationId = outcome.evaluationId;
      await processA.close();

      const db = await openRawDb(paths.governancePath);
      db.prepare(sql).run();
      db.close();

      const processB = await openCollateralizeProcess(paths, 1000);
      const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
      await processB.close();

      assert.equal(verification.valid, false, `${label} tampering must be detected`);
      assert.equal(verification.checks.aggregateDigest, true);
      assert.equal(verification.referenceIntegrity.protectedCorrupted, 1);
    }
  });

  it('protects collateral execution and release evidence on the same chain as the authorization', async () => {
    const paths = tempPaths('collateralize-execution');

    const processA = await openCollateralizeProcess(paths);
    const outcome = await processA.service.requestCollateralization(COLLATERALIZE_CONTEXT, COLLATERAL_TENANT_A, buildCollateralStewardRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const evaluationId = outcome.evaluationId;
    const executed = await processA.service.recordExecution(COLLATERALIZE_CONTEXT, buildConformingExecution(mandateId, { executionId: 'exec-lineage-a' }));
    await processA.close();

    const processB = await openCollateralizeProcess(paths, 1000);
    const record = await processB.governanceStore.getByEvaluationId(SYSTEM_SCOPED, evaluationId);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
    await processB.close();

    const references = [...(record?.references ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    assert.deepEqual(
      references.map((reference) => reference.referenceType),
      ['authorization_artifact', 'execution_record'],
    );
    assert.deepEqual(references.map((reference) => reference.sequence), [1, 2]);
    assert.equal(references[1]?.externalId, executed.execution.id);
    assert.equal(references[1]?.previousReferenceDigest, references[0]?.referenceDigest);
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.equal(verification.referenceIntegrity.protectedValid, 2);
  });

  it('a replayed COLLATERALIZE request adds no second reference and leaves the chain intact', async () => {
    const paths = tempPaths('collateralize-replay');

    const processA = await openCollateralizeProcess(paths);
    const request = buildCollateralStewardRequest({ requestId: 'collateralization-request-integrity-replay', correlationId: 'correlation-integrity-replay' });
    const first = await processA.service.requestCollateralization(COLLATERALIZE_CONTEXT, COLLATERAL_TENANT_A, request);
    assert.ok(first.mandate);
    const second = await processA.service.requestCollateralization(COLLATERALIZE_CONTEXT, COLLATERAL_TENANT_A, request);
    await processA.close();

    assert.equal(second.evaluationId, first.evaluationId);
    assert.equal(second.mandate?.id, first.mandate.id);

    const processB = await openCollateralizeProcess(paths, 1000);
    const record = await processB.governanceStore.getByEvaluationId(SYSTEM_SCOPED, first.evaluationId);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, first.evaluationId);
    await processB.close();

    assert.equal(record?.references.length, 1);
    assert.equal(verification.valid, true);
    assert.equal(verification.referenceIntegrity.protectedValid, 1);
  });
});

// ---------------------------------------------------------------------------
// Integrity is not authority
// ---------------------------------------------------------------------------

describe('reference integrity — a valid reference digest confers nothing', () => {
  it('proves only that the row is unchanged, not that the mandate it names exists', async () => {
    const paths = tempPaths('integrity-not-authority');

    const governanceStore = await createSqliteGovernanceStore(paths.governancePath);
    const mandateStore = await createSqliteTokenizationMandateStore(paths.mandatePath);
    const world = buildTokenizationWorld({ governanceStore, mandateStore });
    const outcome = await world.service.requestTokenization(TOKENIZE_CONTEXT, TENANT_A, buildStewardRequest());
    assert.ok(outcome.mandate);

    // Append a perfectly-sealed reference naming a mandate that was never
    // issued. The Store seals it — sealing is what the Store does — and
    // verification will report it as valid, because it *is* an unchanged row.
    await governanceStore.appendReference(
      { system: false, organizationId: TENANT_A, actorId: 'operator-a' },
      {
        referenceId: 'ref-nonexistent-mandate',
        evaluationId: outcome.evaluationId,
        referenceType: 'authorization_artifact',
        externalId: 'mandate:does-not-exist',
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    );
    const verification = await governanceStore.verify(SYSTEM_SCOPED, outcome.evaluationId);
    assert.equal(verification.valid, true, 'a sealed row verifies regardless of what it names');
    assert.equal(verification.referenceIntegrity.protectedValid, 2);

    // ...and it authorizes nothing: the mandate it claims does not exist, and
    // no enforcement path consults the reference table to decide anything.
    await assert.rejects(() => world.service.getMandate(TOKENIZE_CONTEXT, 'mandate:does-not-exist'));

    await mandateStore.close();
    await governanceStore.close();
  });
});
