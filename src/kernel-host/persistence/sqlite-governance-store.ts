import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';

import type {
  GovernanceEvaluationRecord,
  GovernanceRequestRecord,
  GovernanceStore,
  GovernanceTraceRecord,
  PersistEvaluationInput,
  PersistEvaluationResult,
  RuntimeEventRecord,
  RuntimeVersionRecord,
} from './governance-store.js';
import { isSameRequestPayload, toGovernanceEvaluationRecord, toGovernanceRequestRecord, toGovernanceTraceRecord } from './record-mappers.js';

/**
 * Durable `GovernanceStore` backed by SQLite (`better-sqlite3`, the same
 * driver `apps/agent-passport-web` already uses -- no ORM, hand-written SQL,
 * consistent with the only real-database precedent in this repository).
 * `better-sqlite3` is loaded lazily so importing this module never forces
 * the dependency onto a consumer that only ever uses the in-memory store.
 *
 * Five tables, matching the mission's suggested schema exactly, kept
 * intentionally denormalized (request payload and trace stored as JSON
 * blobs) -- PR-003 is where this becomes a real Governance Store with
 * proper normalization, replay, and Evidence Bundle support.
 */
export async function createSqliteGovernanceStore(dbPath: string): Promise<GovernanceStore> {
  const { default: Database } = await import('better-sqlite3');

  const path = dbPath === ':memory:' ? ':memory:' : resolveOnDisk(dbPath);
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);

  const insertRequest = db.prepare(
    `INSERT INTO GovernanceRequests (request_id, correlation_id, actor_id, action_type, resource_scope, organization_id, requested_at, received_at, request_payload)
     VALUES (@requestId, @correlationId, @actorId, @actionType, @resourceScope, @organizationId, @requestedAt, @receivedAt, @requestPayload)`,
  );
  const selectRequestById = db.prepare(`SELECT * FROM GovernanceRequests WHERE request_id = ?`);
  const insertEvaluation = db.prepare(
    `INSERT INTO GovernanceEvaluations (decision_id, request_id, status, reason_codes, summary, kernel_version, evaluated_at, correlation_id)
     VALUES (@decisionId, @requestId, @status, @reasonCodes, @summary, @kernelVersion, @evaluatedAt, @correlationId)`,
  );
  const selectEvaluationByRequestId = db.prepare(`SELECT * FROM GovernanceEvaluations WHERE request_id = ?`);
  const selectEvaluationByDecisionId = db.prepare(`SELECT * FROM GovernanceEvaluations WHERE decision_id = ?`);
  const insertTrace = db.prepare(`INSERT INTO GovernanceTraces (decision_id, steps_json) VALUES (@decisionId, @stepsJson)`);
  const selectTraceByDecisionId = db.prepare(`SELECT * FROM GovernanceTraces WHERE decision_id = ?`);
  const insertEvent = db.prepare(
    `INSERT INTO RuntimeEvents (event_id, event_type, request_id, decision_id, correlation_id, occurred_at, payload)
     VALUES (@eventId, @eventType, @requestId, @decisionId, @correlationId, @occurredAt, @payload)`,
  );
  const insertVersion = db.prepare(
    `INSERT INTO RuntimeVersions (boot_id, runtime_version, kernel_version, recorded_at) VALUES (@bootId, @runtimeVersion, @kernelVersion, @recordedAt)`,
  );
  const selectLatestVersion = db.prepare(`SELECT * FROM RuntimeVersions ORDER BY recorded_at DESC, rowid DESC LIMIT 1`);

  const persistEvaluationTxn = db.transaction((input: PersistEvaluationInput): PersistEvaluationResult => {
    const { request, result, receivedAt } = input;
    const existingRequestRow = selectRequestById.get(request.requestId) as SqliteRequestRow | undefined;

    if (existingRequestRow !== undefined) {
      const existingRequestPayload = JSON.parse(existingRequestRow.request_payload) as GovernanceRequestRecord['requestPayload'];
      const existingEvaluationRow = selectEvaluationByRequestId.get(request.requestId) as SqliteEvaluationRow | undefined;
      if (existingEvaluationRow === undefined) {
        throw new Error(`GovernanceRequests row for ${request.requestId} has no matching GovernanceEvaluations row -- persistence invariant violated.`);
      }
      const existingEvaluation = rowToEvaluationRecord(existingEvaluationRow);
      if (!isSameRequestPayload(existingRequestPayload, request)) {
        return { outcome: 'conflict', evaluation: existingEvaluation };
      }
      return { outcome: 'idempotent_replay', evaluation: existingEvaluation };
    }

    const requestRecord = toGovernanceRequestRecord(request, receivedAt);
    const evaluationRecord = toGovernanceEvaluationRecord(result);
    const traceRecord = toGovernanceTraceRecord(result);

    insertRequest.run({
      requestId: requestRecord.requestId,
      correlationId: requestRecord.correlationId ?? null,
      actorId: requestRecord.actorId,
      actionType: requestRecord.actionType,
      resourceScope: requestRecord.resourceScope,
      organizationId: requestRecord.organizationId ?? null,
      requestedAt: requestRecord.requestedAt,
      receivedAt: requestRecord.receivedAt,
      requestPayload: JSON.stringify(requestRecord.requestPayload),
    });
    insertEvaluation.run({
      decisionId: evaluationRecord.decisionId,
      requestId: evaluationRecord.requestId,
      status: evaluationRecord.status,
      reasonCodes: JSON.stringify(evaluationRecord.reasonCodes),
      summary: evaluationRecord.summary,
      kernelVersion: evaluationRecord.kernelVersion,
      evaluatedAt: evaluationRecord.evaluatedAt,
      correlationId: evaluationRecord.correlationId ?? null,
    });
    insertTrace.run({ decisionId: traceRecord.decisionId, stepsJson: JSON.stringify(traceRecord.trace) });

    return { outcome: 'stored', evaluation: evaluationRecord };
  });

  return {
    providerKind: 'sqlite',

    async persistEvaluation(input) {
      return persistEvaluationTxn(input);
    },

    async getRequestById(requestId) {
      const row = selectRequestById.get(requestId) as SqliteRequestRow | undefined;
      return row === undefined ? undefined : rowToRequestRecord(row);
    },
    async getEvaluationByRequestId(requestId) {
      const row = selectEvaluationByRequestId.get(requestId) as SqliteEvaluationRow | undefined;
      return row === undefined ? undefined : rowToEvaluationRecord(row);
    },
    async getEvaluationByDecisionId(decisionId) {
      const row = selectEvaluationByDecisionId.get(decisionId) as SqliteEvaluationRow | undefined;
      return row === undefined ? undefined : rowToEvaluationRecord(row);
    },
    async getTraceByDecisionId(decisionId) {
      const row = selectTraceByDecisionId.get(decisionId) as SqliteTraceRow | undefined;
      return row === undefined ? undefined : { decisionId: row.decision_id, trace: JSON.parse(row.steps_json) as GovernanceTraceRecord['trace'] };
    },

    async appendRuntimeEvent(record: RuntimeEventRecord) {
      insertEvent.run({
        eventId: record.eventId,
        eventType: record.eventType,
        requestId: record.requestId,
        decisionId: record.decisionId ?? null,
        correlationId: record.correlationId ?? null,
        occurredAt: record.occurredAt,
        payload: JSON.stringify(record.payload),
      });
    },
    async listRuntimeEvents(filter) {
      const rows = (
        filter?.requestId !== undefined
          ? db.prepare(`SELECT * FROM RuntimeEvents WHERE request_id = ?`).all(filter.requestId)
          : filter?.correlationId !== undefined
            ? db.prepare(`SELECT * FROM RuntimeEvents WHERE correlation_id = ?`).all(filter.correlationId)
            : db.prepare(`SELECT * FROM RuntimeEvents`).all()
      ) as SqliteEventRow[];
      return rows.map(rowToEventRecord);
    },

    async recordRuntimeVersion(record: RuntimeVersionRecord) {
      insertVersion.run(record);
    },
    async getLatestRuntimeVersion() {
      const row = selectLatestVersion.get() as SqliteVersionRow | undefined;
      return row === undefined
        ? undefined
        : { bootId: row.boot_id, runtimeVersion: row.runtime_version, kernelVersion: row.kernel_version, recordedAt: row.recorded_at };
    },

    async checkConnectivity() {
      try {
        db.prepare('SELECT 1').get();
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      db.close();
    },
  };
}

function resolveOnDisk(dbPath: string): string {
  const absPath = resolve(dbPath);
  const dir = dirname(absPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return absPath;
}

function initSchema(db: BetterSqlite3.Database): void {
  db.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_governance_requests_correlation_id ON GovernanceRequests(correlation_id);

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

    CREATE INDEX IF NOT EXISTS idx_governance_evaluations_request_id ON GovernanceEvaluations(request_id);
    CREATE INDEX IF NOT EXISTS idx_governance_evaluations_correlation_id ON GovernanceEvaluations(correlation_id);

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

    CREATE INDEX IF NOT EXISTS idx_runtime_events_request_id ON RuntimeEvents(request_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_events_correlation_id ON RuntimeEvents(correlation_id);

    CREATE TABLE IF NOT EXISTS RuntimeVersions (
      boot_id          TEXT PRIMARY KEY,
      runtime_version  TEXT NOT NULL,
      kernel_version   TEXT NOT NULL,
      recorded_at      TEXT NOT NULL
    );
  `);
}

interface SqliteRequestRow {
  readonly request_id: string;
  readonly correlation_id: string | null;
  readonly actor_id: string;
  readonly action_type: string;
  readonly resource_scope: string;
  readonly organization_id: string | null;
  readonly requested_at: string;
  readonly received_at: string;
  readonly request_payload: string;
}

interface SqliteEvaluationRow {
  readonly decision_id: string;
  readonly request_id: string;
  readonly status: string;
  readonly reason_codes: string;
  readonly summary: string;
  readonly kernel_version: string;
  readonly evaluated_at: string;
  readonly correlation_id: string | null;
}

interface SqliteTraceRow {
  readonly decision_id: string;
  readonly steps_json: string;
}

interface SqliteEventRow {
  readonly event_id: string;
  readonly event_type: string;
  readonly request_id: string;
  readonly decision_id: string | null;
  readonly correlation_id: string | null;
  readonly occurred_at: string;
  readonly payload: string;
}

interface SqliteVersionRow {
  readonly boot_id: string;
  readonly runtime_version: string;
  readonly kernel_version: string;
  readonly recorded_at: string;
}

function rowToRequestRecord(row: SqliteRequestRow): GovernanceRequestRecord {
  return {
    requestId: row.request_id,
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
    actorId: row.actor_id,
    actionType: row.action_type,
    resourceScope: row.resource_scope,
    ...(row.organization_id !== null ? { organizationId: row.organization_id } : {}),
    requestedAt: row.requested_at,
    receivedAt: row.received_at,
    requestPayload: JSON.parse(row.request_payload) as GovernanceRequestRecord['requestPayload'],
  };
}

function rowToEvaluationRecord(row: SqliteEvaluationRow): GovernanceEvaluationRecord {
  return {
    decisionId: row.decision_id,
    requestId: row.request_id,
    status: row.status as GovernanceEvaluationRecord['status'],
    reasonCodes: JSON.parse(row.reason_codes) as readonly string[],
    summary: row.summary,
    kernelVersion: row.kernel_version,
    evaluatedAt: row.evaluated_at,
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
  };
}

function rowToEventRecord(row: SqliteEventRow): RuntimeEventRecord {
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    requestId: row.request_id,
    ...(row.decision_id !== null ? { decisionId: row.decision_id } : {}),
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload) as Readonly<Record<string, unknown>>,
  };
}
