import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
import type { AppendGovernanceEvaluationInput } from '../governance-store/contracts.js';
import { GovernanceStoreError } from '../governance-store/errors.js';
import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
import { createInMemoryGovernanceStore, corruptInMemoryRecordForTests } from '../governance-store/in-memory-governance-store.js';

const workDir = mkdtempSync(join(tmpdir(), 'aoc-governance-store-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

function buildInput(requestId: string, decisionId: string): AppendGovernanceEvaluationInput {
  const request: KernelEvaluationRequest = {
    requestId,
    actor: { id: 'actor-1', trustDomainId: 'td-1' },
    action: { type: 'draft_email', resourceScope: 'project:x' },
    organization: { id: 'org-a' },
    requestedAt: '2026-01-01T00:00:00.000Z',
  };
  const result = {
    requestId,
    decisionId,
    status: 'allowed',
    reasonCodes: ['OK'],
    summary: 'fine',
    recognition: { performed: true },
    authority: { performed: false },
    policies: [],
    approval: { performed: false, status: 'not_applicable' },
    evidence: [],
    trace: { steps: [{ sequence: 1, operator: 'recognition', status: 'passed', reasonCodes: ['OK'] }], decisionId, kernelVersion: '1.0.0' },
    evaluatedAt: '2026-01-01T00:00:01.000Z',
    kernelVersion: '1.0.0',
  } as KernelEvaluationResult;
  return {
    request,
    result,
    receivedAt: '2026-01-01T00:00:00.500Z',
    enterpriseContext: { enterpriseVersion: '1.0.0', lifecycleState: 'ready', modules: [] },
    events: [{ eventId: `evt-${requestId}`, type: 'GovernanceEvaluationRequested', occurredAt: '2026-01-01T00:00:00.500Z', requestId }],
    accessContext: { system: true },
  };
}

async function openRawDb(path: string) {
  const { default: Database } = await import('better-sqlite3');
  return new Database(path);
}

describe('Governance Store SQLite specifics', () => {
  it('enables foreign keys and WAL journal mode on file databases', async () => {
    const path = join(workDir, 'pragmas.sqlite');
    const store = await createSqliteGovernanceStore(path);
    await store.appendEvaluation(buildInput('req-1', 'dec-1'));
    await store.close();

    const db = await openRawDb(path);
    assert.equal((db.pragma('journal_mode', { simple: true }) as string).toLowerCase(), 'wal');
    // FK enforcement is per-connection; prove the schema declares real FKs.
    const fkList = db.pragma(`foreign_key_list(governance_evaluations)`) as { table: string }[];
    assert.ok(fkList.some((fk) => fk.table === 'governance_requests'));
    db.close();
  });

  it('persists across close/reopen: the aggregate reconstructs and verifies from disk', async () => {
    const path = join(workDir, 'reopen.sqlite');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-r1', 'dec-r1'));
    await store.close();

    const reopened = await createSqliteGovernanceStore(path);
    const record = await reopened.getByEvaluationId({ system: true }, appended.evaluationId);
    assert.equal(record?.evaluation.decisionId, 'dec-r1');
    const verification = await reopened.verify({ system: true }, appended.evaluationId);
    assert.equal(verification.valid, true);
    await reopened.close();
  });

  it('handles concurrent inserts through one store without duplicates or orphans', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const outcomes = await Promise.all(Array.from({ length: 20 }, (_, index) => store.appendEvaluation(buildInput(`req-c${index}`, `dec-c${index}`))));
    assert.equal(new Set(outcomes.map((outcome) => outcome.evaluationId)).size, 20);
    const page = await store.query({ system: true }, { limit: 50 });
    assert.equal(page.records.length, 20);
    await store.close();
  });

  it('maps use-after-close to GOVERNANCE_STORE_UNAVAILABLE', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    await store.close();
    await assert.rejects(store.appendEvaluation(buildInput('req-x', 'dec-x')), (error: unknown) => error instanceof GovernanceStoreError && error.code === 'GOVERNANCE_STORE_UNAVAILABLE');
  });

  it('rejects a database stamped with an unsupported future schema version', async () => {
    const path = join(workDir, 'future-schema.sqlite');
    const store = await createSqliteGovernanceStore(path);
    await store.close();
    const db = await openRawDb(path);
    db.prepare(`INSERT INTO governance_store_versions (schema_version, migration_state, recorded_at) VALUES (?, ?, ?)`).run('aoc.governance-store.schema.v99', 'fresh', '2027-01-01T00:00:00.000Z');
    db.close();

    await assert.rejects(createSqliteGovernanceStore(path), (error: unknown) => error instanceof GovernanceStoreError && error.code === 'GOVERNANCE_SCHEMA_VERSION_UNSUPPORTED');
  });
});

describe('Governance Store tamper detection (SQLite, via direct file mutation)', () => {
  async function tamper(name: string, mutate: (db: Awaited<ReturnType<typeof openRawDb>>, evaluationId: string) => void): Promise<{ readonly valid: boolean; readonly failedChecks: readonly string[] }> {
    const path = join(workDir, `${name}.sqlite`);
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-tamper', 'dec-tamper'));
    await store.appendEvaluation(buildInput('req-tamper-2', 'dec-tamper-2'));
    await store.close();

    const db = await openRawDb(path);
    mutate(db, appended.evaluationId);
    db.close();

    const reopened = await createSqliteGovernanceStore(path);
    const verification = await reopened.verify({ system: true }, appended.evaluationId);
    await reopened.close();
    return { valid: verification.valid, failedChecks: verification.failures.map((failure) => failure.check) };
  }

  it('detects request payload tampering', async () => {
    const outcome = await tamper('tamper-request', (db) => {
      db.prepare(`UPDATE governance_requests SET request_payload_json = ? WHERE request_id = 'req-tamper'`).run(JSON.stringify({ forged: true }));
    });
    assert.equal(outcome.valid, false);
    assert.ok(outcome.failedChecks.includes('requestDigest'));
  });

  it('detects evaluation result tampering (e.g. a rewritten status)', async () => {
    const outcome = await tamper('tamper-evaluation', (db, evaluationId) => {
      db.prepare(`UPDATE governance_evaluations SET status = 'denied' WHERE evaluation_id = ?`).run(evaluationId);
    });
    assert.equal(outcome.valid, false);
    assert.ok(outcome.failedChecks.includes('evaluationDigest'));
  });

  it('detects trace tampering', async () => {
    const outcome = await tamper('tamper-trace', (db, evaluationId) => {
      db.prepare(`UPDATE governance_trace_steps SET status = 'failed' WHERE evaluation_id = ?`).run(evaluationId);
    });
    assert.equal(outcome.valid, false);
    assert.ok(outcome.failedChecks.includes('traceDigest'));
  });

  it('detects event tampering', async () => {
    const outcome = await tamper('tamper-event', (db, evaluationId) => {
      db.prepare(`UPDATE governance_events SET event_payload_json = ? WHERE aggregate_type = 'governance_evaluation' AND aggregate_id = ?`).run(JSON.stringify({ forged: true }), evaluationId);
    });
    assert.equal(outcome.valid, false);
    assert.ok(outcome.failedChecks.includes('eventsDigest'));
  });

  it('detects metadata tampering', async () => {
    const outcome = await tamper('tamper-metadata', (db, evaluationId) => {
      db.prepare(`UPDATE governance_record_metadata SET lifecycle_state = 'forged' WHERE evaluation_id = ?`).run(evaluationId);
    });
    assert.equal(outcome.valid, false);
    assert.ok(outcome.failedChecks.includes('metadataDigest'));
  });

  it('detects aggregate digest tampering and chain breakage in the successor', async () => {
    const path = join(workDir, 'tamper-chain.sqlite');
    const store = await createSqliteGovernanceStore(path);
    const first = await store.appendEvaluation(buildInput('req-ch1', 'dec-ch1'));
    const second = await store.appendEvaluation(buildInput('req-ch2', 'dec-ch2'));
    await store.close();

    const db = await openRawDb(path);
    db.prepare(`UPDATE governance_integrity SET aggregate_digest = ? WHERE evaluation_id = ?`).run('sha256:' + 'f'.repeat(64), first.evaluationId);
    db.close();

    const reopened = await createSqliteGovernanceStore(path);
    const firstVerification = await reopened.verify({ system: true }, first.evaluationId);
    assert.equal(firstVerification.valid, false);
    assert.ok(firstVerification.failures.some((failure) => failure.check === 'aggregateDigest'));

    const secondVerification = await reopened.verify({ system: true }, second.evaluationId);
    assert.equal(secondVerification.valid, false, 'the successor must notice its previous-digest no longer matches the (rewritten) predecessor');
    assert.ok(secondVerification.failures.some((failure) => failure.check === 'previousDigest'));
    await reopened.close();
  });

  it('reports corrupted JSON as a structured corruption, never as silent partial data', async () => {
    const path = join(workDir, 'corrupt-json.sqlite');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-cj', 'dec-cj'));
    await store.close();

    const db = await openRawDb(path);
    db.prepare(`UPDATE governance_evaluations SET result_payload_json = 'not json{' WHERE evaluation_id = ?`).run(appended.evaluationId);
    db.close();

    const reopened = await createSqliteGovernanceStore(path);
    const loaded = await reopened.reconstruct({ system: true }, appended.evaluationId);
    assert.equal(loaded.status, 'corrupted');
    assert.ok(loaded.integrityFailures.length > 0);
    await assert.rejects(reopened.getByEvaluationId({ system: true }, appended.evaluationId), (error: unknown) => error instanceof GovernanceStoreError && error.code === 'GOVERNANCE_RECORD_CORRUPTED');
    await reopened.close();
  });

  it('reports a missing integrity row as an incomplete aggregate', async () => {
    const path = join(workDir, 'missing-integrity.sqlite');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-mi', 'dec-mi'));
    await store.close();

    const db = await openRawDb(path);
    db.prepare(`DELETE FROM governance_integrity WHERE evaluation_id = ?`).run(appended.evaluationId);
    db.close();

    const reopened = await createSqliteGovernanceStore(path);
    const loaded = await reopened.reconstruct({ system: true }, appended.evaluationId);
    assert.equal(loaded.status, 'incomplete');
    assert.deepEqual(loaded.missingComponents, ['integrity']);
    await reopened.close();
  });
});

describe('Governance Store tamper detection (in-memory, via the test-only corruption hook)', () => {
  it('detects a mutated stored aggregate exactly like the durable provider', async () => {
    const store = createInMemoryGovernanceStore();
    const appended = await store.appendEvaluation(buildInput('req-mem', 'dec-mem'));
    corruptInMemoryRecordForTests(store, appended.evaluationId, (record) => ({
      ...record,
      evaluation: { ...record.evaluation, status: 'denied' },
    }));
    const verification = await store.verify({ system: true }, appended.evaluationId);
    assert.equal(verification.valid, false);
    assert.ok(verification.failures.some((failure) => failure.check === 'evaluationDigest'));
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// PR-002 → v1 migration
// ---------------------------------------------------------------------------

const LEGACY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS GovernanceRequests (
    request_id       TEXT PRIMARY KEY,
    correlation_id   TEXT,
    actor_id         TEXT NOT NULL,
    action_type      TEXT NOT NULL,
    resource_scope   TEXT NOT NULL,
    organization_id  TEXT,
    requested_at     TEXT NOT NULL,
    received_at      TEXT NOT NULL,
    request_payload  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS GovernanceEvaluations (
    decision_id      TEXT PRIMARY KEY,
    request_id       TEXT NOT NULL REFERENCES GovernanceRequests(request_id),
    status           TEXT NOT NULL,
    reason_codes     TEXT NOT NULL,
    summary          TEXT NOT NULL,
    kernel_version   TEXT NOT NULL,
    evaluated_at     TEXT NOT NULL,
    correlation_id   TEXT
  );
  CREATE TABLE IF NOT EXISTS GovernanceTraces (
    decision_id      TEXT PRIMARY KEY REFERENCES GovernanceEvaluations(decision_id),
    steps_json       TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS RuntimeEvents (
    event_id         TEXT PRIMARY KEY,
    event_type       TEXT NOT NULL,
    request_id       TEXT NOT NULL,
    decision_id      TEXT,
    correlation_id   TEXT,
    occurred_at      TEXT NOT NULL,
    payload          TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS RuntimeVersions (
    boot_id          TEXT PRIMARY KEY,
    runtime_version  TEXT NOT NULL,
    kernel_version   TEXT NOT NULL,
    recorded_at      TEXT NOT NULL
  );
`;

async function seedLegacyDatabase(path: string): Promise<void> {
  const db = await openRawDb(path);
  db.exec(LEGACY_SCHEMA);
  const legacyRequest = {
    requestId: 'legacy-req-1',
    actor: { id: 'legacy-actor', trustDomainId: 'td-legacy' },
    action: { type: 'legacy_action', resourceScope: 'legacy:scope' },
    organization: { id: 'org-legacy' },
    requestedAt: '2025-06-01T00:00:00.000Z',
  };
  db.prepare(`INSERT INTO GovernanceRequests VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'legacy-req-1', 'legacy-corr-1', 'legacy-actor', 'legacy_action', 'legacy:scope', 'org-legacy', '2025-06-01T00:00:00.000Z', '2025-06-01T00:00:00.100Z', JSON.stringify(legacyRequest),
  );
  db.prepare(`INSERT INTO GovernanceEvaluations VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'legacy-dec-1', 'legacy-req-1', 'denied', JSON.stringify(['ACTOR_NOT_RECOGNIZED']), 'Denied.', '1.0.0', '2025-06-01T00:00:00.200Z', 'legacy-corr-1',
  );
  db.prepare(`INSERT INTO GovernanceTraces VALUES (?, ?)`).run(
    'legacy-dec-1', JSON.stringify({ steps: [{ sequence: 1, operator: 'recognition', status: 'failed', reasonCodes: ['ACTOR_NOT_RECOGNIZED'] }], decisionId: 'legacy-dec-1', kernelVersion: '1.0.0' }),
  );
  db.prepare(`INSERT INTO RuntimeEvents VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'legacy-evt-1', 'GovernanceEvaluationDenied', 'legacy-req-1', 'legacy-dec-1', 'legacy-corr-1', '2025-06-01T00:00:00.200Z', JSON.stringify({ status: 'denied' }),
  );
  db.close();
}

describe('Governance Store migration from the PR-002 schema', () => {
  it('migrates legacy rows into v1 aggregates, marked and reconstructable, without touching the originals', async () => {
    const path = join(workDir, 'migrate.sqlite');
    await seedLegacyDatabase(path);

    const store = await createSqliteGovernanceStore(path);
    const record = await store.getByRequestId({ system: true }, 'legacy-req-1');
    assert.ok(record, 'the legacy decision must be reachable through the v1 read model');
    assert.equal(record.evaluation.decisionId, 'legacy-dec-1');
    assert.equal(record.evaluation.status, 'denied');
    assert.deepEqual(record.evaluation.reasonCodes, ['ACTOR_NOT_RECOGNIZED']);
    assert.equal(record.metadata.migrationSource, 'pr-002-governance-store');
    assert.equal(record.metadata.lifecycleState, 'unrecorded', 'PR-002 never stored lifecycle state; migration must not invent it');
    assert.equal(record.trace.length, 1);
    assert.equal(record.trace[0]?.operator, 'recognition');

    const verification = await store.verify({ system: true }, record.evaluation.evaluationId);
    assert.equal(verification.valid, true, 'migrated aggregates carry valid integrity computed at migration time');

    const health = await store.health();
    assert.equal(health.migrationState, 'migrated-from-pr-002');

    const legacyEvents = await store.listEnterpriseEvents({ requestId: 'legacy-req-1' });
    assert.ok(legacyEvents.some((event) => event.eventId === 'legacy-evt-1'), 'the legacy event ledger is preserved');
    await store.close();

    // Non-destructive: the PR-002 tables still hold their original rows.
    const db = await openRawDb(path);
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM GovernanceRequests`).get() as { n: number }).n, 1);
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM GovernanceEvaluations`).get() as { n: number }).n, 1);
    assert.equal((db.prepare(`SELECT request_payload FROM GovernanceRequests WHERE request_id = 'legacy-req-1'`).get() as { request_payload: string }).request_payload.includes('legacy-actor'), true);
    db.close();
  });

  it('is idempotent: reopening the migrated database migrates nothing twice', async () => {
    const path = join(workDir, 'migrate-idempotent.sqlite');
    await seedLegacyDatabase(path);

    const first = await createSqliteGovernanceStore(path);
    await first.close();
    const second = await createSqliteGovernanceStore(path);
    const page = await second.query({ system: true }, {});
    assert.equal(page.records.length, 1, 'exactly one migrated aggregate regardless of how many times the store opens');
    await second.close();
  });

  it('keeps migrated decisions idempotency-safe: replaying the same legacy requestId with the same payload replays, a different payload conflicts', async () => {
    const path = join(workDir, 'migrate-idempotency.sqlite');
    await seedLegacyDatabase(path);
    const store = await createSqliteGovernanceStore(path);

    const migrated = await store.getByRequestId({ system: true }, 'legacy-req-1');
    assert.ok(migrated);
    const differentPayload = buildInput('legacy-req-1', 'dec-new');
    await assert.rejects(store.appendEvaluation(differentPayload), (error: unknown) => error instanceof GovernanceStoreError && error.code === 'GOVERNANCE_IDEMPOTENCY_CONFLICT');
    await store.close();
  });

  it('initializes a completely fresh database with migrationState "fresh"', async () => {
    const store = await createSqliteGovernanceStore(join(workDir, 'fresh.sqlite'));
    const health = await store.health();
    assert.equal(health.migrationState, 'fresh');
    assert.equal(health.schemaVersion, 'aoc.governance-store.schema.v1');
    await store.close();
  });
});
