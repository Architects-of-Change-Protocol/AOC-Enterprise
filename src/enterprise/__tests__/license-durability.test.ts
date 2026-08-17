import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ENTERPRISE_LICENSABLE_RIGHT_TYPES,
  ENTERPRISE_LICENSED_USE_TYPES,
  ENTERPRISE_LICENSE_LIFECYCLE_TYPES,
  enterpriseLicenseTermsEquals,
  serializeEnterpriseLicenseTerms,
} from '@aoc-enterprise/license-mandate';

import { GOVERNANCE_REFERENCE_INTEGRITY_VERSION } from '../governance-store/contracts.js';
import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
import { isLicenseGovernanceError } from '../license-governance/errors.js';
import { createSqliteLicenseMandateStore } from '../license-governance/sqlite-mandate-store.js';
import type { LicenseGovernanceContext } from '../license-governance/contracts.js';
import {
  LICENSEE_REF,
  LICENSE_EXECUTOR_REF,
  LICENSE_MANAGER_ACTOR_ID,
  LICENSE_TENANT_A,
  OTHER_LICENSEE_REF,
  OTHER_TERRITORY,
  PERMITTED_CHANNEL,
  PERMITTED_TERRITORY,
  buildConformingLicenseExecution,
  buildLicenseManagerRequest,
  buildLicenseWorld,
  proportionalLicenseTerms,
  repeatableLicenseTerms,
  webDisplayLicenseTerms,
} from './license-support.js';

/**
 * Durability for the `LICENSE` governed action: everything the in-memory suite
 * proves must survive a real process boundary. Each "restart" here closes both
 * SQLite stores and reopens them over the same files with a freshly-built
 * world, so nothing is carried across in memory.
 */

const workDir = mkdtempSync(join(tmpdir(), 'aoc-license-durability-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

const CONTEXT: LicenseGovernanceContext = { system: false, organizationId: LICENSE_TENANT_A, actorId: 'operator-a' };
const SYSTEM_SCOPED = { system: true } as const;

let dbCounter = 0;
function tempPaths(name: string): { readonly governancePath: string; readonly mandatePath: string } {
  dbCounter += 1;
  return {
    governancePath: join(workDir, `${name}-${dbCounter}-governance.sqlite`),
    mandatePath: join(workDir, `${name}-${dbCounter}-mandates.sqlite`),
  };
}

async function openProcess(paths: ReturnType<typeof tempPaths>, idSeed = 0) {
  const governanceStore = await createSqliteGovernanceStore(paths.governancePath);
  const mandateStore = await createSqliteLicenseMandateStore(paths.mandatePath);
  const world = buildLicenseWorld({ governanceStore, mandateStore, idSeed });
  return {
    ...world,
    governanceStore,
    mandateStore,
    async close() {
      await mandateStore.close();
      await governanceStore.close();
    },
  };
}

async function openRawDb(path: string) {
  const { default: Database } = await import('better-sqlite3');
  return new Database(path);
}

async function expectLicenseError(code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.ok(isLicenseGovernanceError(error), `expected a LicenseGovernanceError, received ${String(error)}`);
    assert.equal(error.code, code);
    return;
  }
  throw new Error(`expected ${code} to be thrown`);
}

// ---------------------------------------------------------------------------
// L. Durable mandate — restart recovery.
// ---------------------------------------------------------------------------

describe('LICENSE durability — restart recovery', () => {
  it('recovers a mandate structurally and semantically identical across a restart', async () => {
    const paths = tempPaths('recover');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestLicense(CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate);
    const before = outcome.mandate;
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const after = await processB.service.getMandate(CONTEXT, before.id);
    await processB.close();

    assert.deepEqual(after, before, 'the durable record must survive the restart byte-for-byte');
    // ...and the authorization it carries is still the same authorization.
    assert.equal(enterpriseLicenseTermsEquals(after.terms, webDisplayLicenseTerms()), true);
    assert.equal(after.terms.licenseeRef, LICENSEE_REF);
    assert.equal(after.terms.executorRef, LICENSE_EXECUTOR_REF);
    assert.equal(after.terms.exclusivity, 'non-exclusive');
    assert.deepEqual(after.terms.constraints.permittedContexts, { territory: [PERMITTED_TERRITORY], channel: [PERMITTED_CHANNEL] });
    assert.deepEqual(after.terms.constraints.prohibitedUses, ['model-training']);
    assert.deepEqual(after.terms.constraints.maximumLicensedUnits, { units: 10, unitDenomination: 'seat' });
    assert.equal(after.terms.constraints.maximumLicenseTermEndsAt, '2027-01-01T00:00:00.000Z');
    assert.equal(after.terms.constraints.sublicensing, 'prohibited');
    assert.equal(after.terms.constraints.assignment, 'prohibited');
  });

  it('preserves an absent rights scope and an absent executor across a restart', async () => {
    const paths = tempPaths('absent-fields');
    const base = webDisplayLicenseTerms();
    const { executorRef: _unused, ...withoutExecutor } = base;

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestLicense(CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest({ terms: withoutExecutor }));
    assert.ok(outcome.mandate);
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(CONTEXT, outcome.mandate.id);
    await processB.close();

    assert.equal(recovered.terms.executorRef, undefined, 'an unbound executor must not become bound by a round trip');
    assert.equal(recovered.terms.rightsScope, undefined, 'an unfractioned permission must not become 100% by a round trip');
  });

  it('enforces every permission-containment rule against the recovered mandate', async () => {
    const paths = tempPaths('containment');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestLicense(CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    const processB = await openProcess(paths, 1000);
    for (const [label, overrides] of [
      ['licensee substitution', { licenseeRef: OTHER_LICENSEE_REF }],
      ['executor substitution', { executedBy: 'provider-licensing-platform-d' }],
      ['use expansion', { grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISTRIBUTE] }],
      ['excluded use', { grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING] }],
      ['context expansion', { contexts: { territory: [PERMITTED_TERRITORY, OTHER_TERRITORY], channel: [PERMITTED_CHANNEL] } }],
      ['duration extension', { licenseExpiresAt: '2029-01-01T00:00:00.000Z' }],
      ['exclusivity upgrade', { exclusivity: 'exclusive' }],
      ['rights expansion', { rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.USAGE_RIGHT, ENTERPRISE_LICENSABLE_RIGHT_TYPES.ECONOMIC_INTEREST] }],
      ['unit ceiling', { licensedUnits: { units: 500, unitDenomination: 'seat' } }],
      ['missing agreement reference', { externalAgreementReference: undefined }],
    ] as const) {
      await expectLicenseError('LICENSE_EXECUTION_NOT_AUTHORIZED', () =>
        processB.service.recordExecution(CONTEXT, buildConformingLicenseExecution(mandateId, { ...overrides, executionId: `exec-${label}` })),
      );
    }
    await processB.close();
  });

  it('enforces rights-scope containment against the recovered mandate', async () => {
    const paths = tempPaths('scope');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestLicense(
      CONTEXT,
      LICENSE_TENANT_A,
      buildLicenseManagerRequest({ terms: proportionalLicenseTerms() }),
    );
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(CONTEXT, mandateId);
    assert.deepEqual(recovered.terms.rightsScope, { kind: 'proportional', basisPoints: 2500 });

    // 2500 basis points authorized; 10000 attempted, after a restart.
    await expectLicenseError('LICENSE_EXECUTION_NOT_AUTHORIZED', () =>
      processB.service.recordExecution(
        CONTEXT,
        buildConformingLicenseExecution(mandateId, {
          rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.REVENUE_RIGHT],
          rightsScope: { kind: 'proportional', basisPoints: 10_000 },
        }),
      ),
    );
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// M. Durable revocation.
// ---------------------------------------------------------------------------

describe('LICENSE durability — revocation', () => {
  it('keeps a revocation, and its refusal of further licensing, across a restart', async () => {
    const paths = tempPaths('revocation');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestLicense(
      CONTEXT,
      LICENSE_TENANT_A,
      buildLicenseManagerRequest({ terms: repeatableLicenseTerms() }),
    );
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.service.recordExecution(CONTEXT, buildConformingLicenseExecution(mandateId, { executionId: 'exec-before-revocation' }));
    const revoked = await processA.service.revokeMandate(CONTEXT, { mandateId, reason: 'withdrawn', requestedBy: LICENSE_MANAGER_ACTOR_ID });
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(CONTEXT, mandateId);
    assert.equal(recovered.status, 'revoked');

    await expectLicenseError('LICENSE_EXECUTION_NOT_AUTHORIZED', () =>
      processB.service.recordExecution(CONTEXT, buildConformingLicenseExecution(mandateId, { executionId: 'exec-after-revocation' })),
    );

    // Revocation withdrew future authority; it did not erase the license
    // already granted, and it recorded how far the authorization had gone.
    const executions = await processB.service.listExecutions(CONTEXT, mandateId);
    assert.equal(executions.length, 1);
    const lineage = await processB.service.getEvidenceLineage(CONTEXT, mandateId);
    assert.equal(lineage.revocationRef, revoked.revocation.id);
    assert.equal(lineage.executionCount, 1);
    await processB.close();
  });
});

// ---------------------------------------------------------------------------
// R. Durable replay.
// ---------------------------------------------------------------------------

describe('LICENSE durability — replay across a restart', () => {
  it('replays a request to the original mandate, with no second mandate and no second reference', async () => {
    const paths = tempPaths('replay');
    const request = buildLicenseManagerRequest({ requestId: 'license-request-durable-replay', correlationId: 'license-correlation-durable-replay' });

    const processA = await openProcess(paths);
    const first = await processA.service.requestLicense(CONTEXT, LICENSE_TENANT_A, request);
    assert.ok(first.mandate);
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const second = await processB.service.requestLicense(CONTEXT, LICENSE_TENANT_A, request);
    const record = await processB.governanceStore.getByEvaluationId(SYSTEM_SCOPED, first.evaluationId);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, first.evaluationId);
    await processB.close();

    assert.equal(second.evaluationId, first.evaluationId, 'the replay resolves to the original aggregate');
    assert.equal(second.mandate?.id, first.mandate.id, 'and to the original mandate');
    assert.equal(record?.references.length, 1, 'a replay must not accumulate a second authorization reference');
    assert.equal(record?.references[0]?.sequence, 1, 'nor a second reference-chain position');
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
  });
});

// ---------------------------------------------------------------------------
// T. Durable-record corruption — fail closed, never reconstruct.
// ---------------------------------------------------------------------------

describe('LICENSE durability — corrupted records fail closed', () => {
  async function seedMandate(name: string) {
    const paths = tempPaths(name);
    const processA = await openProcess(paths);
    const outcome = await processA.service.requestLicense(CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const granted = await processA.service.recordExecution(CONTEXT, buildConformingLicenseExecution(mandateId));
    await processA.close();
    return { paths, mandateId, executionId: granted.execution.id };
  }

  it('refuses a mandate whose stored terms are unreadable JSON', async () => {
    const seeded = await seedMandate('corrupt-json');
    const db = await openRawDb(seeded.paths.mandatePath);
    db.prepare(`UPDATE license_mandates SET terms_json = '{not json'`).run();
    db.close();

    const processB = await openProcess(seeded.paths, 1000);
    await expectLicenseError('LICENSE_RECORD_CORRUPTED', () => processB.service.getMandate(CONTEXT, seeded.mandateId));
    await processB.close();
  });

  it('refuses a mandate whose terms changed after commit, even though the new terms are well-formed', async () => {
    // The most dangerous corruption: a *valid* authorization that is not the
    // one that was granted. Here the licensee is silently swapped.
    const seeded = await seedMandate('corrupt-digest');
    const tampered = serializeEnterpriseLicenseTerms(webDisplayLicenseTerms({ licenseeRef: OTHER_LICENSEE_REF }));
    const db = await openRawDb(seeded.paths.mandatePath);
    db.prepare(`UPDATE license_mandates SET terms_json = ?`).run(JSON.stringify(tampered));
    db.close();

    const processB = await openProcess(seeded.paths, 1000);
    await expectLicenseError('LICENSE_RECORD_CORRUPTED', () => processB.service.getMandate(CONTEXT, seeded.mandateId));
    await processB.close();
  });

  it('refuses a mandate carrying an unknown status', async () => {
    const seeded = await seedMandate('corrupt-status');
    const db = await openRawDb(seeded.paths.mandatePath);
    db.prepare(`UPDATE license_mandates SET status = 'terminated'`).run();
    db.close();

    const processB = await openProcess(seeded.paths, 1000);
    await expectLicenseError('LICENSE_RECORD_CORRUPTED', () => processB.service.getMandate(CONTEXT, seeded.mandateId));
    await processB.close();
  });

  it('refuses an execution carrying a malformed rights scope, operating context, or exclusivity', async () => {
    for (const [label, sql] of [
      ['rights scope', `UPDATE license_executions SET rights_scope_json = '{"kind":"proportional","basisPoints":-5}'`],
      ['contexts', `UPDATE license_executions SET contexts_json = '{"territory":[]}'`],
      ['exclusivity', `UPDATE license_executions SET exclusivity = 'perpetual-and-absolute'`],
      ['granted uses', `UPDATE license_executions SET granted_uses_json = '["teleportation"]'`],
      ['licensed units', `UPDATE license_executions SET licensed_units_json = '{"units":0,"unitDenomination":"seat"}'`],
    ] as const) {
      const seeded = await seedMandate(`corrupt-exec-${label.replace(/\s+/g, '-')}`);
      const db = await openRawDb(seeded.paths.mandatePath);
      db.prepare(sql).run();
      db.close();

      const processB = await openProcess(seeded.paths, 1000);
      await expectLicenseError('LICENSE_RECORD_CORRUPTED', () => processB.service.listExecutions(CONTEXT, seeded.mandateId));
      await processB.close();
    }
  });

  it('refuses a lifecycle record carrying an unknown lifecycle type', async () => {
    const seeded = await seedMandate('corrupt-lifecycle');
    const processA = await openProcess(seeded.paths, 500);
    await processA.service.recordLifecycleEvent(CONTEXT, {
      mandateId: seeded.mandateId,
      executionId: seeded.executionId,
      reportedBy: LICENSE_EXECUTOR_REF,
      occurredAt: '2026-06-01T00:00:00.000Z',
      lifecycleType: ENTERPRISE_LICENSE_LIFECYCLE_TYPES.EXPIRED,
    });
    await processA.close();

    const db = await openRawDb(seeded.paths.mandatePath);
    db.prepare(`UPDATE license_lifecycle_events SET lifecycle_type = 'evaporated'`).run();
    db.close();

    const processB = await openProcess(seeded.paths, 1000);
    await expectLicenseError('LICENSE_RECORD_CORRUPTED', () => processB.service.listLifecycleEvents(CONTEXT, seeded.mandateId));
    await processB.close();
  });

  it('refuses to open a store written under a different schema version', async () => {
    const seeded = await seedMandate('schema-guard');
    const db = await openRawDb(seeded.paths.mandatePath);
    db.prepare(`UPDATE license_mandate_store_versions SET schema_version = 'aoc.license-mandate-store.schema.v99'`).run();
    db.close();

    await assert.rejects(
      () => createSqliteLicenseMandateStore(seeded.paths.mandatePath),
      (error: unknown) => isLicenseGovernanceError(error) && error.code === 'LICENSE_STORE_UNAVAILABLE',
    );
  });
});

// ---------------------------------------------------------------------------
// O/P/Q. authorization_artifact classification and reference integrity.
//
// The full reference-integrity mechanism has its own suite; what is proven
// here is that the LICENSE enforcement path *uses* it, unchanged.
// ---------------------------------------------------------------------------

describe('LICENSE durability — authorization_artifact and reference integrity', () => {
  it('classifies the mandate as an authorization_artifact and seals it through the canonical store path', async () => {
    const paths = tempPaths('artifact');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestLicense(CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const evaluationId = outcome.evaluationId;
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const record = await processB.governanceStore.getByEvaluationId(SYSTEM_SCOPED, evaluationId);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
    await processB.close();

    const reference = (record?.references ?? []).find((entry) => entry.externalId === mandateId);
    assert.ok(reference, 'the mandate reference must survive the restart');
    assert.equal(reference.referenceType, 'authorization_artifact', 'a LicenseMandate is AOC-owned authorization, never an external artifact');
    assert.equal(reference.integrityVersion, GOVERNANCE_REFERENCE_INTEGRITY_VERSION, 'the enforcement path must write protected references');
    assert.equal(reference.sequence, 1);
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.equal(verification.referenceIntegrity.protectedValid, 1);
    assert.equal(verification.referenceIntegrity.legacyUnprotected, 0);
  });

  it('seals external license and lifecycle evidence on the same chain as the authorization', async () => {
    const paths = tempPaths('artifact-chain');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestLicense(CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const evaluationId = outcome.evaluationId;
    const granted = await processA.service.recordExecution(CONTEXT, buildConformingLicenseExecution(mandateId));
    const ended = await processA.service.recordLifecycleEvent(CONTEXT, {
      mandateId,
      executionId: granted.execution.id,
      reportedBy: LICENSE_EXECUTOR_REF,
      occurredAt: '2026-06-01T00:00:00.000Z',
      lifecycleType: ENTERPRISE_LICENSE_LIFECYCLE_TYPES.EXPIRED,
    });
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const record = await processB.governanceStore.getByEvaluationId(SYSTEM_SCOPED, evaluationId);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
    await processB.close();

    const references = [...(record?.references ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    assert.deepEqual(
      references.map((reference) => reference.referenceType),
      ['authorization_artifact', 'execution_record', 'execution_record'],
      'AOC authorized once; the grant and its reported end are two separate external observations',
    );
    assert.deepEqual(references.map((reference) => reference.sequence), [1, 2, 3]);
    assert.equal(references[1]?.externalId, granted.execution.id);
    assert.equal(references[2]?.externalId, ended.id);
    assert.equal(references[1]?.previousReferenceDigest, references[0]?.referenceDigest, 'the grant links to the authorization that preceded it');
    assert.equal(references[2]?.previousReferenceDigest, references[1]?.referenceDigest, 'and the reported end links to the grant');
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.equal(verification.referenceIntegrity.protectedValid, 3);
  });

  it('detects direct tampering with a persisted LICENSE reference', async () => {
    for (const [label, sql] of [
      ['reference_type', `UPDATE governance_references SET reference_type = 'external_artifact' WHERE reference_type = 'authorization_artifact'`],
      ['external_id', `UPDATE governance_references SET external_id = 'license-mandate:forged' WHERE reference_type = 'authorization_artifact'`],
    ] as const) {
      const paths = tempPaths(`tamper-${label}`);

      const processA = await openProcess(paths);
      const outcome = await processA.service.requestLicense(CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
      assert.ok(outcome.mandate);
      const evaluationId = outcome.evaluationId;
      await processA.close();

      const db = await openRawDb(paths.governancePath);
      db.prepare(sql).run();
      db.close();

      const processB = await openProcess(paths, 1000);
      const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
      await processB.close();

      assert.equal(verification.valid, false, `${label} tampering must be detected`);
      assert.equal(verification.checks.referenceIntegrity, false);
      assert.equal(verification.checks.aggregateDigest, true, 'the governance decision record itself is untouched');
      assert.equal(verification.referenceIntegrity.protectedCorrupted, 1);
    }
  });
});

// ---------------------------------------------------------------------------
// The executable reference scenario — the whole lineage, end to end, across
// two restarts.
// ---------------------------------------------------------------------------

describe('LICENSE reference scenario — Digital Work A licensed to Company B', () => {
  it('runs authority -> decision -> mandate -> artifact -> restart -> execution -> evidence -> restart -> full lineage', async () => {
    const paths = tempPaths('reference-scenario');

    // --- Process 1: authority is recognized, the decision is made, the
    // mandate is issued and sealed as an authorization_artifact. -------------
    const processA = await openProcess(paths);
    const outcome = await processA.service.requestLicense(CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());

    assert.equal(outcome.status, 'allowed', 'the Kernel, not this module, decided this');
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const evaluationId = outcome.evaluationId;
    assert.equal(outcome.mandate.executionCount, 0, 'AOC authorized a license; it does not yet claim one exists');
    await processA.close();

    // --- Restart: the mandate is recovered unchanged. ----------------------
    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(CONTEXT, mandateId);
    assert.equal(recovered.assetId, 'digital-work-a', 'asset unchanged');
    assert.deepEqual(recovered.terms.rights, [ENTERPRISE_LICENSABLE_RIGHT_TYPES.USAGE_RIGHT], 'rights unchanged');
    assert.equal(recovered.terms.licenseeRef, LICENSEE_REF, 'licensee unchanged');
    assert.equal(enterpriseLicenseTermsEquals(recovered.terms, webDisplayLicenseTerms()), true, 'permission unchanged');
    assert.equal(recovered.terms.constraints.maximumLicenseTermEndsAt, '2027-01-01T00:00:00.000Z', 'duration unchanged');
    assert.equal(recovered.organizationId, LICENSE_TENANT_A, 'tenant unchanged');

    // --- The external licensing platform reports what it granted. ----------
    const granted = await processB.service.recordExecution(CONTEXT, buildConformingLicenseExecution(mandateId));
    assert.equal(granted.mandate.executionCount, 1, 'only now does AOC have evidence a license exists');

    // --- ...and nothing broader can be reported under this authorization. ---
    for (const [label, overrides] of [
      ['replace licensee', { licenseeRef: OTHER_LICENSEE_REF }],
      ['add rights', { rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.USAGE_RIGHT, ENTERPRISE_LICENSABLE_RIGHT_TYPES.REVENUE_RIGHT] }],
      ['expand use', { grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISTRIBUTE] }],
      ['expand context', { contexts: { territory: [PERMITTED_TERRITORY, OTHER_TERRITORY], channel: [PERMITTED_CHANNEL] } }],
      ['extend duration', { licenseExpiresAt: '2029-01-01T00:00:00.000Z' }],
      ['change exclusivity', { exclusivity: 'exclusive' }],
      ['replace executor', { executedBy: 'provider-licensing-platform-d' }],
    ] as const) {
      await expectLicenseError('LICENSE_EXECUTION_NOT_AUTHORIZED', () =>
        processB.service.recordExecution(CONTEXT, buildConformingLicenseExecution(mandateId, { ...overrides, executionId: `scenario-${label}` })),
      );
    }
    // A replayed grant is refused as a replay, not silently double-counted.
    await expectLicenseError('LICENSE_EXECUTION_ALREADY_RECORDED', () =>
      processB.service.recordExecution(CONTEXT, buildConformingLicenseExecution(mandateId, { executionId: granted.execution.id })),
    );
    await processB.close();

    // --- Restart: the whole lineage reconstructs from stored references. ---
    const processC = await openProcess(paths, 2000);
    const lineage = await processC.service.getEvidenceLineage(CONTEXT, mandateId);
    const record = await processC.governanceStore.getByEvaluationId(SYSTEM_SCOPED, evaluationId);
    const verification = await processC.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
    await processC.close();

    // Why was licensing permitted, and by which decision?
    assert.equal(lineage.decisionRef, outcome.decisionId);
    assert.equal(lineage.evaluationRef, evaluationId);
    // Who asked, who received, what could they do, where, how exclusively?
    assert.equal(lineage.requestedBy, LICENSE_MANAGER_ACTOR_ID);
    assert.equal(lineage.licenseeRef, LICENSEE_REF);
    assert.deepEqual([...lineage.permittedUses].sort(), ['commercial-use', 'display', 'reproduce']);
    assert.deepEqual(lineage.prohibitedUses, ['model-training']);
    assert.deepEqual(lineage.permittedContexts, { territory: [PERMITTED_TERRITORY], channel: [PERMITTED_CHANNEL] });
    assert.equal(lineage.exclusivity, 'non-exclusive');
    assert.equal(lineage.executorRef, LICENSE_EXECUTOR_REF);
    // Was it executed, and is that execution reachable from the decision?
    assert.deepEqual(lineage.executionRefs, [granted.execution.id]);
    const referenced = (record?.references ?? []).map((entry) => entry.externalId);
    assert.ok(referenced.includes(mandateId), 'the mandate is reachable from the evaluation that authorized it');
    assert.ok(referenced.includes(granted.execution.id), 'and so is the license actually granted under it');
    // ...and the whole chain still verifies.
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.equal(verification.referenceIntegrity.protectedValid, 2);
  });
});
