import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ENTERPRISE_TRANSFERABLE_RIGHT_TYPES,
  ENTERPRISE_TRANSFER_LIFECYCLE_TYPES,
  enterpriseTransferTermsEquals,
  serializeEnterpriseTransferTerms,
} from '@aoc-enterprise/transfer-mandate';

import { GOVERNANCE_REFERENCE_INTEGRITY_VERSION } from '../governance-store/contracts.js';
import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
import { isTransferGovernanceError } from '../transfer-governance/errors.js';
import { createSqliteTransferMandateStore } from '../transfer-governance/sqlite-mandate-store.js';
import type { TransferGovernanceContext } from '../transfer-governance/contracts.js';
import {
  OTHER_TRANSFEREE_REF,
  PERMITTED_REGISTRY,
  TRANSFEREE_REF,
  TRANSFEROR_REF,
  TRANSFER_EXECUTOR_REF,
  TRANSFER_MANAGER_ACTOR_ID,
  TRANSFER_TENANT_A,
  buildConformingTransferExecution,
  buildTransferManagerRequest,
  buildTransferWorld,
  quarterInterestTransferTerms,
  trancheTransferTerms,
} from './transfer-support.js';

/**
 * Durability for the `TRANSFER` governed action: everything the in-memory
 * suite proves must survive a real process boundary. Each "restart" here
 * closes both SQLite stores and reopens them over the same files with a
 * freshly-built world, so nothing is carried across in memory.
 *
 * The invariant that gets the most attention is the one this action introduced:
 * a *conserved* quantity. A cumulative total that survived a restart wrongly
 * would let a portion of a right move twice across a process boundary, which is
 * the worst failure this action can have.
 */

const workDir = mkdtempSync(join(tmpdir(), 'aoc-transfer-durability-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

const CONTEXT: TransferGovernanceContext = { system: false, organizationId: TRANSFER_TENANT_A, actorId: 'operator-a' };
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
  const mandateStore = await createSqliteTransferMandateStore(paths.mandatePath);
  const world = buildTransferWorld({ governanceStore, mandateStore, idSeed });
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

async function expectTransferError(code: string, run: () => Promise<unknown>, refusalCode?: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.ok(isTransferGovernanceError(error), `expected a TransferGovernanceError, received ${String(error)}`);
    assert.equal(error.code, code);
    if (refusalCode !== undefined) {
      assert.equal((error.details as { refusalCode?: string } | undefined)?.refusalCode, refusalCode);
    }
    return;
  }
  assert.fail(`expected ${code} to be thrown`);
}

describe('TRANSFER durability — the mandate survives a restart unchanged', () => {
  it('recovers a mandate structurally and semantically identical after a restart', async () => {
    const paths = tempPaths('recover');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate);
    const before = outcome.mandate;
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const after = await processB.service.getMandate(CONTEXT, before.id);
    await processB.close();

    assert.equal(after.id, before.id);
    assert.equal(after.status, 'active');
    assert.equal(after.assetId, before.assetId);
    assert.equal(after.requestRef, before.requestRef);
    assert.equal(after.requestedBy, before.requestedBy);
    assert.equal(after.decisionRef, before.decisionRef);
    assert.equal(after.evaluationRef, before.evaluationRef);
    assert.equal(after.effectiveFrom, before.effectiveFrom);
    assert.equal(after.expiresAt, before.expiresAt);
    assert.equal(after.correlationId, before.correlationId);
    assert.ok(enterpriseTransferTermsEquals(after.terms, before.terms));
    assert.equal(after.terms.transferorRef, TRANSFEROR_REF);
    assert.equal(after.terms.transfereeRef, TRANSFEREE_REF);
    assert.deepEqual(after.terms.scope, { kind: 'proportional', basisPoints: 2500 });
    assert.equal(after.executionCount, 0);
    assert.equal(after.transferredScope, undefined);
  });

  it('recovers the cumulative transferred total, and still refuses the tranche that would exceed it', async () => {
    const paths = tempPaths('cumulative');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest({ terms: trancheTransferTerms() }));
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.service.recordExecution(
      CONTEXT,
      buildConformingTransferExecution(mandateId, { executionId: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1500 } }),
    );
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(CONTEXT, mandateId);
    assert.deepEqual(recovered.transferredScope, { kind: 'proportional', basisPoints: 1500 });
    assert.equal(recovered.executionCount, 1);

    // 10% still fits inside the remaining 10%.
    const second = await processB.service.recordExecution(
      CONTEXT,
      buildConformingTransferExecution(mandateId, { executionId: 'exec-2', transferredScope: { kind: 'proportional', basisPoints: 1000 } }),
    );
    assert.deepEqual(second.mandate.transferredScope, { kind: 'proportional', basisPoints: 2500 });

    // And a further basis point does not — across a process boundary.
    await expectTransferError(
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      () =>
        processB.service.recordExecution(
          CONTEXT,
          buildConformingTransferExecution(mandateId, { executionId: 'exec-3', transferredScope: { kind: 'proportional', basisPoints: 1 } }),
        ),
      'CUMULATIVE_SCOPE_EXCEEDS_MANDATE',
    );
    await processB.close();
  });

  it('keeps a revoked mandate revoked, and keeps refusing further movement, after a restart', async () => {
    const paths = tempPaths('revoked');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.service.revokeMandate(CONTEXT, { mandateId, reason: 'withdrawn', requestedBy: TRANSFER_MANAGER_ACTOR_ID });
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(CONTEXT, mandateId);
    assert.equal(recovered.status, 'revoked');
    await expectTransferError(
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      () => processB.service.recordExecution(CONTEXT, buildConformingTransferExecution(mandateId)),
      'MANDATE_REVOKED',
    );
    const revocation = await processB.mandateStore.getRevocation(CONTEXT, mandateId);
    assert.equal(revocation?.executionsAtRevocation, 0);
    await processB.close();
  });

  it('refuses to reconstruct a mandate whose stored terms changed after commit', async () => {
    const paths = tempPaths('tampered-terms');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.close();

    // The exact escalation the digest exists to catch: widen 25% to 100% and
    // swap the recipient, directly in the database, leaving the digest stale.
    const forged = serializeEnterpriseTransferTerms(
      quarterInterestTransferTerms({ scope: { kind: 'proportional', basisPoints: 10_000 }, transfereeRef: OTHER_TRANSFEREE_REF }),
    );
    const db = await openRawDb(paths.mandatePath);
    db.prepare(`UPDATE transfer_mandates SET terms_json = ? WHERE mandate_id = ?`).run(JSON.stringify(forged), mandateId);
    db.close();

    const processB = await openProcess(paths, 1000);
    await expectTransferError('TRANSFER_RECORD_CORRUPTED', () => processB.service.getMandate(CONTEXT, mandateId));
    await processB.close();
  });

  it('fails closed on an unknown stored status, a malformed scope column, and unreadable terms', async () => {
    for (const [label, sql] of [
      ['status', `UPDATE transfer_mandates SET status = 'completed'`],
      ['scope', `UPDATE transfer_mandates SET transferred_scope_json = '{"kind":"proportional","basisPoints":-5}'`],
      ['terms', `UPDATE transfer_mandates SET terms_json = 'not json at all'`],
    ] as const) {
      const paths = tempPaths(`corrupt-${label}`);

      const processA = await openProcess(paths);
      const outcome = await processA.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest({ terms: trancheTransferTerms() }));
      assert.ok(outcome.mandate);
      const mandateId = outcome.mandate.id;
      await processA.service.recordExecution(
        CONTEXT,
        buildConformingTransferExecution(mandateId, { executionId: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1000 } }),
      );
      await processA.close();

      const db = await openRawDb(paths.mandatePath);
      db.prepare(sql).run();
      db.close();

      const processB = await openProcess(paths, 1000);
      await expectTransferError('TRANSFER_RECORD_CORRUPTED', () => processB.service.getMandate(CONTEXT, mandateId), undefined);
      await processB.close();
    }
  });

  it('refuses to open a store written by a different schema version', async () => {
    const paths = tempPaths('schema-guard');

    const processA = await openProcess(paths);
    await processA.close();

    const db = await openRawDb(paths.mandatePath);
    db.prepare(`INSERT INTO transfer_mandate_store_versions (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`).run(
      'aoc.transfer-mandate-store.schema.v99',
      '2026-01-01T00:00:00.000Z',
    );
    db.close();

    await expectTransferError('TRANSFER_STORE_UNAVAILABLE', () => createSqliteTransferMandateStore(paths.mandatePath));
  });
});

describe('TRANSFER durability — replay across a restart', () => {
  it('replaying a request after a restart returns the original mandate and appends no second reference or chain position', async () => {
    const paths = tempPaths('replay');
    const submission = buildTransferManagerRequest({ requestId: 'transfer-request-fixed', correlationId: 'corr-fixed' });

    const processA = await openProcess(paths);
    const first = await processA.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, submission);
    assert.ok(first.mandate);
    await processA.close();

    const processB = await openProcess(paths, 1000);
    const second = await processB.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, submission);
    const record = await processB.governanceStore.getByEvaluationId(SYSTEM_SCOPED, first.evaluationId);
    const verification = await processB.governanceStore.verify(SYSTEM_SCOPED, first.evaluationId);
    await processB.close();

    assert.ok(second.mandate);
    assert.equal(second.mandate.id, first.mandate.id, 'replaying a request must never authorize the same portion to move twice');
    assert.equal(second.evaluationId, first.evaluationId);
    assert.equal((record?.references ?? []).length, 1, 'no second authorization reference, and no extra chain position');
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
  });

  it('replaying an execution after a restart records no second movement and does not advance the total', async () => {
    const paths = tempPaths('exec-replay');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest({ terms: trancheTransferTerms() }));
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    await processA.service.recordExecution(
      CONTEXT,
      buildConformingTransferExecution(mandateId, { executionId: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1000 } }),
    );
    await processA.close();

    const processB = await openProcess(paths, 1000);
    await expectTransferError('TRANSFER_EXECUTION_ALREADY_RECORDED', () =>
      processB.service.recordExecution(
        CONTEXT,
        buildConformingTransferExecution(mandateId, { executionId: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1000 } }),
      ),
    );
    const recovered = await processB.service.getMandate(CONTEXT, mandateId);
    const executions = await processB.service.listExecutions(CONTEXT, mandateId);
    await processB.close();

    assert.equal(recovered.executionCount, 1);
    assert.deepEqual(recovered.transferredScope, { kind: 'proportional', basisPoints: 1000 });
    assert.equal(executions.length, 1);
  });
});

describe('TRANSFER durability — authorization_artifact and reference integrity', () => {
  it('classifies the mandate as an authorization_artifact and seals it through the canonical store path', async () => {
    const paths = tempPaths('artifact');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
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
    assert.equal(reference.referenceType, 'authorization_artifact', 'a TransferMandate is Soberanía-owned authorization, never an external artifact');
    assert.equal(reference.integrityVersion, GOVERNANCE_REFERENCE_INTEGRITY_VERSION, 'the enforcement path must write protected references');
    assert.equal(reference.sequence, 1);
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.equal(verification.referenceIntegrity.protectedValid, 1);
    assert.equal(verification.referenceIntegrity.legacyUnprotected, 0);
  });

  it('seals the movement and its reported outcome on the same chain as the authorization', async () => {
    const paths = tempPaths('artifact-chain');

    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const evaluationId = outcome.evaluationId;
    const moved = await processA.service.recordExecution(CONTEXT, buildConformingTransferExecution(mandateId));
    const registered = await processA.service.recordLifecycleEvent(CONTEXT, {
      mandateId,
      executionId: moved.execution.id,
      reportedBy: PERMITTED_REGISTRY,
      occurredAt: '2026-06-01T00:00:00.000Z',
      lifecycleType: ENTERPRISE_TRANSFER_LIFECYCLE_TYPES.REGISTERED,
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
      'Soberanía authorized once; the movement and its reported registration are two separate external observations',
    );
    assert.deepEqual(references.map((reference) => reference.sequence), [1, 2, 3]);
    assert.equal(references[1]?.externalId, moved.execution.id);
    assert.equal(references[2]?.externalId, registered.id);
    assert.equal(references[1]?.previousReferenceDigest, references[0]?.referenceDigest, 'the movement links to the authorization that preceded it');
    assert.equal(references[2]?.previousReferenceDigest, references[1]?.referenceDigest, 'and the reported registration links to the movement');
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.equal(verification.referenceIntegrity.protectedValid, 3);
  });

  it('detects direct tampering with a persisted TRANSFER reference', async () => {
    for (const [label, sql] of [
      ['reference_type', `UPDATE governance_references SET reference_type = 'external_artifact' WHERE reference_type = 'authorization_artifact'`],
      ['external_id', `UPDATE governance_references SET external_id = 'transfer-mandate:forged' WHERE reference_type = 'authorization_artifact'`],
    ] as const) {
      const paths = tempPaths(`tamper-${label}`);

      const processA = await openProcess(paths);
      const outcome = await processA.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
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

describe('TRANSFER reference scenario — 25% of Party A economic interest to Party B', () => {
  it('runs authority -> decision -> mandate -> artifact -> restart -> movement -> evidence -> restart -> full lineage', async () => {
    const paths = tempPaths('reference-scenario');

    // --- Process A: authority recognized, decision made, mandate issued, sealed.
    const processA = await openProcess(paths);
    const outcome = await processA.service.requestTransfer(CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate);
    const mandateId = outcome.mandate.id;
    const evaluationId = outcome.evaluationId;
    const decisionId = outcome.decisionId;
    await processA.close();

    // --- Process B: mandate recovered unchanged, then the movement is effected.
    const processB = await openProcess(paths, 1000);
    const recovered = await processB.service.getMandate(CONTEXT, mandateId);
    assert.equal(recovered.assetId, 'digital-asset-a', 'asset unchanged');
    assert.deepEqual(recovered.terms.rights, [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST], 'right unchanged');
    assert.deepEqual(recovered.terms.scope, { kind: 'proportional', basisPoints: 2500 }, 'scope unchanged');
    assert.equal(recovered.terms.transferorRef, TRANSFEROR_REF, 'holder unchanged');
    assert.equal(recovered.terms.transfereeRef, TRANSFEREE_REF, 'recipient unchanged');
    assert.equal(recovered.organizationId, TRANSFER_TENANT_A, 'tenant unchanged');
    assert.equal(recovered.terms.constraints.partialTransferAllowed, false, 'constraints unchanged');
    assert.deepEqual(recovered.terms.constraints.permittedRegistries, [PERMITTED_REGISTRY], 'constraints unchanged');

    // Every invalid attempt is refused before the valid one is recorded, so
    // the refusals are measured against a live authorization rather than a
    // spent one.
    await expectTransferError(
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      () =>
        processB.service.recordExecution(
          CONTEXT,
          buildConformingTransferExecution(mandateId, { transferredScope: { kind: 'proportional', basisPoints: 10_000 } }),
        ),
      'SCOPE_EXCEEDS_MANDATE',
    );
    await expectTransferError(
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      () => processB.service.recordExecution(CONTEXT, buildConformingTransferExecution(mandateId, { transfereeRef: OTHER_TRANSFEREE_REF })),
      'TRANSFEREE_NOT_AUTHORIZED',
    );
    await expectTransferError(
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      () =>
        processB.service.recordExecution(
          CONTEXT,
          buildConformingTransferExecution(mandateId, {
            rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST, ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.OWNERSHIP_INTEREST],
          }),
        ),
      'RIGHTS_NOT_AUTHORIZED',
    );
    await expectTransferError(
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      () => processB.service.recordExecution(CONTEXT, buildConformingTransferExecution(mandateId, { executedBy: 'provider-transfer-agent-d' })),
      'EXECUTOR_NOT_AUTHORIZED',
    );

    const moved = await processB.service.recordExecution(CONTEXT, buildConformingTransferExecution(mandateId, { executionId: 'transfer-execution-ref' }));
    assert.deepEqual(moved.mandate.transferredScope, { kind: 'proportional', basisPoints: 2500 });

    // Replaying the same movement records nothing further.
    await expectTransferError('TRANSFER_EXECUTION_ALREADY_RECORDED', () =>
      processB.service.recordExecution(CONTEXT, buildConformingTransferExecution(mandateId, { executionId: 'transfer-execution-ref' })),
    );
    await processB.close();

    // --- Process C: the whole lineage is reconstructible, and post-revocation
    //     no further movement is possible.
    const processC = await openProcess(paths, 2000);
    const lineage = await processC.service.getEvidenceLineage(CONTEXT, mandateId);

    assert.equal(lineage.decisionRef, decisionId, 'who authorized the transfer');
    assert.equal(lineage.evaluationRef, evaluationId);
    assert.deepEqual(lineage.rights, [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST], 'what right was transferred');
    assert.deepEqual(lineage.authorizedScope, { kind: 'proportional', basisPoints: 2500 }, 'how much');
    assert.deepEqual(lineage.transferredScope, { kind: 'proportional', basisPoints: 2500 }, 'and how much actually moved');
    assert.equal(lineage.transferorRef, TRANSFEROR_REF, 'from whom');
    assert.equal(lineage.transfereeRef, TRANSFEREE_REF, 'to whom');
    assert.equal(lineage.executorRef, TRANSFER_EXECUTOR_REF, 'who executed it');
    assert.equal(lineage.partialTransferAllowed, false, 'under what restrictions');
    assert.deepEqual(lineage.permittedRegistries, [PERMITTED_REGISTRY]);
    assert.equal(lineage.executionRefs.length, 1, 'did the external transfer happen');
    assert.equal(lineage.executionCount, 1);
    assert.equal(lineage.revocationRef, undefined, 'was the mandate revoked');
    assert.notEqual(lineage.requestedBy, lineage.transferorRef, 'the requester was an administrator, not the holder');

    const verification = await processC.governanceStore.verify(SYSTEM_SCOPED, evaluationId);
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.equal(verification.referenceIntegrity.protectedValid, 2);

    // Revoking now withdraws only future authority; what moved is preserved.
    const revoked = await processC.service.revokeMandate(CONTEXT, { mandateId, reason: 'complete', requestedBy: TRANSFER_MANAGER_ACTOR_ID });
    assert.equal(revoked.kind, 'revoked');
    assert.deepEqual(revoked.revocation.transferredScopeAtRevocation, { kind: 'proportional', basisPoints: 2500 });
    await expectTransferError(
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      () => processC.service.recordExecution(CONTEXT, buildConformingTransferExecution(mandateId, { executionId: 'transfer-execution-after-revocation' })),
      'MANDATE_REVOKED',
    );
    const lineageAfter = await processC.service.getEvidenceLineage(CONTEXT, mandateId);
    assert.equal(lineageAfter.executionRefs.length, 1, 'revocation never deletes evidence of what already moved');
    await processC.close();
  });
});
