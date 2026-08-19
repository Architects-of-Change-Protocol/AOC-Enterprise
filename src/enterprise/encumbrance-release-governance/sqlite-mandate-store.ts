import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { EncumbranceReleaseGovernanceError } from './errors.js';
import { ENCUMBRANCE_RELEASE_MANDATE_STORE_SCHEMA_VERSION } from './in-memory-mandate-store.js';
import {
  canAccessEncumbranceReleaseOrganization,
  requireEncumbranceReleaseAccessToOrganization,
  requireEncumbranceReleaseTenantScope,
  requireStrictUtcEncumbranceReleaseTimestamp,
  type EncumbranceReleaseMandateStore,
} from './mandate-store.js';
import type {
  EncumbranceReleaseExecutionOutcomeKind,
  EncumbranceReleaseExecutionRecord,
  EncumbranceReleaseGovernanceContext,
  EncumbranceReleaseMandateRecord,
  EncumbranceReleaseMandateRevocationRecord,
  EncumbranceReleaseMandateStatus,
  EncumbranceReleaseMandateStoreHealth,
  EncumbranceReleaseRevokeOutcome,
  IssueEncumbranceReleaseMandateInput,
  RecordEncumbranceReleaseExecutionInput,
  RevokeEncumbranceReleaseMandateInput,
} from './contracts.js';

export interface CreateSqliteEncumbranceReleaseMandateStoreOptions {
  readonly now?: () => string;
  readonly busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Schema (`aoc.encumbrance-release-mandate-store.schema.v1`). One current-state
// table, one append-only evidence table and one revocation table, never
// event-sourced — the same shape
// `../collateralization-governance/sqlite-mandate-store.ts` and
// `../license-governance/sqlite-mandate-store.ts` persist.
//
// Durable invariants pushed down to the database, so they hold even against a
// second writer this process never sees. Each one is load-bearing rather than
// hygienic:
//
//  - `request_ref UNIQUE` -> one release request authorizes at most one
//    mandate; replaying a request can never accumulate authorization.
//  - a partial UNIQUE index on `(organization_id, encumbrance_ref)` where
//    `status = 'active'` -> at most one *live* release authorization per
//    constraint. Two governance chains each committed to discharging one
//    constraint is a fact a caller must see, not a race for whichever executes
//    first. Revoked and spent mandates free the slot, which is why the index is
//    partial rather than total.
//  - a partial UNIQUE index on `mandate_id` where
//    `outcome = 'confirmed_success'` -> at most one confirmed discharge per
//    mandate. A release mandate authorizes exactly one release; a second
//    success against it would be a discharge nothing authorized.
//  - `execution_id PRIMARY KEY` -> one attempt is recorded at most once.
//  - `(mandate_id, sequence) UNIQUE` -> a stable, restart-stable append order
//    independent of insertion timing or rowid reuse.
//  - `CHECK (outcome <> 'confirmed_success' OR confirmed_at IS NOT NULL)` -> a
//    confirmed release always says when the executor confirmed it, so evidence
//    that could terminalize a constraint can never be dateless.
//
// There is deliberately **no** digest column here, in contrast with
// `governed_authority_encumbrances.encumbrance_digest`. This store holds
// authorization and evidence, not authority accounting: tampering with a row
// here cannot free capacity on its own, because terminalization reads the
// authority store's own tamper-evident record and refuses a basis it will not
// accept. Adding a second, weaker integrity scheme beside the one that actually
// guards capacity would suggest a protection this layer does not provide.
// ---------------------------------------------------------------------------
const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS encumbrance_release_mandate_store_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL,
    migration_state TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS encumbrance_release_mandates (
    mandate_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    status TEXT NOT NULL,
    resource_kind TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    resource_tenant_id TEXT,
    encumbrance_ref TEXT NOT NULL,
    request_ref TEXT NOT NULL UNIQUE,
    requested_by TEXT NOT NULL,
    decision_ref TEXT NOT NULL,
    evaluation_ref TEXT,
    effective_from TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    issuer_ref TEXT,
    approval_refs_json TEXT,
    obligation_refs_json TEXT,
    evidence_refs_json TEXT,
    audit_refs_json TEXT,
    execution_ref TEXT,
    created_at TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    CHECK (status IN ('active', 'executed', 'revoked')),
    CHECK (status <> 'executed' OR execution_ref IS NOT NULL),
    CHECK (status <> 'active' OR execution_ref IS NULL)
  );
  CREATE INDEX IF NOT EXISTS idx_encumbrance_release_mandates_org ON encumbrance_release_mandates(organization_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_encumbrance_release_mandates_live
    ON encumbrance_release_mandates(organization_id, encumbrance_ref)
    WHERE status = 'active';

  CREATE TABLE IF NOT EXISTS encumbrance_release_executions (
    execution_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL REFERENCES encumbrance_release_mandates(mandate_id),
    organization_id TEXT NOT NULL,
    encumbrance_ref TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    provider_system TEXT NOT NULL,
    attempted_at TEXT NOT NULL,
    confirmed_at TEXT,
    provider_release_reference TEXT,
    failure_code TEXT,
    failure_reason TEXT,
    correlation_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    UNIQUE (mandate_id, sequence),
    CHECK (outcome IN ('confirmed_success', 'confirmed_failure', 'indeterminate')),
    CHECK (outcome <> 'confirmed_success' OR confirmed_at IS NOT NULL)
  );
  CREATE INDEX IF NOT EXISTS idx_encumbrance_release_executions_mandate ON encumbrance_release_executions(mandate_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_encumbrance_release_executions_confirmed
    ON encumbrance_release_executions(mandate_id)
    WHERE outcome = 'confirmed_success';

  CREATE TABLE IF NOT EXISTS encumbrance_release_mandate_revocations (
    revocation_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL UNIQUE REFERENCES encumbrance_release_mandates(mandate_id),
    organization_id TEXT NOT NULL,
    revoked_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    issuer_ref TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    description TEXT,
    evidence_refs_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_encumbrance_release_mandate_revocations_org ON encumbrance_release_mandate_revocations(organization_id);
`;

interface MandateRow {
  readonly mandate_id: string;
  readonly organization_id: string;
  readonly status: string;
  readonly resource_kind: string;
  readonly resource_id: string;
  readonly resource_tenant_id: string | null;
  readonly encumbrance_ref: string;
  readonly request_ref: string;
  readonly requested_by: string;
  readonly decision_ref: string;
  readonly evaluation_ref: string | null;
  readonly effective_from: string;
  readonly expires_at: string;
  readonly correlation_id: string;
  readonly issuer_ref: string | null;
  readonly approval_refs_json: string | null;
  readonly obligation_refs_json: string | null;
  readonly evidence_refs_json: string | null;
  readonly audit_refs_json: string | null;
  readonly execution_ref: string | null;
  readonly created_at: string;
}

interface ExecutionRow {
  readonly execution_id: string;
  readonly mandate_id: string;
  readonly organization_id: string;
  readonly encumbrance_ref: string;
  readonly sequence: number;
  readonly outcome: string;
  readonly provider_system: string;
  readonly attempted_at: string;
  readonly confirmed_at: string | null;
  readonly provider_release_reference: string | null;
  readonly failure_code: string | null;
  readonly failure_reason: string | null;
  readonly correlation_id: string;
  readonly recorded_at: string;
}

interface RevocationRow {
  readonly revocation_id: string;
  readonly mandate_id: string;
  readonly organization_id: string;
  readonly revoked_at: string;
  readonly reason: string;
  readonly issuer_ref: string;
  readonly correlation_id: string;
  readonly description: string | null;
  readonly evidence_refs_json: string | null;
}

function corrupted(message: string, details?: Readonly<Record<string, unknown>>): EncumbranceReleaseGovernanceError {
  return new EncumbranceReleaseGovernanceError('ENCUMBRANCE_RELEASE_RECORD_CORRUPTED', message, details);
}

function readMandateStatus(value: string, recordId: string): EncumbranceReleaseMandateStatus {
  if (value === 'active' || value === 'executed' || value === 'revoked') return value;
  throw corrupted(`Stored encumbrance release mandate '${recordId}' has an unknown status '${value}'.`, { recordId });
}

function readExecutionOutcome(value: string, recordId: string): EncumbranceReleaseExecutionOutcomeKind {
  if (value === 'confirmed_success' || value === 'confirmed_failure' || value === 'indeterminate') return value;
  throw corrupted(`Stored encumbrance release execution '${recordId}' has an unknown outcome '${value}'.`, { recordId });
}

/** Reads a stored JSON reference array back, refusing anything that is not an array of strings. A malformed column fails the read rather than being coerced into an empty list. */
function readRefs(value: string | null, recordId: string, column: string): readonly string[] | undefined {
  if (value === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw corrupted(`Stored encumbrance release record '${recordId}' has an unreadable '${column}'.`, { recordId, column });
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw corrupted(`Stored encumbrance release record '${recordId}' has a malformed '${column}'.`, { recordId, column });
  }
  return parsed as readonly string[];
}

function rowToMandate(row: MandateRow): EncumbranceReleaseMandateRecord {
  const approvalRefs = readRefs(row.approval_refs_json, row.mandate_id, 'approval_refs_json');
  const obligationRefs = readRefs(row.obligation_refs_json, row.mandate_id, 'obligation_refs_json');
  const evidenceRefs = readRefs(row.evidence_refs_json, row.mandate_id, 'evidence_refs_json');
  const auditRefs = readRefs(row.audit_refs_json, row.mandate_id, 'audit_refs_json');
  return {
    id: row.mandate_id,
    organizationId: row.organization_id,
    status: readMandateStatus(row.status, row.mandate_id),
    resourceKind: row.resource_kind,
    resourceId: row.resource_id,
    encumbranceRef: row.encumbrance_ref,
    requestRef: row.request_ref,
    requestedBy: row.requested_by,
    decisionRef: row.decision_ref,
    effectiveFrom: row.effective_from,
    expiresAt: row.expires_at,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    ...(row.resource_tenant_id !== null ? { resourceTenantId: row.resource_tenant_id } : {}),
    ...(row.evaluation_ref !== null ? { evaluationRef: row.evaluation_ref } : {}),
    ...(row.issuer_ref !== null ? { issuerRef: row.issuer_ref } : {}),
    ...(approvalRefs !== undefined ? { approvalRefs } : {}),
    ...(obligationRefs !== undefined ? { obligationRefs } : {}),
    ...(evidenceRefs !== undefined ? { evidenceRefs } : {}),
    ...(auditRefs !== undefined ? { auditRefs } : {}),
    ...(row.execution_ref !== null ? { executionRef: row.execution_ref } : {}),
  };
}

function rowToExecution(row: ExecutionRow): EncumbranceReleaseExecutionRecord {
  return {
    id: row.execution_id,
    mandateId: row.mandate_id,
    organizationId: row.organization_id,
    encumbranceRef: row.encumbrance_ref,
    outcome: readExecutionOutcome(row.outcome, row.execution_id),
    providerSystem: row.provider_system,
    attemptedAt: row.attempted_at,
    correlationId: row.correlation_id,
    recordedAt: row.recorded_at,
    ...(row.confirmed_at !== null ? { confirmedAt: row.confirmed_at } : {}),
    ...(row.provider_release_reference !== null ? { providerReleaseReference: row.provider_release_reference } : {}),
    ...(row.failure_code !== null ? { failureCode: row.failure_code } : {}),
    ...(row.failure_reason !== null ? { failureReason: row.failure_reason } : {}),
  };
}

function rowToRevocation(row: RevocationRow): EncumbranceReleaseMandateRevocationRecord {
  const evidenceRefs = readRefs(row.evidence_refs_json, row.revocation_id, 'evidence_refs_json');
  return {
    id: row.revocation_id,
    mandateId: row.mandate_id,
    organizationId: row.organization_id,
    revokedAt: row.revoked_at,
    reason: row.reason,
    issuerRef: row.issuer_ref,
    correlationId: row.correlation_id,
    ...(row.description !== null ? { description: row.description } : {}),
    ...(evidenceRefs !== undefined ? { evidenceRefs } : {}),
  };
}

function resolveBusyTimeoutMs(value: number | undefined): number {
  const timeout = value ?? DEFAULT_BUSY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new RangeError(`busyTimeoutMs must be a positive integer, received '${String(value)}'.`);
  }
  return timeout;
}

function resolveOnDisk(dbPath: string): string {
  const absPath = resolve(dbPath);
  const dir = dirname(absPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return absPath;
}

function sqliteErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * SQLite-backed `EncumbranceReleaseMandateStore`.
 *
 * Every operation that touches more than one row runs inside one synchronous
 * `db.transaction(...)`: better-sqlite3 is synchronous, so no other in-process
 * caller can interleave, and the UNIQUE indexes documented on `SCHEMA_V1`
 * serialize cross-process writers too.
 *
 * This store persists an authorization and the executor evidence reported
 * against it. It never releases anything itself, never contacts an external
 * system, and never touches authority accounting — the same boundary the
 * in-memory implementation keeps.
 */
export async function createSqliteEncumbranceReleaseMandateStore(
  dbPath: string,
  options: CreateSqliteEncumbranceReleaseMandateStoreOptions = {},
): Promise<EncumbranceReleaseMandateStore> {
  const { default: Database } = await import('better-sqlite3');

  const now = options.now ?? (() => new Date().toISOString());

  const path = dbPath === ':memory:' ? ':memory:' : resolveOnDisk(dbPath);
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma(`busy_timeout = ${resolveBusyTimeoutMs(options.busyTimeoutMs)}`);

  // Fail closed on a database written by a different schema version, before any
  // DDL runs — never silently reuse or migrate a mismatched store.
  const versionTable = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get('encumbrance_release_mandate_store_versions');
  if (versionTable !== undefined) {
    const existingVersion = db
      .prepare(`SELECT schema_version FROM encumbrance_release_mandate_store_versions ORDER BY id DESC LIMIT 1`)
      .get() as { schema_version: string } | undefined;
    if (existingVersion !== undefined && existingVersion.schema_version !== ENCUMBRANCE_RELEASE_MANDATE_STORE_SCHEMA_VERSION) {
      db.close();
      throw new EncumbranceReleaseGovernanceError(
        'ENCUMBRANCE_RELEASE_STORE_UNAVAILABLE',
        `Encumbrance Release Mandate Store schema version '${existingVersion.schema_version}' is not supported by this runtime (expected '${ENCUMBRANCE_RELEASE_MANDATE_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
      );
    }
  }

  db.exec(SCHEMA_V1);

  const latestVersion = db
    .prepare(`SELECT schema_version FROM encumbrance_release_mandate_store_versions ORDER BY id DESC LIMIT 1`)
    .get() as { schema_version: string } | undefined;
  if (latestVersion === undefined) {
    db.prepare(`INSERT INTO encumbrance_release_mandate_store_versions (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`).run(
      ENCUMBRANCE_RELEASE_MANDATE_STORE_SCHEMA_VERSION,
      now(),
    );
  }

  const insertMandate = db.prepare(`INSERT INTO encumbrance_release_mandates
    (mandate_id, organization_id, status, resource_kind, resource_id, resource_tenant_id, encumbrance_ref, request_ref, requested_by,
     decision_ref, evaluation_ref, effective_from, expires_at, correlation_id, issuer_ref,
     approval_refs_json, obligation_refs_json, evidence_refs_json, audit_refs_json, execution_ref, created_at, schema_version)
    VALUES (@mandateId, @organizationId, 'active', @resourceKind, @resourceId, @resourceTenantId, @encumbranceRef, @requestRef, @requestedBy,
     @decisionRef, @evaluationRef, @effectiveFrom, @expiresAt, @correlationId, @issuerRef,
     @approvalRefsJson, @obligationRefsJson, @evidenceRefsJson, @auditRefsJson, NULL, @createdAt, @schemaVersion)`);
  const selectMandateById = db.prepare(`SELECT * FROM encumbrance_release_mandates WHERE mandate_id = ?`);
  const selectMandateByRequestRef = db.prepare(`SELECT * FROM encumbrance_release_mandates WHERE request_ref = ?`);
  const selectLiveMandateForEncumbrance = db.prepare(
    `SELECT * FROM encumbrance_release_mandates WHERE organization_id = ? AND encumbrance_ref = ? AND status = 'active'`,
  );
  const markMandateExecuted = db.prepare(
    `UPDATE encumbrance_release_mandates SET status = 'executed', execution_ref = @executionRef WHERE mandate_id = @mandateId AND status = 'active'`,
  );
  const markMandateRevoked = db.prepare(
    `UPDATE encumbrance_release_mandates SET status = 'revoked' WHERE mandate_id = @mandateId AND status = 'active'`,
  );

  const insertExecution = db.prepare(`INSERT INTO encumbrance_release_executions
    (execution_id, mandate_id, organization_id, encumbrance_ref, sequence, outcome, provider_system, attempted_at, confirmed_at,
     provider_release_reference, failure_code, failure_reason, correlation_id, recorded_at)
    VALUES (@executionId, @mandateId, @organizationId, @encumbranceRef, @sequence, @outcome, @providerSystem, @attemptedAt, @confirmedAt,
     @providerReleaseReference, @failureCode, @failureReason, @correlationId, @recordedAt)`);
  const selectExecutionsByMandate = db.prepare(`SELECT * FROM encumbrance_release_executions WHERE mandate_id = ? ORDER BY sequence ASC`);
  const selectExecutionById = db.prepare(`SELECT 1 FROM encumbrance_release_executions WHERE execution_id = ?`);
  const selectConfirmedExecution = db.prepare(
    `SELECT * FROM encumbrance_release_executions WHERE mandate_id = ? AND outcome = 'confirmed_success'`,
  );
  const countExecutionsByMandate = db.prepare(`SELECT COUNT(*) AS total FROM encumbrance_release_executions WHERE mandate_id = ?`);

  const insertRevocation = db.prepare(`INSERT INTO encumbrance_release_mandate_revocations
    (revocation_id, mandate_id, organization_id, revoked_at, reason, issuer_ref, correlation_id, description, evidence_refs_json)
    VALUES (@revocationId, @mandateId, @organizationId, @revokedAt, @reason, @issuerRef, @correlationId, @description, @evidenceRefsJson)`);
  const selectRevocationByMandate = db.prepare(`SELECT * FROM encumbrance_release_mandate_revocations WHERE mandate_id = ?`);

  const countMandates = db.prepare(`SELECT COUNT(*) AS total FROM encumbrance_release_mandates`);
  const countActiveMandates = db.prepare(`SELECT COUNT(*) AS total FROM encumbrance_release_mandates WHERE status = 'active'`);
  const countExecutions = db.prepare(`SELECT COUNT(*) AS total FROM encumbrance_release_executions`);

  let closed = false;

  function assertOpen(): void {
    if (closed) {
      throw new EncumbranceReleaseGovernanceError(
        'ENCUMBRANCE_RELEASE_STORE_UNAVAILABLE',
        'The Encumbrance Release Mandate Store has been closed.',
      );
    }
  }

  function loadMandate(mandateId: string): EncumbranceReleaseMandateRecord {
    const row = selectMandateById.get(mandateId) as MandateRow | undefined;
    if (row === undefined) {
      throw new EncumbranceReleaseGovernanceError(
        'ENCUMBRANCE_RELEASE_MANDATE_NOT_FOUND',
        `No encumbrance release mandate for mandateId '${mandateId}'.`,
        { mandateId },
      );
    }
    return rowToMandate(row);
  }

  /** Tenant-scoped read, identical in ordering and error taxonomy to the in-memory store's own `requireVisibleMandate`. */
  function requireVisibleMandate(
    context: EncumbranceReleaseGovernanceContext,
    mandateId: string,
  ): EncumbranceReleaseMandateRecord {
    requireEncumbranceReleaseTenantScope(context);
    const mandate = loadMandate(mandateId);
    if (!canAccessEncumbranceReleaseOrganization(context, mandate.organizationId)) {
      throw new EncumbranceReleaseGovernanceError(
        'ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION',
        `The caller is not authorized to access encumbrance release governance data for organization '${mandate.organizationId}'.`,
      );
    }
    return mandate;
  }

  /**
   * One synchronous commit section: append the attempt's evidence and, for a
   * confirmed success, spend the grant. The mandate update is guarded on
   * `status = 'active'`, so a concurrent revocation or a concurrent second
   * success loses this transaction rather than silently overwriting a status
   * computed from a stale read.
   */
  const commitExecution = db.transaction(
    (execution: EncumbranceReleaseExecutionRecord, sequence: number): EncumbranceReleaseMandateRecord => {
      insertExecution.run({
        executionId: execution.id,
        mandateId: execution.mandateId,
        organizationId: execution.organizationId,
        encumbranceRef: execution.encumbranceRef,
        sequence,
        outcome: execution.outcome,
        providerSystem: execution.providerSystem,
        attemptedAt: execution.attemptedAt,
        confirmedAt: execution.confirmedAt ?? null,
        providerReleaseReference: execution.providerReleaseReference ?? null,
        failureCode: execution.failureCode ?? null,
        failureReason: execution.failureReason ?? null,
        correlationId: execution.correlationId,
        recordedAt: execution.recordedAt,
      });

      if (execution.outcome !== 'confirmed_success') return loadMandate(execution.mandateId);

      const updated = markMandateExecuted.run({ mandateId: execution.mandateId, executionRef: execution.id });
      if (updated.changes !== 1) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
          `Encumbrance release mandate '${execution.mandateId}' was no longer live when its confirmed release was recorded; the attempt is not committed.`,
          { mandateId: execution.mandateId },
        );
      }
      return loadMandate(execution.mandateId);
    },
  );

  const commitRevocation = db.transaction(
    (revocation: EncumbranceReleaseMandateRevocationRecord): EncumbranceReleaseMandateRecord => {
      const updated = markMandateRevoked.run({ mandateId: revocation.mandateId });
      if (updated.changes !== 1) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
          `Encumbrance release mandate '${revocation.mandateId}' is no longer live; only a live authorization can be withdrawn.`,
          { mandateId: revocation.mandateId },
        );
      }
      insertRevocation.run({
        revocationId: revocation.id,
        mandateId: revocation.mandateId,
        organizationId: revocation.organizationId,
        revokedAt: revocation.revokedAt,
        reason: revocation.reason,
        issuerRef: revocation.issuerRef,
        correlationId: revocation.correlationId,
        description: revocation.description ?? null,
        evidenceRefsJson: revocation.evidenceRefs !== undefined ? JSON.stringify(revocation.evidenceRefs) : null,
      });
      return loadMandate(revocation.mandateId);
    },
  );

  return {
    providerKind: 'sqlite',

    async issueMandate(context, input: IssueEncumbranceReleaseMandateInput) {
      assertOpen();
      requireEncumbranceReleaseAccessToOrganization(context, input.organizationId);

      const effectiveFrom = requireStrictUtcEncumbranceReleaseTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcEncumbranceReleaseTimestamp(input.expiresAt, 'expiresAt');
      if (Date.parse(expiresAt) <= Date.parse(effectiveFrom)) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_VALIDATION_ERROR',
          'An encumbrance release mandate must expire after it becomes effective; an authorization with no live window authorizes nothing.',
          { effectiveFrom, expiresAt },
        );
      }

      if ((selectMandateById.get(input.id) as MandateRow | undefined) !== undefined) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_ALREADY_EXISTS',
          `An encumbrance release mandate with id '${input.id}' already exists.`,
          { mandateId: input.id },
        );
      }
      const existingForRequest = selectMandateByRequestRef.get(input.requestRef) as MandateRow | undefined;
      if (existingForRequest !== undefined) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_ALREADY_EXISTS',
          `Encumbrance release request '${input.requestRef}' has already been authorized by mandate '${existingForRequest.mandate_id}'; replaying it must not create additional release authority.`,
          { requestRef: input.requestRef, mandateId: existingForRequest.mandate_id },
        );
      }
      const live = selectLiveMandateForEncumbrance.get(input.organizationId, input.encumbranceRef) as MandateRow | undefined;
      if (live !== undefined) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_ALREADY_ACTIVE',
          `Governed authority encumbrance '${input.encumbranceRef}' already has a live release authorization ('${live.mandate_id}'); revoke it before issuing another.`,
          { encumbranceRef: input.encumbranceRef, mandateId: live.mandate_id },
        );
      }

      try {
        insertMandate.run({
          mandateId: input.id,
          organizationId: input.organizationId,
          resourceKind: input.resourceKind,
          resourceId: input.resourceId,
          resourceTenantId: input.resourceTenantId ?? null,
          encumbranceRef: input.encumbranceRef,
          requestRef: input.requestRef,
          requestedBy: input.requestedBy,
          decisionRef: input.decisionRef,
          evaluationRef: input.evaluationRef ?? null,
          effectiveFrom,
          expiresAt,
          correlationId: input.correlationId,
          issuerRef: input.issuerRef ?? null,
          approvalRefsJson: input.approvalRefs !== undefined ? JSON.stringify(input.approvalRefs) : null,
          obligationRefsJson: input.obligationRefs !== undefined ? JSON.stringify(input.obligationRefs) : null,
          evidenceRefsJson: input.evidenceRefs !== undefined ? JSON.stringify(input.evidenceRefs) : null,
          auditRefsJson: input.auditRefs !== undefined ? JSON.stringify(input.auditRefs) : null,
          createdAt: now(),
          schemaVersion: ENCUMBRANCE_RELEASE_MANDATE_STORE_SCHEMA_VERSION,
        });
      } catch (error) {
        // The durable defence against a writer this process never saw. Losing
        // the race is the same fact as reading the live mandate above, so it
        // surfaces as the same code rather than as a driver error.
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          throw new EncumbranceReleaseGovernanceError(
            'ENCUMBRANCE_RELEASE_MANDATE_ALREADY_ACTIVE',
            `Governed authority encumbrance '${input.encumbranceRef}' already has a live release authorization; only one may stand at a time.`,
            { encumbranceRef: input.encumbranceRef, requestRef: input.requestRef },
          );
        }
        throw error;
      }
      return loadMandate(input.id);
    },

    async getMandate(context, mandateId) {
      assertOpen();
      return requireVisibleMandate(context, mandateId);
    },

    async getMandateByRequestRef(context, requestRef) {
      assertOpen();
      const row = selectMandateByRequestRef.get(requestRef) as MandateRow | undefined;
      if (row === undefined) return null;
      return requireVisibleMandate(context, row.mandate_id);
    },

    async getActiveMandateForEncumbrance(context, organizationId, encumbranceRef) {
      assertOpen();
      requireEncumbranceReleaseAccessToOrganization(context, organizationId);
      const row = selectLiveMandateForEncumbrance.get(organizationId, encumbranceRef) as MandateRow | undefined;
      return row === undefined ? null : rowToMandate(row);
    },

    async recordExecution(context, input: RecordEncumbranceReleaseExecutionInput) {
      assertOpen();
      requireEncumbranceReleaseAccessToOrganization(context, input.organizationId);

      const attemptedAt = requireStrictUtcEncumbranceReleaseTimestamp(input.attemptedAt, 'attemptedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION',
          `Encumbrance release mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }
      if (selectExecutionById.get(input.id) !== undefined) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_EXECUTION_ALREADY_RECORDED',
          `Encumbrance release execution '${input.id}' has already been recorded; replaying it would record the same attempt twice.`,
          { executionId: input.id },
        );
      }
      if (input.encumbranceRef !== mandate.encumbranceRef) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_TARGET_MISMATCH',
          `Encumbrance release mandate '${mandate.id}' authorizes the discharge of '${mandate.encumbranceRef}'; evidence naming '${input.encumbranceRef}' does not belong to it.`,
          { mandateId: mandate.id, mandateEncumbranceRef: mandate.encumbranceRef, evidenceEncumbranceRef: input.encumbranceRef },
        );
      }
      if (input.outcome === 'confirmed_success' && mandate.status !== 'active') {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
          `Encumbrance release mandate '${mandate.id}' is '${mandate.status}'; a confirmed release cannot be recorded against an authorization that is no longer live.`,
          { mandateId: mandate.id, status: mandate.status },
        );
      }

      const sequence = (countExecutionsByMandate.get(mandate.id) as { total: number }).total + 1;
      const execution: EncumbranceReleaseExecutionRecord = {
        id: input.id,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        encumbranceRef: input.encumbranceRef,
        outcome: input.outcome,
        providerSystem: input.providerSystem,
        attemptedAt,
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.confirmedAt !== undefined
          ? { confirmedAt: requireStrictUtcEncumbranceReleaseTimestamp(input.confirmedAt, 'confirmedAt') }
          : {}),
        ...(input.providerReleaseReference !== undefined ? { providerReleaseReference: input.providerReleaseReference } : {}),
        ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
        ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
      };

      try {
        const next = commitExecution(execution, sequence);
        return { mandate: next, execution };
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          throw new EncumbranceReleaseGovernanceError(
            'ENCUMBRANCE_RELEASE_EXECUTION_ALREADY_RECORDED',
            `Encumbrance release mandate '${mandate.id}' already carries a confirmed release; it authorizes exactly one discharge.`,
            { mandateId: mandate.id, executionId: execution.id },
          );
        }
        throw error;
      }
    },

    async listExecutions(context, mandateId) {
      assertOpen();
      const mandate = requireVisibleMandate(context, mandateId);
      return (selectExecutionsByMandate.all(mandate.id) as ExecutionRow[]).map(rowToExecution);
    },

    async getConfirmedExecution(context, mandateId) {
      assertOpen();
      const mandate = requireVisibleMandate(context, mandateId);
      const row = selectConfirmedExecution.get(mandate.id) as ExecutionRow | undefined;
      return row === undefined ? null : rowToExecution(row);
    },

    async revokeMandate(context, input: RevokeEncumbranceReleaseMandateInput): Promise<EncumbranceReleaseRevokeOutcome> {
      assertOpen();
      requireEncumbranceReleaseAccessToOrganization(context, input.organizationId);
      const revokedAt = requireStrictUtcEncumbranceReleaseTimestamp(input.revokedAt, 'revokedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);

      if (mandate.status !== 'active') {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
          `Encumbrance release mandate '${mandate.id}' is '${mandate.status}'; only a live authorization can be withdrawn, and withdrawing a spent one would suggest the discharge could be undone.`,
          { mandateId: mandate.id, status: mandate.status },
        );
      }

      const revocation: EncumbranceReleaseMandateRevocationRecord = {
        id: input.revocationId,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt,
        reason: input.reason,
        issuerRef: input.issuerRef,
        correlationId: input.correlationId,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };
      const next = commitRevocation(revocation);
      return { mandate: next, revocation };
    },

    async getRevocation(context, mandateId) {
      assertOpen();
      const mandate = requireVisibleMandate(context, mandateId);
      const row = selectRevocationByMandate.get(mandate.id) as RevocationRow | undefined;
      return row === undefined ? null : rowToRevocation(row);
    },

    async health(): Promise<EncumbranceReleaseMandateStoreHealth> {
      return {
        providerKind: 'sqlite',
        available: !closed,
        schemaVersion: ENCUMBRANCE_RELEASE_MANDATE_STORE_SCHEMA_VERSION,
        mandateCount: (countMandates.get() as { total: number }).total,
        executionCount: (countExecutions.get() as { total: number }).total,
        activeMandateCount: (countActiveMandates.get() as { total: number }).total,
      };
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
}
