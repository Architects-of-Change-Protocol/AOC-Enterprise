import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  isEnterpriseTransferLifecycleType,
  isEnterpriseTransferableRightType,
  readEnterpriseTransferTerms,
  serializeEnterpriseTransferTerms,
  validateEnterpriseTransferMandate,
} from '@aoc-enterprise/transfer-mandate';
import type {
  EnterpriseTransferScope,
  EnterpriseTransferTerms,
  EnterpriseTransferableRightType,
  SerializedEnterpriseTransferTerms,
} from '@aoc-enterprise/transfer-mandate';

import { computeDigest } from '../governance-store/digest.js';
import { TransferGovernanceError } from './errors.js';
import {
  assertNoTransferScopeEscalation,
  assertTransferExerciseAuthorized,
  assertTransferRevocable,
  nextTransferredScope,
  toCanonicalTransferMandate,
} from './lifecycle.js';
import { TRANSFER_MANDATE_STORE_SCHEMA_VERSION } from './in-memory-mandate-store.js';
import {
  canAccessTransferOrganization,
  requireStrictUtcTransferTimestamp,
  requireTransferAccessToOrganization,
  requireTransferTenantScope,
  type TransferMandateStore,
} from './mandate-store.js';
import type {
  IssueTransferMandateInput,
  RecordTransferExecutionInput,
  RecordTransferLifecycleInput,
  RevokeTransferMandateInput,
  TransferExecutionRecord,
  TransferGovernanceContext,
  TransferLifecycleRecord,
  TransferMandateRecord,
  TransferMandateRevocationRecord,
  TransferMandateStoreHealth,
  TransferRevokeOutcome,
} from './contracts.js';

export interface CreateSqliteTransferMandateStoreOptions {
  readonly now?: () => string;
  readonly busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Schema (`aoc.transfer-mandate-store.schema.v1`). One current-state table plus
// three append-only evidence/lifecycle tables and the version row, never
// event-sourced — this module's mandate lifecycle has exactly one transition,
// `active -> revoked`, the same shape
// `../access-governance/sqlite-access-grant-store.ts` persists for grants and
// `../license-governance/sqlite-mandate-store.ts` persists for license
// mandates.
//
// Durable invariants pushed down to the database, so they hold even against a
// second writer this process never sees:
//  - `request_ref UNIQUE` -> one transfer request authorizes at most one
//    mandate; replaying a request can never accumulate authorization.
//  - `execution_id PRIMARY KEY` -> one movement is recorded at most once; a
//    replayed execution can never be counted twice, which for this action also
//    means it can never double-count the cumulative transferred scope.
//  - `mandate_id UNIQUE` on revocations -> at most one revocation per mandate.
//  - `(mandate_id, sequence) UNIQUE` on both evidence tables -> a stable,
//    restart-stable append order independent of insertion timing or rowid
//    reuse.
//  - `lifecycle_id PRIMARY KEY` + an `execution_id` foreign key -> a reported
//    registration/reversal always references a movement Soberanía actually has
//    evidence of.
//
// `terms_json` is the canonical serialization of `EnterpriseTransferTerms`
// (`serializeEnterpriseTransferTerms`), and `terms_digest` is the Governance
// Store's own canonical digest primitive over it. Terms are the one structured
// column here and precisely what a scope expansion, a transferor substitution,
// a recipient substitution, an executor swap or a constraint relaxation would
// have to alter, so every read recomputes the digest and refuses a mismatch
// rather than reconstructing an authorization from bytes that changed after
// commit. This is integrity detection, not a signature — the same limits
// documented for the Governance Store's digests apply.
//
// Unlike `license_mandates`, this schema **does** carry a cumulative column
// (`transferred_scope_json`), matching
// `collateralization_mandates.committed_scope_json`. The reason is domain, not
// symmetry: a portion of a right that has moved cannot move again, so the
// running total is a durable invariant this action genuinely has and licensing
// genuinely does not.
// ---------------------------------------------------------------------------
const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS transfer_mandate_store_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL,
    migration_state TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transfer_mandates (
    mandate_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    status TEXT NOT NULL,
    asset_kind TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    asset_tenant_id TEXT,
    terms_json TEXT NOT NULL,
    terms_digest TEXT NOT NULL,
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
    transferred_scope_json TEXT,
    execution_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    schema_version TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_transfer_mandates_org ON transfer_mandates(organization_id);

  CREATE TABLE IF NOT EXISTS transfer_executions (
    execution_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL REFERENCES transfer_mandates(mandate_id),
    organization_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    executed_by TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    transferor_ref TEXT NOT NULL,
    transferee_ref TEXT NOT NULL,
    rights_json TEXT NOT NULL,
    transferred_scope_json TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    transfer_effective_at TEXT,
    registry TEXT,
    external_system TEXT,
    external_agreement_reference TEXT,
    external_acceptance_reference TEXT,
    external_consideration_reference TEXT,
    external_registration_reference TEXT,
    external_transaction_reference TEXT,
    evidence_refs_json TEXT,
    recorded_at TEXT NOT NULL,
    UNIQUE (mandate_id, sequence)
  );
  CREATE INDEX IF NOT EXISTS idx_transfer_executions_mandate ON transfer_executions(mandate_id);

  CREATE TABLE IF NOT EXISTS transfer_lifecycle_events (
    lifecycle_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL REFERENCES transfer_mandates(mandate_id),
    execution_id TEXT NOT NULL REFERENCES transfer_executions(execution_id),
    organization_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    reported_by TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    lifecycle_type TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    external_system TEXT,
    external_reference TEXT,
    evidence_refs_json TEXT,
    recorded_at TEXT NOT NULL,
    UNIQUE (mandate_id, sequence)
  );
  CREATE INDEX IF NOT EXISTS idx_transfer_lifecycle_events_mandate ON transfer_lifecycle_events(mandate_id);

  CREATE TABLE IF NOT EXISTS transfer_mandate_revocations (
    revocation_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL UNIQUE REFERENCES transfer_mandates(mandate_id),
    organization_id TEXT NOT NULL,
    revoked_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    issuer_ref TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    description TEXT,
    evidence_refs_json TEXT,
    executions_at_revocation INTEGER NOT NULL,
    transferred_scope_at_revocation_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_transfer_mandate_revocations_org ON transfer_mandate_revocations(organization_id);
`;

interface MandateRow {
  readonly mandate_id: string;
  readonly organization_id: string;
  readonly status: string;
  readonly asset_kind: string;
  readonly asset_id: string;
  readonly asset_tenant_id: string | null;
  readonly terms_json: string;
  readonly terms_digest: string;
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
  readonly transferred_scope_json: string | null;
  readonly execution_count: number;
  readonly created_at: string;
}

interface ExecutionRow {
  readonly execution_id: string;
  readonly mandate_id: string;
  readonly organization_id: string;
  readonly sequence: number;
  readonly executed_by: string;
  readonly executed_at: string;
  readonly transferor_ref: string;
  readonly transferee_ref: string;
  readonly rights_json: string;
  readonly transferred_scope_json: string;
  readonly correlation_id: string;
  readonly transfer_effective_at: string | null;
  readonly registry: string | null;
  readonly external_system: string | null;
  readonly external_agreement_reference: string | null;
  readonly external_acceptance_reference: string | null;
  readonly external_consideration_reference: string | null;
  readonly external_registration_reference: string | null;
  readonly external_transaction_reference: string | null;
  readonly evidence_refs_json: string | null;
  readonly recorded_at: string;
}

interface LifecycleRow {
  readonly lifecycle_id: string;
  readonly mandate_id: string;
  readonly execution_id: string;
  readonly organization_id: string;
  readonly sequence: number;
  readonly reported_by: string;
  readonly occurred_at: string;
  readonly lifecycle_type: string;
  readonly correlation_id: string;
  readonly external_system: string | null;
  readonly external_reference: string | null;
  readonly evidence_refs_json: string | null;
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
  readonly executions_at_revocation: number;
  readonly transferred_scope_at_revocation_json: string | null;
}

function corrupted(message: string, details?: Readonly<Record<string, unknown>>): TransferGovernanceError {
  return new TransferGovernanceError('TRANSFER_RECORD_CORRUPTED', message, details);
}

/** Parses a stored JSON column, failing closed. A row that cannot be read back is never reconstructed into a partial authorization. */
function parseJsonColumn(value: string, column: string, recordId: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw corrupted(`Stored transfer record '${recordId}' has an unreadable '${column}' column; refusing to reconstruct an authorization from it.`, {
      recordId,
      column,
    });
  }
}

function parseStringArrayColumn(value: string | null, column: string, recordId: string): readonly string[] | undefined {
  if (value === null) return undefined;
  const parsed = parseJsonColumn(value, column, recordId);
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string' && entry.length > 0)) {
    throw corrupted(`Stored record '${recordId}' has a malformed '${column}' column; expected an array of non-empty strings.`, { recordId, column });
  }
  return parsed;
}

/** Reads a stored scope column, failing closed on anything that is not one of the two canonical scope shapes. */
function parseScopeColumn(value: string, column: string, recordId: string): EnterpriseTransferScope {
  const parsed = parseJsonColumn(value, column, recordId);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw corrupted(`Stored transfer record '${recordId}' has a malformed '${column}' column.`, { recordId, column });
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.kind === 'proportional' && Number.isSafeInteger(candidate.basisPoints) && (candidate.basisPoints as number) > 0) {
    return { kind: 'proportional', basisPoints: candidate.basisPoints as number };
  }
  if (
    candidate.kind === 'unitized' &&
    Number.isSafeInteger(candidate.units) &&
    (candidate.units as number) > 0 &&
    typeof candidate.unitDenomination === 'string' &&
    candidate.unitDenomination.length > 0
  ) {
    return { kind: 'unitized', units: candidate.units as number, unitDenomination: candidate.unitDenomination };
  }
  throw corrupted(`Stored transfer record '${recordId}' has a malformed '${column}' column.`, { recordId, column });
}

function resolveBusyTimeoutMs(value: number | undefined): number {
  const timeout = value ?? DEFAULT_BUSY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new RangeError(`busyTimeoutMs must be a positive integer, received '${String(value)}'.`);
  }
  return timeout;
}

function tableExists(db: import('better-sqlite3').Database, tableName: string): boolean {
  return db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tableName) !== undefined;
}

function sqliteErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

function resolveOnDisk(dbPath: string): string {
  const absPath = resolve(dbPath);
  const dir = dirname(absPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return absPath;
}

/**
 * Reconstructs `EnterpriseTransferTerms` from its stored canonical form,
 * verifying the canonical digest first. A digest mismatch means the stored
 * bytes changed after commit -- which for this column would be exactly a
 * silent scope, transferor, transferee, executor or constraint change -- so it
 * fails closed rather than handing back a mandate that no longer says what was
 * authorized.
 */
function readTermsColumn(row: MandateRow): EnterpriseTransferTerms {
  const parsed = parseJsonColumn(row.terms_json, 'terms_json', row.mandate_id) as SerializedEnterpriseTransferTerms;
  const terms = readEnterpriseTransferTerms(parsed);
  const digest = computeDigest(serializeEnterpriseTransferTerms(terms));
  if (digest !== row.terms_digest) {
    throw corrupted(
      `Stored transfer mandate '${row.mandate_id}' failed its terms integrity check; the authorized rights, portion, transferor, transferee, bound executor, or constraints changed after commit.`,
      { mandateId: row.mandate_id, expectedDigest: row.terms_digest, actualDigest: digest },
    );
  }
  return terms;
}

function rowToMandate(row: MandateRow): TransferMandateRecord {
  if (row.status !== 'active' && row.status !== 'revoked') {
    throw corrupted(`Stored transfer mandate '${row.mandate_id}' carries an unrecognized status '${row.status}'.`, {
      mandateId: row.mandate_id,
      status: row.status,
    });
  }

  const record: TransferMandateRecord = {
    id: row.mandate_id,
    organizationId: row.organization_id,
    status: row.status,
    assetKind: row.asset_kind,
    assetId: row.asset_id,
    terms: readTermsColumn(row),
    requestRef: row.request_ref,
    requestedBy: row.requested_by,
    decisionRef: row.decision_ref,
    effectiveFrom: row.effective_from,
    expiresAt: row.expires_at,
    correlationId: row.correlation_id,
    executionCount: row.execution_count,
    createdAt: row.created_at,
    ...(row.asset_tenant_id !== null ? { assetTenantId: row.asset_tenant_id } : {}),
    ...(row.evaluation_ref !== null ? { evaluationRef: row.evaluation_ref } : {}),
    ...(row.issuer_ref !== null ? { issuerRef: row.issuer_ref } : {}),
    ...(row.transferred_scope_json !== null
      ? { transferredScope: parseScopeColumn(row.transferred_scope_json, 'transferred_scope_json', row.mandate_id) }
      : {}),
    ...(() => {
      const approvalRefs = parseStringArrayColumn(row.approval_refs_json, 'approval_refs_json', row.mandate_id);
      return approvalRefs === undefined ? {} : { approvalRefs };
    })(),
    ...(() => {
      const obligationRefs = parseStringArrayColumn(row.obligation_refs_json, 'obligation_refs_json', row.mandate_id);
      return obligationRefs === undefined ? {} : { obligationRefs };
    })(),
    ...(() => {
      const evidenceRefs = parseStringArrayColumn(row.evidence_refs_json, 'evidence_refs_json', row.mandate_id);
      return evidenceRefs === undefined ? {} : { evidenceRefs };
    })(),
    ...(() => {
      const auditRefs = parseStringArrayColumn(row.audit_refs_json, 'audit_refs_json', row.mandate_id);
      return auditRefs === undefined ? {} : { auditRefs };
    })(),
  };

  // The frozen contract is the authority on what a mandate may be. A row that
  // cannot project back onto a valid `EnterpriseTransferMandate` is a corrupted
  // record, never a usable authorization.
  const validation = validateEnterpriseTransferMandate(toCanonicalTransferMandate(record));
  if (!validation.valid) {
    throw corrupted(
      `Stored transfer mandate '${row.mandate_id}' does not reconstruct into a valid canonical mandate: ${validation.errors.map((issue) => issue.code).join(', ')}.`,
      { mandateId: row.mandate_id, issues: validation.errors },
    );
  }

  return record;
}

function rowToExecution(row: ExecutionRow): TransferExecutionRecord {
  const rights = parseJsonColumn(row.rights_json, 'rights_json', row.execution_id);
  if (!Array.isArray(rights) || rights.length === 0 || !rights.every((right) => isEnterpriseTransferableRightType(right))) {
    throw corrupted(`Stored transfer execution '${row.execution_id}' has a malformed 'rights_json' column.`, { executionId: row.execution_id });
  }

  const transferredScope = parseScopeColumn(row.transferred_scope_json, 'transferred_scope_json', row.execution_id);

  return {
    id: row.execution_id,
    mandateId: row.mandate_id,
    organizationId: row.organization_id,
    executedBy: row.executed_by,
    executedAt: row.executed_at,
    transferorRef: row.transferor_ref,
    transfereeRef: row.transferee_ref,
    rights: rights as readonly EnterpriseTransferableRightType[],
    transferredScope,
    correlationId: row.correlation_id,
    recordedAt: row.recorded_at,
    ...(row.transfer_effective_at !== null ? { transferEffectiveAt: row.transfer_effective_at } : {}),
    ...(row.registry !== null ? { registry: row.registry } : {}),
    ...(row.external_system !== null ? { externalSystem: row.external_system } : {}),
    ...(row.external_agreement_reference !== null ? { externalAgreementReference: row.external_agreement_reference } : {}),
    ...(row.external_acceptance_reference !== null ? { externalAcceptanceReference: row.external_acceptance_reference } : {}),
    ...(row.external_consideration_reference !== null ? { externalConsiderationReference: row.external_consideration_reference } : {}),
    ...(row.external_registration_reference !== null ? { externalRegistrationReference: row.external_registration_reference } : {}),
    ...(row.external_transaction_reference !== null ? { externalTransactionReference: row.external_transaction_reference } : {}),
    ...(() => {
      const evidenceRefs = parseStringArrayColumn(row.evidence_refs_json, 'evidence_refs_json', row.execution_id);
      return evidenceRefs === undefined ? {} : { evidenceRefs };
    })(),
  };
}

function rowToLifecycle(row: LifecycleRow): TransferLifecycleRecord {
  if (!isEnterpriseTransferLifecycleType(row.lifecycle_type)) {
    throw corrupted(`Stored transfer lifecycle event '${row.lifecycle_id}' carries an unrecognized lifecycle type '${row.lifecycle_type}'.`, {
      lifecycleId: row.lifecycle_id,
      lifecycleType: row.lifecycle_type,
    });
  }

  return {
    id: row.lifecycle_id,
    mandateId: row.mandate_id,
    executionId: row.execution_id,
    organizationId: row.organization_id,
    reportedBy: row.reported_by,
    occurredAt: row.occurred_at,
    lifecycleType: row.lifecycle_type,
    correlationId: row.correlation_id,
    recordedAt: row.recorded_at,
    ...(row.external_system !== null ? { externalSystem: row.external_system } : {}),
    ...(row.external_reference !== null ? { externalReference: row.external_reference } : {}),
    ...(() => {
      const evidenceRefs = parseStringArrayColumn(row.evidence_refs_json, 'evidence_refs_json', row.lifecycle_id);
      return evidenceRefs === undefined ? {} : { evidenceRefs };
    })(),
  };
}

function rowToRevocation(row: RevocationRow): TransferMandateRevocationRecord {
  return {
    id: row.revocation_id,
    mandateId: row.mandate_id,
    organizationId: row.organization_id,
    revokedAt: row.revoked_at,
    reason: row.reason,
    issuerRef: row.issuer_ref,
    correlationId: row.correlation_id,
    executionsAtRevocation: row.executions_at_revocation,
    ...(row.transferred_scope_at_revocation_json !== null
      ? {
          transferredScopeAtRevocation: parseScopeColumn(
            row.transferred_scope_at_revocation_json,
            'transferred_scope_at_revocation_json',
            row.revocation_id,
          ),
        }
      : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(() => {
      const evidenceRefs = parseStringArrayColumn(row.evidence_refs_json, 'evidence_refs_json', row.revocation_id);
      return evidenceRefs === undefined ? {} : { evidenceRefs };
    })(),
  };
}

/**
 * SQLite-backed `TransferMandateStore`, `better-sqlite3` loaded lazily,
 * hand-written SQL — mirrors `createSqliteAccessGrantStore`
 * (`../access-governance/sqlite-access-grant-store.ts`),
 * `createSqliteTokenizationMandateStore`,
 * `createSqliteCollateralizationMandateStore` and
 * `createSqliteLicenseMandateStore` in pragmas, schema-version guarding, and
 * transaction discipline. Every mutating call that touches more than one row
 * runs inside one synchronous `db.transaction(...)`: better-sqlite3 is
 * synchronous, so no other in-process caller can interleave, and the UNIQUE
 * constraints documented on `SCHEMA_V1` serialize cross-process writers too.
 *
 * This store persists the authorization artifact and the evidence reported
 * against it. It never moves a right, updates a registry, prices or settles
 * anything, or contacts an external system — the same boundary the in-memory
 * implementation keeps.
 */
export async function createSqliteTransferMandateStore(
  dbPath: string,
  options: CreateSqliteTransferMandateStoreOptions = {},
): Promise<TransferMandateStore> {
  const { default: Database } = await import('better-sqlite3');

  const now = options.now ?? (() => new Date().toISOString());

  const path = dbPath === ':memory:' ? ':memory:' : resolveOnDisk(dbPath);
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma(`busy_timeout = ${resolveBusyTimeoutMs(options.busyTimeoutMs)}`);

  // Fail closed on a database written by a different schema version, before
  // any DDL runs — never silently reuse or migrate a mismatched store.
  if (tableExists(db, 'transfer_mandate_store_versions')) {
    const existingVersion = db.prepare(`SELECT schema_version FROM transfer_mandate_store_versions ORDER BY id DESC LIMIT 1`).get() as
      | { schema_version: string }
      | undefined;
    if (existingVersion !== undefined && existingVersion.schema_version !== TRANSFER_MANDATE_STORE_SCHEMA_VERSION) {
      db.close();
      throw new TransferGovernanceError(
        'TRANSFER_STORE_UNAVAILABLE',
        `Transfer Mandate Store schema version '${existingVersion.schema_version}' is not supported by this runtime (expected '${TRANSFER_MANDATE_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
      );
    }
  }

  db.exec(SCHEMA_V1);

  const latestVersion = db.prepare(`SELECT schema_version FROM transfer_mandate_store_versions ORDER BY id DESC LIMIT 1`).get() as
    | { schema_version: string }
    | undefined;
  if (latestVersion === undefined) {
    db.prepare(`INSERT INTO transfer_mandate_store_versions (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`).run(
      TRANSFER_MANDATE_STORE_SCHEMA_VERSION,
      now(),
    );
  } else if (latestVersion.schema_version !== TRANSFER_MANDATE_STORE_SCHEMA_VERSION) {
    db.close();
    throw new TransferGovernanceError(
      'TRANSFER_STORE_UNAVAILABLE',
      `Transfer Mandate Store schema version '${latestVersion.schema_version}' is not supported by this runtime (expected '${TRANSFER_MANDATE_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
    );
  }

  const insertMandate = db.prepare(`INSERT INTO transfer_mandates
    (mandate_id, organization_id, status, asset_kind, asset_id, asset_tenant_id, terms_json, terms_digest, request_ref, requested_by, decision_ref, evaluation_ref,
     effective_from, expires_at, correlation_id, issuer_ref, approval_refs_json, obligation_refs_json, evidence_refs_json, audit_refs_json,
     transferred_scope_json, execution_count, created_at, schema_version)
    VALUES (@mandateId, @organizationId, 'active', @assetKind, @assetId, @assetTenantId, @termsJson, @termsDigest, @requestRef, @requestedBy, @decisionRef, @evaluationRef,
     @effectiveFrom, @expiresAt, @correlationId, @issuerRef, @approvalRefsJson, @obligationRefsJson, @evidenceRefsJson, @auditRefsJson,
     NULL, 0, @createdAt, @schemaVersion)`);
  const selectMandateById = db.prepare(`SELECT * FROM transfer_mandates WHERE mandate_id = ?`);
  const selectMandateByRequestRef = db.prepare(`SELECT * FROM transfer_mandates WHERE request_ref = ?`);
  const updateMandateStatus = db.prepare(`UPDATE transfer_mandates SET status = 'revoked' WHERE mandate_id = @mandateId AND status = 'active'`);
  const updateMandateTotals = db.prepare(
    `UPDATE transfer_mandates SET execution_count = @executionCount, transferred_scope_json = @transferredScopeJson
     WHERE mandate_id = @mandateId AND execution_count = @expectedExecutionCount`,
  );

  const insertExecution = db.prepare(`INSERT INTO transfer_executions
    (execution_id, mandate_id, organization_id, sequence, executed_by, executed_at, transferor_ref, transferee_ref, rights_json, transferred_scope_json,
     correlation_id, transfer_effective_at, registry, external_system, external_agreement_reference, external_acceptance_reference,
     external_consideration_reference, external_registration_reference, external_transaction_reference, evidence_refs_json, recorded_at)
    VALUES (@executionId, @mandateId, @organizationId, @sequence, @executedBy, @executedAt, @transferorRef, @transfereeRef, @rightsJson, @transferredScopeJson,
     @correlationId, @transferEffectiveAt, @registry, @externalSystem, @externalAgreementReference, @externalAcceptanceReference,
     @externalConsiderationReference, @externalRegistrationReference, @externalTransactionReference, @evidenceRefsJson, @recordedAt)`);
  const selectExecutionsByMandate = db.prepare(`SELECT * FROM transfer_executions WHERE mandate_id = ? ORDER BY sequence ASC`);
  const selectExecutionById = db.prepare(`SELECT 1 FROM transfer_executions WHERE execution_id = ?`);
  const selectExecutionByIdAndMandate = db.prepare(`SELECT 1 FROM transfer_executions WHERE execution_id = ? AND mandate_id = ?`);

  const insertLifecycle = db.prepare(`INSERT INTO transfer_lifecycle_events
    (lifecycle_id, mandate_id, execution_id, organization_id, sequence, reported_by, occurred_at, lifecycle_type, correlation_id,
     external_system, external_reference, evidence_refs_json, recorded_at)
    VALUES (@lifecycleId, @mandateId, @executionId, @organizationId, @sequence, @reportedBy, @occurredAt, @lifecycleType, @correlationId,
     @externalSystem, @externalReference, @evidenceRefsJson, @recordedAt)`);
  const selectLifecycleByMandate = db.prepare(`SELECT * FROM transfer_lifecycle_events WHERE mandate_id = ? ORDER BY sequence ASC`);
  const selectLifecycleById = db.prepare(`SELECT 1 FROM transfer_lifecycle_events WHERE lifecycle_id = ?`);
  const countLifecycleByMandate = db.prepare(`SELECT COUNT(*) AS count FROM transfer_lifecycle_events WHERE mandate_id = ?`);

  const insertRevocation = db.prepare(`INSERT INTO transfer_mandate_revocations
    (revocation_id, mandate_id, organization_id, revoked_at, reason, issuer_ref, correlation_id, description, evidence_refs_json,
     executions_at_revocation, transferred_scope_at_revocation_json)
    VALUES (@revocationId, @mandateId, @organizationId, @revokedAt, @reason, @issuerRef, @correlationId, @description, @evidenceRefsJson,
     @executionsAtRevocation, @transferredScopeAtRevocationJson)`);
  const selectRevocationByMandate = db.prepare(`SELECT * FROM transfer_mandate_revocations WHERE mandate_id = ?`);

  let closed = false;

  function assertOpen(): void {
    if (closed) {
      throw new TransferGovernanceError('TRANSFER_STORE_UNAVAILABLE', 'The Transfer Mandate Store has been closed.');
    }
  }

  function loadMandate(mandateId: string): TransferMandateRecord {
    const row = selectMandateById.get(mandateId) as MandateRow | undefined;
    if (row === undefined) {
      throw new TransferGovernanceError('TRANSFER_MANDATE_NOT_FOUND', `No transfer mandate for mandateId '${mandateId}'.`);
    }
    return rowToMandate(row);
  }

  /** Tenant-scoped read, identical in ordering and error taxonomy to the in-memory store's own `requireVisibleMandate`. */
  function requireVisibleMandate(context: TransferGovernanceContext, mandateId: string): TransferMandateRecord {
    requireTransferTenantScope(context);
    const mandate = loadMandate(mandateId);
    if (!canAccessTransferOrganization(context, mandate.organizationId)) {
      throw new TransferGovernanceError(
        'TRANSFER_ACCESS_SCOPE_VIOLATION',
        `The caller is not authorized to access transfer governance data for organization '${mandate.organizationId}'.`,
      );
    }
    return mandate;
  }

  /**
   * One synchronous commit section: append the evidence row and advance both
   * the mandate's execution count and its cumulative transferred scope
   * together. The update is guarded on the count this call read, so a
   * concurrent writer that advanced it first loses this transaction rather
   * than silently overwriting a running total computed from a stale read --
   * which for this action would mean recording that less had moved than
   * actually had.
   */
  const commitExecution = db.transaction(
    (execution: TransferExecutionRecord, sequence: number, expectedExecutionCount: number, transferredScope: EnterpriseTransferScope) => {
      insertExecution.run({
        executionId: execution.id,
        mandateId: execution.mandateId,
        organizationId: execution.organizationId,
        sequence,
        executedBy: execution.executedBy,
        executedAt: execution.executedAt,
        transferorRef: execution.transferorRef,
        transfereeRef: execution.transfereeRef,
        rightsJson: JSON.stringify(execution.rights),
        transferredScopeJson: JSON.stringify(execution.transferredScope),
        correlationId: execution.correlationId,
        transferEffectiveAt: execution.transferEffectiveAt ?? null,
        registry: execution.registry ?? null,
        externalSystem: execution.externalSystem ?? null,
        externalAgreementReference: execution.externalAgreementReference ?? null,
        externalAcceptanceReference: execution.externalAcceptanceReference ?? null,
        externalConsiderationReference: execution.externalConsiderationReference ?? null,
        externalRegistrationReference: execution.externalRegistrationReference ?? null,
        externalTransactionReference: execution.externalTransactionReference ?? null,
        evidenceRefsJson: execution.evidenceRefs === undefined ? null : JSON.stringify(execution.evidenceRefs),
        recordedAt: execution.recordedAt,
      });
      const updated = updateMandateTotals.run({
        mandateId: execution.mandateId,
        executionCount: expectedExecutionCount + 1,
        transferredScopeJson: JSON.stringify(transferredScope),
        expectedExecutionCount,
      });
      if (updated.changes !== 1) {
        throw new TransferGovernanceError(
          'TRANSFER_EXECUTION_ALREADY_RECORDED',
          `Transfer mandate '${execution.mandateId}' advanced concurrently while recording execution '${execution.id}'; the transferred total was not computed from a stale read.`,
        );
      }
    },
  );

  /** One synchronous commit section: record the revocation and flip the status together, or neither. */
  const commitRevocation = db.transaction((revocation: TransferMandateRevocationRecord) => {
    insertRevocation.run({
      revocationId: revocation.id,
      mandateId: revocation.mandateId,
      organizationId: revocation.organizationId,
      revokedAt: revocation.revokedAt,
      reason: revocation.reason,
      issuerRef: revocation.issuerRef,
      correlationId: revocation.correlationId,
      description: revocation.description ?? null,
      evidenceRefsJson: revocation.evidenceRefs === undefined ? null : JSON.stringify(revocation.evidenceRefs),
      executionsAtRevocation: revocation.executionsAtRevocation,
      transferredScopeAtRevocationJson:
        revocation.transferredScopeAtRevocation === undefined ? null : JSON.stringify(revocation.transferredScopeAtRevocation),
    });
    updateMandateStatus.run({ mandateId: revocation.mandateId });
  });

  return {
    providerKind: 'sqlite',

    async issueMandate(context: TransferGovernanceContext, input: IssueTransferMandateInput): Promise<TransferMandateRecord> {
      assertOpen();
      requireTransferAccessToOrganization(context, input.organizationId);

      const effectiveFrom = requireStrictUtcTransferTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcTransferTimestamp(input.expiresAt, 'expiresAt');

      // A mandate may narrow the portion that was requested; it may never
      // widen it, and it may never substitute a different transferor,
      // transferee or bound executor.
      assertNoTransferScopeEscalation(input.terms, input.requestedTerms);

      const serializedTerms = serializeEnterpriseTransferTerms(input.terms);
      const candidate: TransferMandateRecord = {
        id: input.id,
        organizationId: input.organizationId,
        status: 'active',
        assetKind: input.assetKind,
        assetId: input.assetId,
        terms: input.terms,
        requestRef: input.requestRef,
        requestedBy: input.requestedBy,
        decisionRef: input.decisionRef,
        effectiveFrom,
        expiresAt,
        correlationId: input.correlationId,
        executionCount: 0,
        createdAt: now(),
        ...(input.assetTenantId !== undefined ? { assetTenantId: input.assetTenantId } : {}),
        ...(input.evaluationRef !== undefined ? { evaluationRef: input.evaluationRef } : {}),
        ...(input.issuerRef !== undefined ? { issuerRef: input.issuerRef } : {}),
        ...(input.approvalRefs !== undefined ? { approvalRefs: [...input.approvalRefs] } : {}),
        ...(input.obligationRefs !== undefined ? { obligationRefs: [...input.obligationRefs] } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
        ...(input.auditRefs !== undefined ? { auditRefs: [...input.auditRefs] } : {}),
      };

      const validation = validateEnterpriseTransferMandate(toCanonicalTransferMandate(candidate));
      if (!validation.valid) {
        throw new TransferGovernanceError(
          'TRANSFER_VALIDATION_ERROR',
          `Transfer mandate candidate failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
          { issues: validation.errors },
        );
      }

      try {
        insertMandate.run({
          mandateId: candidate.id,
          organizationId: candidate.organizationId,
          assetKind: candidate.assetKind,
          assetId: candidate.assetId,
          assetTenantId: candidate.assetTenantId ?? null,
          termsJson: JSON.stringify(serializedTerms),
          termsDigest: computeDigest(serializedTerms),
          requestRef: candidate.requestRef,
          requestedBy: candidate.requestedBy,
          decisionRef: candidate.decisionRef,
          evaluationRef: candidate.evaluationRef ?? null,
          effectiveFrom: candidate.effectiveFrom,
          expiresAt: candidate.expiresAt,
          correlationId: candidate.correlationId,
          issuerRef: candidate.issuerRef ?? null,
          approvalRefsJson: candidate.approvalRefs === undefined ? null : JSON.stringify(candidate.approvalRefs),
          obligationRefsJson: candidate.obligationRefs === undefined ? null : JSON.stringify(candidate.obligationRefs),
          evidenceRefsJson: candidate.evidenceRefs === undefined ? null : JSON.stringify(candidate.evidenceRefs),
          auditRefsJson: candidate.auditRefs === undefined ? null : JSON.stringify(candidate.auditRefs),
          createdAt: candidate.createdAt,
          schemaVersion: TRANSFER_MANDATE_STORE_SCHEMA_VERSION,
        });
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          // Either the mandate id is taken, or -- the invariant that matters --
          // this transfer request already produced a mandate and replaying it
          // must not create a second authorization.
          const existing = selectMandateByRequestRef.get(input.requestRef) as MandateRow | undefined;
          if (existing !== undefined && existing.mandate_id !== input.id) {
            throw new TransferGovernanceError(
              'TRANSFER_MANDATE_ALREADY_EXISTS',
              `Transfer request '${input.requestRef}' has already been authorized by mandate '${existing.mandate_id}'; replaying it must not create additional transfer authority.`,
              { requestRef: input.requestRef, mandateId: existing.mandate_id },
            );
          }
          throw new TransferGovernanceError('TRANSFER_MANDATE_ALREADY_EXISTS', `A transfer mandate with id '${input.id}' already exists.`);
        }
        throw error;
      }

      return loadMandate(candidate.id);
    },

    async getMandate(context: TransferGovernanceContext, mandateId: string): Promise<TransferMandateRecord> {
      assertOpen();
      return requireVisibleMandate(context, mandateId);
    },

    async getMandateByRequestRef(context: TransferGovernanceContext, requestRef: string): Promise<TransferMandateRecord | null> {
      assertOpen();
      const row = selectMandateByRequestRef.get(requestRef) as MandateRow | undefined;
      if (row === undefined) return null;
      return requireVisibleMandate(context, row.mandate_id);
    },

    async recordExecution(context: TransferGovernanceContext, input: RecordTransferExecutionInput) {
      assertOpen();
      requireTransferAccessToOrganization(context, input.organizationId);

      const executedAt = requireStrictUtcTransferTimestamp(input.executedAt, 'executedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new TransferGovernanceError(
          'TRANSFER_ACCESS_SCOPE_VIOLATION',
          `Transfer mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // Replay of an already-recorded execution must never record a second
      // movement. Checked here for a precise error, and enforced independently
      // by `execution_id PRIMARY KEY`.
      if (selectExecutionById.get(input.id) !== undefined) {
        throw new TransferGovernanceError(
          'TRANSFER_EXECUTION_ALREADY_RECORDED',
          `Transfer execution '${input.id}' has already been recorded; replaying it would record the same movement twice.`,
        );
      }

      assertTransferExerciseAuthorized(mandate, {
        executedBy: input.executedBy,
        transferorRef: input.transferorRef,
        transfereeRef: input.transfereeRef,
        rights: input.rights,
        transferredScope: input.transferredScope,
        executedAt,
        ...(input.registry !== undefined ? { registry: input.registry } : {}),
        ...(input.externalAcceptanceReference !== undefined ? { externalAcceptanceReference: input.externalAcceptanceReference } : {}),
        ...(input.externalConsiderationReference !== undefined ? { externalConsiderationReference: input.externalConsiderationReference } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
      });

      const transferredScope = nextTransferredScope(mandate.transferredScope, input.transferredScope);
      if (transferredScope === null) {
        throw new TransferGovernanceError(
          'TRANSFER_EXECUTION_NOT_AUTHORIZED',
          'The reported movement is not commensurable with the portion already transferred under this mandate; refusing to record a total Soberanía could not justify.',
          { refusalCode: 'CUMULATIVE_SCOPE_EXCEEDS_MANDATE', mandateId: mandate.id },
        );
      }

      const execution: TransferExecutionRecord = {
        id: input.id,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executedBy: input.executedBy,
        executedAt,
        transferorRef: input.transferorRef,
        transfereeRef: input.transfereeRef,
        rights: [...input.rights],
        transferredScope: input.transferredScope,
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.transferEffectiveAt !== undefined ? { transferEffectiveAt: input.transferEffectiveAt } : {}),
        ...(input.registry !== undefined ? { registry: input.registry } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
        ...(input.externalAcceptanceReference !== undefined ? { externalAcceptanceReference: input.externalAcceptanceReference } : {}),
        ...(input.externalConsiderationReference !== undefined ? { externalConsiderationReference: input.externalConsiderationReference } : {}),
        ...(input.externalRegistrationReference !== undefined ? { externalRegistrationReference: input.externalRegistrationReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      try {
        commitExecution(execution, mandate.executionCount + 1, mandate.executionCount, transferredScope);
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          throw new TransferGovernanceError(
            'TRANSFER_EXECUTION_ALREADY_RECORDED',
            `Transfer execution '${input.id}' has already been recorded; replaying it would record the same movement twice.`,
          );
        }
        throw error;
      }

      return { mandate: loadMandate(mandate.id), execution };
    },

    async listExecutions(context: TransferGovernanceContext, mandateId: string): Promise<readonly TransferExecutionRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return (selectExecutionsByMandate.all(mandateId) as ExecutionRow[]).map(rowToExecution);
    },

    async recordLifecycleEvent(context: TransferGovernanceContext, input: RecordTransferLifecycleInput): Promise<TransferLifecycleRecord> {
      assertOpen();
      requireTransferAccessToOrganization(context, input.organizationId);

      const occurredAt = requireStrictUtcTransferTimestamp(input.occurredAt, 'occurredAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new TransferGovernanceError(
          'TRANSFER_ACCESS_SCOPE_VIOLATION',
          `Transfer mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // A lifecycle report concerns one specific movement. Reporting one
      // against an execution this mandate never had would be an unanchored
      // claim about the external world.
      if (selectExecutionByIdAndMandate.get(input.executionId, mandate.id) === undefined) {
        throw new TransferGovernanceError(
          'TRANSFER_EXECUTION_NOT_FOUND',
          `No transfer execution '${input.executionId}' recorded under mandate '${mandate.id}'; a lifecycle report must reference a movement Soberanía has evidence of.`,
          { mandateId: mandate.id, executionId: input.executionId },
        );
      }

      if (selectLifecycleById.get(input.id) !== undefined) {
        throw new TransferGovernanceError(
          'TRANSFER_LIFECYCLE_ALREADY_RECORDED',
          `Transfer lifecycle event '${input.id}' has already been recorded; replaying it would duplicate the evidence.`,
        );
      }

      const sequence = ((countLifecycleByMandate.get(mandate.id) as { count: number }).count ?? 0) + 1;
      const event: TransferLifecycleRecord = {
        id: input.id,
        mandateId: mandate.id,
        executionId: input.executionId,
        organizationId: mandate.organizationId,
        reportedBy: input.reportedBy,
        occurredAt,
        lifecycleType: input.lifecycleType,
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalReference !== undefined ? { externalReference: input.externalReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      try {
        // Deliberately a single INSERT and nothing else: a reported outcome is
        // an observation about an external movement, so there is no mandate row
        // to update. In particular `transferred_scope_json` and
        // `execution_count` are untouched even for a reported reversal -- Soberanía
        // cannot verify the movement was undone and must not manufacture fresh
        // transfer capacity over a right already recorded as having left.
        insertLifecycle.run({
          lifecycleId: event.id,
          mandateId: event.mandateId,
          executionId: event.executionId,
          organizationId: event.organizationId,
          sequence,
          reportedBy: event.reportedBy,
          occurredAt: event.occurredAt,
          lifecycleType: event.lifecycleType,
          correlationId: event.correlationId,
          externalSystem: event.externalSystem ?? null,
          externalReference: event.externalReference ?? null,
          evidenceRefsJson: event.evidenceRefs === undefined ? null : JSON.stringify(event.evidenceRefs),
          recordedAt: event.recordedAt,
        });
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          throw new TransferGovernanceError(
            'TRANSFER_LIFECYCLE_ALREADY_RECORDED',
            `Transfer lifecycle event '${input.id}' has already been recorded; replaying it would duplicate the evidence.`,
          );
        }
        throw error;
      }

      return event;
    },

    async listLifecycleEvents(context: TransferGovernanceContext, mandateId: string): Promise<readonly TransferLifecycleRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return (selectLifecycleByMandate.all(mandateId) as LifecycleRow[]).map(rowToLifecycle);
    },

    async revokeMandate(context: TransferGovernanceContext, input: RevokeTransferMandateInput): Promise<TransferRevokeOutcome> {
      assertOpen();
      requireTransferAccessToOrganization(context, input.organizationId);

      const revokedAt = requireStrictUtcTransferTimestamp(input.revokedAt, 'revokedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);

      const existingRow = selectRevocationByMandate.get(mandate.id) as RevocationRow | undefined;
      if (existingRow !== undefined) {
        return { kind: 'already-revoked', mandate, revocation: rowToRevocation(existingRow) };
      }
      assertTransferRevocable(mandate.status);

      const revocation: TransferMandateRevocationRecord = {
        id: input.revocationId,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt,
        reason: input.reason,
        issuerRef: input.issuerRef,
        correlationId: input.correlationId,
        // Immutable proof of how far the authorization had already been
        // exercised when authority was withdrawn. Revocation never deletes or
        // invalidates that evidence, and never claims that a movement was
        // reversed.
        executionsAtRevocation: mandate.executionCount,
        ...(mandate.transferredScope !== undefined ? { transferredScopeAtRevocation: mandate.transferredScope } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      try {
        commitRevocation(revocation);
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          // A concurrent writer revoked first; return its revocation rather
          // than a second, competing one.
          const raced = selectRevocationByMandate.get(mandate.id) as RevocationRow | undefined;
          if (raced !== undefined) {
            return { kind: 'already-revoked', mandate: loadMandate(mandate.id), revocation: rowToRevocation(raced) };
          }
        }
        throw error;
      }

      return { kind: 'revoked', mandate: loadMandate(mandate.id), revocation };
    },

    async getRevocation(context: TransferGovernanceContext, mandateId: string): Promise<TransferMandateRevocationRecord | null> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      const row = selectRevocationByMandate.get(mandateId) as RevocationRow | undefined;
      return row === undefined ? null : rowToRevocation(row);
    },

    async health(): Promise<TransferMandateStoreHealth> {
      const readable = !closed && db.open;
      return {
        status: readable ? 'healthy' : 'unhealthy',
        readable,
        writable: readable,
        schemaVersion: TRANSFER_MANDATE_STORE_SCHEMA_VERSION,
        checkedAt: now(),
      };
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
}
