import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  isEnterpriseCollateralReleaseType,
  isEnterpriseSecuredAmount,
  readEnterpriseCollateralizationTerms,
  serializeEnterpriseCollateralizationTerms,
  validateEnterpriseCollateralizationMandate,
} from '@aoc-enterprise/collateralization-mandate';
import type {
  EnterpriseCollateralizableRightType,
  EnterpriseCollateralizationScope,
  EnterpriseCollateralizationTerms,
  EnterpriseSecuredAmount,
  SerializedEnterpriseCollateralizationTerms,
} from '@aoc-enterprise/collateralization-mandate';

import { computeDigest } from '../governance-store/digest.js';
import { CollateralizationGovernanceError } from './errors.js';
import {
  assertCollateralExerciseAuthorized,
  assertCollateralizationRevocable,
  assertNoCollateralScopeEscalation,
  nextCommittedCollateralScope,
  toCanonicalCollateralizationMandate,
} from './lifecycle.js';
import { COLLATERALIZATION_MANDATE_STORE_SCHEMA_VERSION } from './in-memory-mandate-store.js';
import {
  canAccessCollateralizationOrganization,
  requireCollateralizationAccessToOrganization,
  requireCollateralizationTenantScope,
  requireStrictUtcCollateralizationTimestamp,
  type CollateralizationMandateStore,
} from './mandate-store.js';
import type {
  CollateralizationExecutionRecord,
  CollateralizationGovernanceContext,
  CollateralizationMandateRecord,
  CollateralizationMandateRevocationRecord,
  CollateralizationMandateStoreHealth,
  CollateralizationReleaseRecord,
  CollateralizationRevokeOutcome,
  IssueCollateralizationMandateInput,
  RecordCollateralizationExecutionInput,
  RecordCollateralizationReleaseInput,
  RevokeCollateralizationMandateInput,
} from './contracts.js';

export interface CreateSqliteCollateralizationMandateStoreOptions {
  readonly now?: () => string;
  readonly busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Schema (`aoc.collateralization-mandate-store.schema.v1`). One current-state
// table plus three append-only evidence/lifecycle tables and the version row,
// never event-sourced — this module's mandate lifecycle has exactly one
// transition, `active -> revoked`, the same shape
// `../access-governance/sqlite-access-grant-store.ts` persists for grants and
// `../tokenization-governance/sqlite-mandate-store.ts` persists for
// tokenization mandates.
//
// Durable invariants pushed down to the database, so they hold even against a
// second writer this process never sees:
//  - `request_ref UNIQUE` -> one collateralization request authorizes at most
//    one mandate; replaying a request can never accumulate authorization.
//  - `execution_id PRIMARY KEY` -> one external arrangement is recorded at
//    most once; a replayed execution can never commit its scope twice.
//  - `mandate_id UNIQUE` on revocations -> at most one revocation per mandate.
//  - `(mandate_id, sequence) UNIQUE` on both evidence tables -> a stable,
//    restart-stable append order independent of insertion timing or rowid
//    reuse.
//  - `release_id PRIMARY KEY` + an `execution_id` foreign key -> a reported
//    release always references an arrangement Soberanía actually has evidence of.
//
// `terms_json` is the canonical serialization of
// `EnterpriseCollateralizationTerms`
// (`serializeEnterpriseCollateralizationTerms`), and `terms_digest` is the
// Governance Store's own canonical digest primitive over it. Terms are the one
// structured column here and precisely what a scope escalation, an obligation
// substitution, a secured-party substitution or an executor substitution would
// have to alter, so every read recomputes the digest and refuses a mismatch
// rather than reconstructing an authorization from bytes that changed after
// commit. This is integrity detection, not a signature — the same limits
// documented for the Governance Store's digests apply.
//
// `committed_scope_json` is deliberately a *scope*, not a counter: collateral
// scope accumulates and must be compared against the mandate's own scope,
// which a scalar could not express for unitized denominations.
// ---------------------------------------------------------------------------
const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS collateralization_mandate_store_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL,
    migration_state TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collateralization_mandates (
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
    committed_scope_json TEXT,
    execution_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    schema_version TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_collateralization_mandates_org ON collateralization_mandates(organization_id);

  CREATE TABLE IF NOT EXISTS collateralization_executions (
    execution_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL REFERENCES collateralization_mandates(mandate_id),
    organization_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    executor_ref TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    secured_obligation_ref TEXT NOT NULL,
    secured_party_ref TEXT NOT NULL,
    committed_scope_json TEXT NOT NULL,
    rights_json TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    secured_amount_json TEXT,
    external_system TEXT,
    external_registry TEXT,
    external_agreement_reference TEXT,
    external_filing_reference TEXT,
    external_transaction_reference TEXT,
    jurisdiction TEXT,
    priority_rank INTEGER,
    evidence_refs_json TEXT,
    recorded_at TEXT NOT NULL,
    UNIQUE (mandate_id, sequence)
  );
  CREATE INDEX IF NOT EXISTS idx_collateralization_executions_mandate ON collateralization_executions(mandate_id);

  CREATE TABLE IF NOT EXISTS collateralization_releases (
    release_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL REFERENCES collateralization_mandates(mandate_id),
    execution_id TEXT NOT NULL REFERENCES collateralization_executions(execution_id),
    organization_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    reported_by TEXT NOT NULL,
    released_at TEXT NOT NULL,
    release_type TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    external_system TEXT,
    external_registry TEXT,
    external_release_reference TEXT,
    evidence_refs_json TEXT,
    recorded_at TEXT NOT NULL,
    UNIQUE (mandate_id, sequence)
  );
  CREATE INDEX IF NOT EXISTS idx_collateralization_releases_mandate ON collateralization_releases(mandate_id);

  CREATE TABLE IF NOT EXISTS collateralization_mandate_revocations (
    revocation_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL UNIQUE REFERENCES collateralization_mandates(mandate_id),
    organization_id TEXT NOT NULL,
    revoked_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    issuer_ref TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    description TEXT,
    evidence_refs_json TEXT,
    executions_at_revocation INTEGER NOT NULL,
    committed_scope_at_revocation_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_collateralization_mandate_revocations_org ON collateralization_mandate_revocations(organization_id);
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
  readonly committed_scope_json: string | null;
  readonly execution_count: number;
  readonly created_at: string;
}

interface ExecutionRow {
  readonly execution_id: string;
  readonly mandate_id: string;
  readonly organization_id: string;
  readonly sequence: number;
  readonly executor_ref: string;
  readonly executed_at: string;
  readonly secured_obligation_ref: string;
  readonly secured_party_ref: string;
  readonly committed_scope_json: string;
  readonly rights_json: string;
  readonly correlation_id: string;
  readonly secured_amount_json: string | null;
  readonly external_system: string | null;
  readonly external_registry: string | null;
  readonly external_agreement_reference: string | null;
  readonly external_filing_reference: string | null;
  readonly external_transaction_reference: string | null;
  readonly jurisdiction: string | null;
  readonly priority_rank: number | null;
  readonly evidence_refs_json: string | null;
  readonly recorded_at: string;
}

interface ReleaseRow {
  readonly release_id: string;
  readonly mandate_id: string;
  readonly execution_id: string;
  readonly organization_id: string;
  readonly sequence: number;
  readonly reported_by: string;
  readonly released_at: string;
  readonly release_type: string;
  readonly correlation_id: string;
  readonly external_system: string | null;
  readonly external_registry: string | null;
  readonly external_release_reference: string | null;
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
  readonly committed_scope_at_revocation_json: string | null;
}

function corrupted(message: string, details?: Readonly<Record<string, unknown>>): CollateralizationGovernanceError {
  return new CollateralizationGovernanceError('COLLATERALIZATION_RECORD_CORRUPTED', message, details);
}

/** Parses a stored JSON column, failing closed. A row that cannot be read back is never reconstructed into a partial authorization. */
function parseJsonColumn(value: string, column: string, recordId: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw corrupted(
      `Stored collateralization record '${recordId}' has an unreadable '${column}' column; refusing to reconstruct an authorization from it.`,
      { recordId, column },
    );
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
function parseScopeColumn(value: string, column: string, recordId: string): EnterpriseCollateralizationScope {
  const parsed = parseJsonColumn(value, column, recordId);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw corrupted(`Stored collateralization record '${recordId}' has a malformed '${column}' column.`, { recordId, column });
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
  throw corrupted(`Stored collateralization record '${recordId}' has a malformed '${column}' column.`, { recordId, column });
}

function parseSecuredAmountColumn(value: string | null, column: string, recordId: string): EnterpriseSecuredAmount | undefined {
  if (value === null) return undefined;
  const parsed = parseJsonColumn(value, column, recordId);
  if (!isEnterpriseSecuredAmount(parsed)) {
    throw corrupted(`Stored collateralization record '${recordId}' has a malformed '${column}' column.`, { recordId, column });
  }
  return { minorUnits: parsed.minorUnits, currency: parsed.currency };
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
 * Reconstructs `EnterpriseCollateralizationTerms` from its stored canonical
 * form, verifying the canonical digest first. A digest mismatch means the
 * stored bytes changed after commit -- which for this column would be exactly
 * a silent scope, rights, obligation, secured-party, executor, or constraint
 * change -- so it fails closed rather than handing back a mandate that no
 * longer says what was authorized.
 */
function readTermsColumn(row: MandateRow): EnterpriseCollateralizationTerms {
  const parsed = parseJsonColumn(row.terms_json, 'terms_json', row.mandate_id) as SerializedEnterpriseCollateralizationTerms;
  const terms = readEnterpriseCollateralizationTerms(parsed);
  const digest = computeDigest(serializeEnterpriseCollateralizationTerms(terms));
  if (digest !== row.terms_digest) {
    throw corrupted(
      `Stored collateralization mandate '${row.mandate_id}' failed its terms integrity check; the authorized rights, scope, secured obligation, secured party, executor, or constraints changed after commit.`,
      { mandateId: row.mandate_id, expectedDigest: row.terms_digest, actualDigest: digest },
    );
  }
  return terms;
}

function rowToMandate(row: MandateRow): CollateralizationMandateRecord {
  if (row.status !== 'active' && row.status !== 'revoked') {
    throw corrupted(`Stored collateralization mandate '${row.mandate_id}' carries an unrecognized status '${row.status}'.`, {
      mandateId: row.mandate_id,
      status: row.status,
    });
  }

  const record: CollateralizationMandateRecord = {
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
    ...(row.committed_scope_json !== null
      ? { committedScope: parseScopeColumn(row.committed_scope_json, 'committed_scope_json', row.mandate_id) }
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
  // cannot project back onto a valid `EnterpriseCollateralizationMandate` is a
  // corrupted record, never a usable authorization.
  const validation = validateEnterpriseCollateralizationMandate(toCanonicalCollateralizationMandate(record));
  if (!validation.valid) {
    throw corrupted(
      `Stored collateralization mandate '${row.mandate_id}' does not reconstruct into a valid canonical mandate: ${validation.errors.map((issue) => issue.code).join(', ')}.`,
      { mandateId: row.mandate_id, issues: validation.errors },
    );
  }

  return record;
}

function rowToExecution(row: ExecutionRow): CollateralizationExecutionRecord {
  const rights = parseJsonColumn(row.rights_json, 'rights_json', row.execution_id);
  if (!Array.isArray(rights) || rights.length === 0 || !rights.every((right) => typeof right === 'string' && right.length > 0)) {
    throw corrupted(`Stored collateralization execution '${row.execution_id}' has a malformed 'rights_json' column.`, { executionId: row.execution_id });
  }
  const committedScope = parseScopeColumn(row.committed_scope_json, 'committed_scope_json', row.execution_id);
  const securedAmount = parseSecuredAmountColumn(row.secured_amount_json, 'secured_amount_json', row.execution_id);

  return {
    id: row.execution_id,
    mandateId: row.mandate_id,
    organizationId: row.organization_id,
    executorRef: row.executor_ref,
    executedAt: row.executed_at,
    securedObligationRef: row.secured_obligation_ref,
    securedPartyRef: row.secured_party_ref,
    committedScope,
    rights: rights as readonly EnterpriseCollateralizableRightType[],
    correlationId: row.correlation_id,
    recordedAt: row.recorded_at,
    ...(securedAmount === undefined ? {} : { securedAmount }),
    ...(row.external_system !== null ? { externalSystem: row.external_system } : {}),
    ...(row.external_registry !== null ? { externalRegistry: row.external_registry } : {}),
    ...(row.external_agreement_reference !== null ? { externalAgreementReference: row.external_agreement_reference } : {}),
    ...(row.external_filing_reference !== null ? { externalFilingReference: row.external_filing_reference } : {}),
    ...(row.external_transaction_reference !== null ? { externalTransactionReference: row.external_transaction_reference } : {}),
    ...(row.jurisdiction !== null ? { jurisdiction: row.jurisdiction } : {}),
    ...(row.priority_rank !== null ? { priorityRank: row.priority_rank } : {}),
    ...(() => {
      const evidenceRefs = parseStringArrayColumn(row.evidence_refs_json, 'evidence_refs_json', row.execution_id);
      return evidenceRefs === undefined ? {} : { evidenceRefs };
    })(),
  };
}

function rowToRelease(row: ReleaseRow): CollateralizationReleaseRecord {
  if (!isEnterpriseCollateralReleaseType(row.release_type)) {
    throw corrupted(`Stored collateralization release '${row.release_id}' carries an unrecognized release type '${row.release_type}'.`, {
      releaseId: row.release_id,
      releaseType: row.release_type,
    });
  }

  return {
    id: row.release_id,
    mandateId: row.mandate_id,
    executionId: row.execution_id,
    organizationId: row.organization_id,
    reportedBy: row.reported_by,
    releasedAt: row.released_at,
    releaseType: row.release_type,
    correlationId: row.correlation_id,
    recordedAt: row.recorded_at,
    ...(row.external_system !== null ? { externalSystem: row.external_system } : {}),
    ...(row.external_registry !== null ? { externalRegistry: row.external_registry } : {}),
    ...(row.external_release_reference !== null ? { externalReleaseReference: row.external_release_reference } : {}),
    ...(() => {
      const evidenceRefs = parseStringArrayColumn(row.evidence_refs_json, 'evidence_refs_json', row.release_id);
      return evidenceRefs === undefined ? {} : { evidenceRefs };
    })(),
  };
}

function rowToRevocation(row: RevocationRow): CollateralizationMandateRevocationRecord {
  return {
    id: row.revocation_id,
    mandateId: row.mandate_id,
    organizationId: row.organization_id,
    revokedAt: row.revoked_at,
    reason: row.reason,
    issuerRef: row.issuer_ref,
    correlationId: row.correlation_id,
    executionsAtRevocation: row.executions_at_revocation,
    ...(row.committed_scope_at_revocation_json !== null
      ? { committedScopeAtRevocation: parseScopeColumn(row.committed_scope_at_revocation_json, 'committed_scope_at_revocation_json', row.revocation_id) }
      : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(() => {
      const evidenceRefs = parseStringArrayColumn(row.evidence_refs_json, 'evidence_refs_json', row.revocation_id);
      return evidenceRefs === undefined ? {} : { evidenceRefs };
    })(),
  };
}

/**
 * SQLite-backed `CollateralizationMandateStore`, `better-sqlite3` loaded
 * lazily, hand-written SQL — mirrors `createSqliteAccessGrantStore`
 * (`../access-governance/sqlite-access-grant-store.ts`) and
 * `createSqliteTokenizationMandateStore` in pragmas, schema-version guarding,
 * and transaction discipline. Every mutating call that touches more than one
 * row runs inside one synchronous `db.transaction(...)`: better-sqlite3 is
 * synchronous, so no other in-process caller can interleave, and the UNIQUE
 * constraints documented on `SCHEMA_V1` serialize cross-process writers too.
 *
 * This store persists the authorization artifact and the evidence reported
 * against it. It never creates a security interest, perfects one, files with
 * any registry, determines priority, values an asset, originates a loan, or
 * contacts an external system — the same boundary the in-memory
 * implementation keeps.
 */
export async function createSqliteCollateralizationMandateStore(
  dbPath: string,
  options: CreateSqliteCollateralizationMandateStoreOptions = {},
): Promise<CollateralizationMandateStore> {
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
  if (tableExists(db, 'collateralization_mandate_store_versions')) {
    const existingVersion = db
      .prepare(`SELECT schema_version FROM collateralization_mandate_store_versions ORDER BY id DESC LIMIT 1`)
      .get() as { schema_version: string } | undefined;
    if (existingVersion !== undefined && existingVersion.schema_version !== COLLATERALIZATION_MANDATE_STORE_SCHEMA_VERSION) {
      db.close();
      throw new CollateralizationGovernanceError(
        'COLLATERALIZATION_STORE_UNAVAILABLE',
        `Collateralization Mandate Store schema version '${existingVersion.schema_version}' is not supported by this runtime (expected '${COLLATERALIZATION_MANDATE_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
      );
    }
  }

  db.exec(SCHEMA_V1);

  const latestVersion = db.prepare(`SELECT schema_version FROM collateralization_mandate_store_versions ORDER BY id DESC LIMIT 1`).get() as
    | { schema_version: string }
    | undefined;
  if (latestVersion === undefined) {
    db.prepare(`INSERT INTO collateralization_mandate_store_versions (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`).run(
      COLLATERALIZATION_MANDATE_STORE_SCHEMA_VERSION,
      now(),
    );
  } else if (latestVersion.schema_version !== COLLATERALIZATION_MANDATE_STORE_SCHEMA_VERSION) {
    db.close();
    throw new CollateralizationGovernanceError(
      'COLLATERALIZATION_STORE_UNAVAILABLE',
      `Collateralization Mandate Store schema version '${latestVersion.schema_version}' is not supported by this runtime (expected '${COLLATERALIZATION_MANDATE_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
    );
  }

  const insertMandate = db.prepare(`INSERT INTO collateralization_mandates
    (mandate_id, organization_id, status, asset_kind, asset_id, asset_tenant_id, terms_json, terms_digest, request_ref, requested_by, decision_ref, evaluation_ref,
     effective_from, expires_at, correlation_id, issuer_ref, approval_refs_json, obligation_refs_json, evidence_refs_json, audit_refs_json,
     committed_scope_json, execution_count, created_at, schema_version)
    VALUES (@mandateId, @organizationId, 'active', @assetKind, @assetId, @assetTenantId, @termsJson, @termsDigest, @requestRef, @requestedBy, @decisionRef, @evaluationRef,
     @effectiveFrom, @expiresAt, @correlationId, @issuerRef, @approvalRefsJson, @obligationRefsJson, @evidenceRefsJson, @auditRefsJson,
     NULL, 0, @createdAt, @schemaVersion)`);
  const selectMandateById = db.prepare(`SELECT * FROM collateralization_mandates WHERE mandate_id = ?`);
  const selectMandateByRequestRef = db.prepare(`SELECT * FROM collateralization_mandates WHERE request_ref = ?`);
  const updateMandateStatus = db.prepare(
    `UPDATE collateralization_mandates SET status = 'revoked' WHERE mandate_id = @mandateId AND status = 'active'`,
  );
  const updateMandateCommitment = db.prepare(
    `UPDATE collateralization_mandates SET committed_scope_json = @committedScopeJson, execution_count = @executionCount WHERE mandate_id = @mandateId AND execution_count = @expectedExecutionCount`,
  );

  const insertExecution = db.prepare(`INSERT INTO collateralization_executions
    (execution_id, mandate_id, organization_id, sequence, executor_ref, executed_at, secured_obligation_ref, secured_party_ref, committed_scope_json, rights_json,
     correlation_id, secured_amount_json, external_system, external_registry, external_agreement_reference, external_filing_reference,
     external_transaction_reference, jurisdiction, priority_rank, evidence_refs_json, recorded_at)
    VALUES (@executionId, @mandateId, @organizationId, @sequence, @executorRef, @executedAt, @securedObligationRef, @securedPartyRef, @committedScopeJson, @rightsJson,
     @correlationId, @securedAmountJson, @externalSystem, @externalRegistry, @externalAgreementReference, @externalFilingReference,
     @externalTransactionReference, @jurisdiction, @priorityRank, @evidenceRefsJson, @recordedAt)`);
  const selectExecutionsByMandate = db.prepare(`SELECT * FROM collateralization_executions WHERE mandate_id = ? ORDER BY sequence ASC`);
  const selectExecutionById = db.prepare(`SELECT 1 FROM collateralization_executions WHERE execution_id = ?`);
  const selectExecutionByIdAndMandate = db.prepare(`SELECT 1 FROM collateralization_executions WHERE execution_id = ? AND mandate_id = ?`);

  const insertRelease = db.prepare(`INSERT INTO collateralization_releases
    (release_id, mandate_id, execution_id, organization_id, sequence, reported_by, released_at, release_type, correlation_id,
     external_system, external_registry, external_release_reference, evidence_refs_json, recorded_at)
    VALUES (@releaseId, @mandateId, @executionId, @organizationId, @sequence, @reportedBy, @releasedAt, @releaseType, @correlationId,
     @externalSystem, @externalRegistry, @externalReleaseReference, @evidenceRefsJson, @recordedAt)`);
  const selectReleasesByMandate = db.prepare(`SELECT * FROM collateralization_releases WHERE mandate_id = ? ORDER BY sequence ASC`);
  const selectReleaseById = db.prepare(`SELECT 1 FROM collateralization_releases WHERE release_id = ?`);
  const countReleasesByMandate = db.prepare(`SELECT COUNT(*) AS count FROM collateralization_releases WHERE mandate_id = ?`);

  const insertRevocation = db.prepare(`INSERT INTO collateralization_mandate_revocations
    (revocation_id, mandate_id, organization_id, revoked_at, reason, issuer_ref, correlation_id, description, evidence_refs_json,
     executions_at_revocation, committed_scope_at_revocation_json)
    VALUES (@revocationId, @mandateId, @organizationId, @revokedAt, @reason, @issuerRef, @correlationId, @description, @evidenceRefsJson,
     @executionsAtRevocation, @committedScopeAtRevocationJson)`);
  const selectRevocationByMandate = db.prepare(`SELECT * FROM collateralization_mandate_revocations WHERE mandate_id = ?`);

  let closed = false;

  function assertOpen(): void {
    if (closed) {
      throw new CollateralizationGovernanceError('COLLATERALIZATION_STORE_UNAVAILABLE', 'The Collateralization Mandate Store has been closed.');
    }
  }

  function loadMandate(mandateId: string): CollateralizationMandateRecord {
    const row = selectMandateById.get(mandateId) as MandateRow | undefined;
    if (row === undefined) {
      throw new CollateralizationGovernanceError(
        'COLLATERALIZATION_MANDATE_NOT_FOUND',
        `No collateralization mandate for mandateId '${mandateId}'.`,
      );
    }
    return rowToMandate(row);
  }

  /** Tenant-scoped read, identical in ordering and error taxonomy to the in-memory store's own `requireVisibleMandate`. */
  function requireVisibleMandate(context: CollateralizationGovernanceContext, mandateId: string): CollateralizationMandateRecord {
    requireCollateralizationTenantScope(context);
    const mandate = loadMandate(mandateId);
    if (!canAccessCollateralizationOrganization(context, mandate.organizationId)) {
      throw new CollateralizationGovernanceError(
        'COLLATERALIZATION_ACCESS_SCOPE_VIOLATION',
        `The caller is not authorized to access collateralization governance data for organization '${mandate.organizationId}'.`,
      );
    }
    return mandate;
  }

  /**
   * One synchronous commit section: append the evidence row and advance the
   * mandate's cumulative committed scope together. The update is guarded on
   * the execution count this call read, so a concurrent writer that advanced
   * it first loses this transaction rather than silently overwriting the
   * committed scope with a total computed from a stale read.
   */
  const commitExecution = db.transaction(
    (execution: CollateralizationExecutionRecord, sequence: number, committedScope: EnterpriseCollateralizationScope, expectedExecutionCount: number) => {
      insertExecution.run({
        executionId: execution.id,
        mandateId: execution.mandateId,
        organizationId: execution.organizationId,
        sequence,
        executorRef: execution.executorRef,
        executedAt: execution.executedAt,
        securedObligationRef: execution.securedObligationRef,
        securedPartyRef: execution.securedPartyRef,
        committedScopeJson: JSON.stringify(execution.committedScope),
        rightsJson: JSON.stringify(execution.rights),
        correlationId: execution.correlationId,
        securedAmountJson: execution.securedAmount === undefined ? null : JSON.stringify(execution.securedAmount),
        externalSystem: execution.externalSystem ?? null,
        externalRegistry: execution.externalRegistry ?? null,
        externalAgreementReference: execution.externalAgreementReference ?? null,
        externalFilingReference: execution.externalFilingReference ?? null,
        externalTransactionReference: execution.externalTransactionReference ?? null,
        jurisdiction: execution.jurisdiction ?? null,
        priorityRank: execution.priorityRank ?? null,
        evidenceRefsJson: execution.evidenceRefs === undefined ? null : JSON.stringify(execution.evidenceRefs),
        recordedAt: execution.recordedAt,
      });
      const updated = updateMandateCommitment.run({
        mandateId: execution.mandateId,
        committedScopeJson: JSON.stringify(committedScope),
        executionCount: expectedExecutionCount + 1,
        expectedExecutionCount,
      });
      if (updated.changes !== 1) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_EXECUTION_ALREADY_RECORDED',
          `Collateralization mandate '${execution.mandateId}' advanced concurrently while recording execution '${execution.id}'; the committed scope was not computed from a stale total.`,
        );
      }
    },
  );

  /** One synchronous commit section: record the revocation and flip the status together, or neither. */
  const commitRevocation = db.transaction((revocation: CollateralizationMandateRevocationRecord) => {
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
      committedScopeAtRevocationJson:
        revocation.committedScopeAtRevocation === undefined ? null : JSON.stringify(revocation.committedScopeAtRevocation),
    });
    updateMandateStatus.run({ mandateId: revocation.mandateId });
  });

  return {
    providerKind: 'sqlite',

    async issueMandate(
      context: CollateralizationGovernanceContext,
      input: IssueCollateralizationMandateInput,
    ): Promise<CollateralizationMandateRecord> {
      assertOpen();
      requireCollateralizationAccessToOrganization(context, input.organizationId);

      const effectiveFrom = requireStrictUtcCollateralizationTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcCollateralizationTimestamp(input.expiresAt, 'expiresAt');

      // A mandate may narrow what was requested; it may never widen it, and
      // it may never substitute a different obligation, party or executor.
      assertNoCollateralScopeEscalation(input.terms, input.requestedTerms);

      const serializedTerms = serializeEnterpriseCollateralizationTerms(input.terms);
      const candidate: CollateralizationMandateRecord = {
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

      const validation = validateEnterpriseCollateralizationMandate(toCanonicalCollateralizationMandate(candidate));
      if (!validation.valid) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_VALIDATION_ERROR',
          `Collateralization mandate candidate failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
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
          schemaVersion: COLLATERALIZATION_MANDATE_STORE_SCHEMA_VERSION,
        });
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          // Either the mandate id is taken, or -- the invariant that matters --
          // this collateralization request already produced a mandate and
          // replaying it must not create a second authorization.
          const existing = selectMandateByRequestRef.get(input.requestRef) as MandateRow | undefined;
          if (existing !== undefined && existing.mandate_id !== input.id) {
            throw new CollateralizationGovernanceError(
              'COLLATERALIZATION_MANDATE_ALREADY_EXISTS',
              `Collateralization request '${input.requestRef}' has already been authorized by mandate '${existing.mandate_id}'; replaying it must not create additional collateralization authority.`,
              { requestRef: input.requestRef, mandateId: existing.mandate_id },
            );
          }
          throw new CollateralizationGovernanceError(
            'COLLATERALIZATION_MANDATE_ALREADY_EXISTS',
            `A collateralization mandate with id '${input.id}' already exists.`,
          );
        }
        throw error;
      }

      return loadMandate(candidate.id);
    },

    async getMandate(context: CollateralizationGovernanceContext, mandateId: string): Promise<CollateralizationMandateRecord> {
      assertOpen();
      return requireVisibleMandate(context, mandateId);
    },

    async getMandateByRequestRef(
      context: CollateralizationGovernanceContext,
      requestRef: string,
    ): Promise<CollateralizationMandateRecord | null> {
      assertOpen();
      const row = selectMandateByRequestRef.get(requestRef) as MandateRow | undefined;
      if (row === undefined) return null;
      return requireVisibleMandate(context, row.mandate_id);
    },

    async recordExecution(context: CollateralizationGovernanceContext, input: RecordCollateralizationExecutionInput) {
      assertOpen();
      requireCollateralizationAccessToOrganization(context, input.organizationId);

      const executedAt = requireStrictUtcCollateralizationTimestamp(input.executedAt, 'executedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_ACCESS_SCOPE_VIOLATION',
          `Collateralization mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // Replay of an already-recorded execution must never commit its scope a
      // second time. Checked here for a precise error, and enforced
      // independently by `execution_id PRIMARY KEY`.
      if (selectExecutionById.get(input.id) !== undefined) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_EXECUTION_ALREADY_RECORDED',
          `Collateralization execution '${input.id}' has already been recorded; replaying it would commit its scope twice.`,
        );
      }

      assertCollateralExerciseAuthorized(mandate, {
        executorRef: input.executorRef,
        securedObligationRef: input.securedObligationRef,
        securedPartyRef: input.securedPartyRef,
        rights: input.rights,
        committedScope: input.committedScope,
        executedAt,
        ...(input.securedAmount !== undefined ? { securedAmount: input.securedAmount } : {}),
        ...(input.externalRegistry !== undefined ? { externalRegistry: input.externalRegistry } : {}),
        ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
        ...(input.priorityRank !== undefined ? { priorityRank: input.priorityRank } : {}),
      });

      const committedScope = nextCommittedCollateralScope(mandate.committedScope, input.committedScope);
      if (committedScope === null) {
        // Unreachable through the authorization check above, which refuses
        // incommensurable scopes. Kept as a fail-closed guard so a future
        // second write path cannot silently drop committed scope.
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED',
          `The proposed commitment is not commensurable with the scope already committed under collateralization mandate '${mandate.id}'.`,
          { refusalCode: 'CUMULATIVE_SCOPE_EXCEEDS_MANDATE', mandateId: mandate.id },
        );
      }

      const execution: CollateralizationExecutionRecord = {
        id: input.id,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executorRef: input.executorRef,
        executedAt,
        securedObligationRef: input.securedObligationRef,
        securedPartyRef: input.securedPartyRef,
        committedScope: input.committedScope,
        rights: [...input.rights],
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.securedAmount !== undefined ? { securedAmount: input.securedAmount } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalRegistry !== undefined ? { externalRegistry: input.externalRegistry } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
        ...(input.externalFilingReference !== undefined ? { externalFilingReference: input.externalFilingReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
        ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
        ...(input.priorityRank !== undefined ? { priorityRank: input.priorityRank } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      try {
        commitExecution(execution, mandate.executionCount + 1, committedScope, mandate.executionCount);
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          throw new CollateralizationGovernanceError(
            'COLLATERALIZATION_EXECUTION_ALREADY_RECORDED',
            `Collateralization execution '${input.id}' has already been recorded; replaying it would commit its scope twice.`,
          );
        }
        throw error;
      }

      return { mandate: loadMandate(mandate.id), execution };
    },

    async listExecutions(
      context: CollateralizationGovernanceContext,
      mandateId: string,
    ): Promise<readonly CollateralizationExecutionRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return (selectExecutionsByMandate.all(mandateId) as ExecutionRow[]).map(rowToExecution);
    },

    async recordRelease(
      context: CollateralizationGovernanceContext,
      input: RecordCollateralizationReleaseInput,
    ): Promise<CollateralizationReleaseRecord> {
      assertOpen();
      requireCollateralizationAccessToOrganization(context, input.organizationId);

      const releasedAt = requireStrictUtcCollateralizationTimestamp(input.releasedAt, 'releasedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_ACCESS_SCOPE_VIOLATION',
          `Collateralization mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // A release ends one specific recorded arrangement. Reporting one
      // against an execution this mandate never had would be an unanchored
      // claim about the external world.
      if (selectExecutionByIdAndMandate.get(input.executionId, mandate.id) === undefined) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_EXECUTION_NOT_FOUND',
          `No collateralization execution '${input.executionId}' recorded under mandate '${mandate.id}'; a release must reference an arrangement Soberanía has evidence of.`,
          { mandateId: mandate.id, executionId: input.executionId },
        );
      }

      if (selectReleaseById.get(input.id) !== undefined) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_RELEASE_ALREADY_RECORDED',
          `Collateralization release '${input.id}' has already been recorded; replaying it would duplicate the evidence.`,
        );
      }

      const sequence = ((countReleasesByMandate.get(mandate.id) as { count: number }).count ?? 0) + 1;
      const release: CollateralizationReleaseRecord = {
        id: input.id,
        mandateId: mandate.id,
        executionId: input.executionId,
        organizationId: mandate.organizationId,
        reportedBy: input.reportedBy,
        releasedAt,
        releaseType: input.releaseType,
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalRegistry !== undefined ? { externalRegistry: input.externalRegistry } : {}),
        ...(input.externalReleaseReference !== undefined ? { externalReleaseReference: input.externalReleaseReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      try {
        // Deliberately a single INSERT and nothing else: a reported release is
        // an observation about an external arrangement, so there is no mandate
        // row to update. In particular `committed_scope_json` is untouched --
        // Soberanía cannot verify the encumbrance ended and must not manufacture
        // fresh collateralization headroom from an unverified report.
        insertRelease.run({
          releaseId: release.id,
          mandateId: release.mandateId,
          executionId: release.executionId,
          organizationId: release.organizationId,
          sequence,
          reportedBy: release.reportedBy,
          releasedAt: release.releasedAt,
          releaseType: release.releaseType,
          correlationId: release.correlationId,
          externalSystem: release.externalSystem ?? null,
          externalRegistry: release.externalRegistry ?? null,
          externalReleaseReference: release.externalReleaseReference ?? null,
          evidenceRefsJson: release.evidenceRefs === undefined ? null : JSON.stringify(release.evidenceRefs),
          recordedAt: release.recordedAt,
        });
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          throw new CollateralizationGovernanceError(
            'COLLATERALIZATION_RELEASE_ALREADY_RECORDED',
            `Collateralization release '${input.id}' has already been recorded; replaying it would duplicate the evidence.`,
          );
        }
        throw error;
      }

      return release;
    },

    async listReleases(
      context: CollateralizationGovernanceContext,
      mandateId: string,
    ): Promise<readonly CollateralizationReleaseRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return (selectReleasesByMandate.all(mandateId) as ReleaseRow[]).map(rowToRelease);
    },

    async revokeMandate(
      context: CollateralizationGovernanceContext,
      input: RevokeCollateralizationMandateInput,
    ): Promise<CollateralizationRevokeOutcome> {
      assertOpen();
      requireCollateralizationAccessToOrganization(context, input.organizationId);

      const revokedAt = requireStrictUtcCollateralizationTimestamp(input.revokedAt, 'revokedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);

      const existingRow = selectRevocationByMandate.get(mandate.id) as RevocationRow | undefined;
      if (existingRow !== undefined) {
        return { kind: 'already-revoked', mandate, revocation: rowToRevocation(existingRow) };
      }
      assertCollateralizationRevocable(mandate.status);

      const revocation: CollateralizationMandateRevocationRecord = {
        id: input.revocationId,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt,
        reason: input.reason,
        issuerRef: input.issuerRef,
        correlationId: input.correlationId,
        // Immutable proof of how far the authorization had already been
        // exercised when authority was withdrawn. Revocation never deletes or
        // invalidates that evidence, and never claims that an external
        // security interest was released.
        executionsAtRevocation: mandate.executionCount,
        ...(mandate.committedScope !== undefined ? { committedScopeAtRevocation: mandate.committedScope } : {}),
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

    async getRevocation(
      context: CollateralizationGovernanceContext,
      mandateId: string,
    ): Promise<CollateralizationMandateRevocationRecord | null> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      const row = selectRevocationByMandate.get(mandateId) as RevocationRow | undefined;
      return row === undefined ? null : rowToRevocation(row);
    },

    async health(): Promise<CollateralizationMandateStoreHealth> {
      const readable = !closed && db.open;
      return {
        status: readable ? 'healthy' : 'unhealthy',
        readable,
        writable: readable,
        schemaVersion: COLLATERALIZATION_MANDATE_STORE_SCHEMA_VERSION,
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
