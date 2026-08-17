import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  readEnterpriseTokenizationTerms,
  serializeEnterpriseTokenizationTerms,
  validateEnterpriseTokenizationMandate,
} from '@aoc-enterprise/tokenization-mandate';
import type {
  EnterpriseTokenizationScope,
  EnterpriseTokenizationTerms,
  EnterpriseTokenizedRightType,
  SerializedEnterpriseTokenizationTerms,
} from '@aoc-enterprise/tokenization-mandate';

import { computeDigest } from '../governance-store/digest.js';
import { TokenizationGovernanceError } from './errors.js';
import { assertExerciseAuthorized, assertNoScopeEscalation, assertRevocable, toCanonicalMandate } from './lifecycle.js';
import { TOKENIZATION_MANDATE_STORE_SCHEMA_VERSION } from './in-memory-mandate-store.js';
import {
  canAccessTokenizationOrganization,
  requireStrictUtcTokenizationTimestamp,
  requireTokenizationAccessToOrganization,
  requireTokenizationTenantScope,
  type TokenizationMandateStore,
} from './mandate-store.js';
import type {
  IssueTokenizationMandateInput,
  RecordTokenizationExecutionInput,
  RevokeTokenizationMandateInput,
  TokenizationExecutionRecord,
  TokenizationGovernanceContext,
  TokenizationMandateRecord,
  TokenizationMandateRevocationRecord,
  TokenizationMandateStoreHealth,
  TokenizationRevokeOutcome,
} from './contracts.js';

export interface CreateSqliteTokenizationMandateStoreOptions {
  readonly now?: () => string;
  readonly busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Schema (`aoc.tokenization-mandate-store.schema.v1`). Three current-state
// tables plus the version row, never event-sourced — this module's mandate
// lifecycle has exactly one transition, `active -> revoked`, the same shape
// `../access-governance/sqlite-access-grant-store.ts` persists for grants.
// Execution evidence is the one append-only table: there is no UPDATE or
// DELETE statement against it anywhere in this file.
//
// Durable invariants pushed down to the database, so they hold even against a
// second writer this process never sees:
//  - `request_ref UNIQUE`  -> one tokenization request authorizes at most one
//    mandate; replaying a request can never accumulate authorization.
//  - `execution_id PRIMARY KEY` -> one external execution is recorded at most
//    once; a replayed execution can never double-count issued units.
//  - `mandate_id UNIQUE` on revocations -> at most one revocation per mandate.
//  - `(mandate_id, sequence) UNIQUE` -> a stable, restart-stable append order
//    for evidence, independent of insertion timing or rowid reuse.
//
// `terms_json` is the canonical serialization of `EnterpriseTokenizationTerms`
// (`serializeEnterpriseTokenizationTerms`), and `terms_digest` is the
// Governance Store's own canonical digest primitive over it. Terms are the one
// structured column here and precisely what a scope-escalation would have to
// alter, so every read recomputes the digest and refuses a mismatch rather
// than reconstructing an authorization from bytes that changed after commit.
// This is integrity detection, not a signature — the same limits documented
// for the Governance Store's digests apply.
// ---------------------------------------------------------------------------
const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS tokenization_mandate_store_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL,
    migration_state TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tokenization_mandates (
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
    issued_units INTEGER NOT NULL,
    execution_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    schema_version TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tokenization_mandates_org ON tokenization_mandates(organization_id);

  CREATE TABLE IF NOT EXISTS tokenization_executions (
    execution_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL REFERENCES tokenization_mandates(mandate_id),
    organization_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    executor_ref TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    issued_scope_json TEXT NOT NULL,
    rights_json TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    issued_units INTEGER,
    external_system TEXT,
    external_network TEXT,
    external_token_standard TEXT,
    external_contract_reference TEXT,
    external_transaction_reference TEXT,
    evidence_refs_json TEXT,
    recorded_at TEXT NOT NULL,
    UNIQUE (mandate_id, sequence)
  );
  CREATE INDEX IF NOT EXISTS idx_tokenization_executions_mandate ON tokenization_executions(mandate_id);

  CREATE TABLE IF NOT EXISTS tokenization_mandate_revocations (
    revocation_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL UNIQUE REFERENCES tokenization_mandates(mandate_id),
    organization_id TEXT NOT NULL,
    revoked_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    issuer_ref TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    description TEXT,
    evidence_refs_json TEXT,
    executions_at_revocation INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tokenization_mandate_revocations_org ON tokenization_mandate_revocations(organization_id);
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
  readonly issued_units: number;
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
  readonly issued_scope_json: string;
  readonly rights_json: string;
  readonly correlation_id: string;
  readonly issued_units: number | null;
  readonly external_system: string | null;
  readonly external_network: string | null;
  readonly external_token_standard: string | null;
  readonly external_contract_reference: string | null;
  readonly external_transaction_reference: string | null;
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
}

function corrupted(message: string, details?: Readonly<Record<string, unknown>>): TokenizationGovernanceError {
  return new TokenizationGovernanceError('TOKENIZATION_RECORD_CORRUPTED', message, details);
}

/** Parses a stored JSON column, failing closed. A row that cannot be read back is never reconstructed into a partial authorization. */
function parseJsonColumn(value: string, column: string, mandateId: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw corrupted(`Stored tokenization mandate '${mandateId}' has an unreadable '${column}' column; refusing to reconstruct an authorization from it.`, { mandateId, column });
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
 * Reconstructs `EnterpriseTokenizationTerms` from its stored canonical form,
 * verifying the canonical digest first. A digest mismatch means the stored
 * bytes changed after commit -- which for this column would be exactly a
 * silent scope, rights, executor, or constraint change -- so it fails closed
 * rather than handing back a mandate that no longer says what was authorized.
 */
function readTermsColumn(row: MandateRow): EnterpriseTokenizationTerms {
  const parsed = parseJsonColumn(row.terms_json, 'terms_json', row.mandate_id) as SerializedEnterpriseTokenizationTerms;
  const terms = readEnterpriseTokenizationTerms(parsed);
  const digest = computeDigest(serializeEnterpriseTokenizationTerms(terms));
  if (digest !== row.terms_digest) {
    throw corrupted(
      `Stored tokenization mandate '${row.mandate_id}' failed its terms integrity check; the authorized rights, scope, executor, or constraints changed after commit.`,
      { mandateId: row.mandate_id, expectedDigest: row.terms_digest, actualDigest: digest },
    );
  }
  return terms;
}

function rowToMandate(row: MandateRow): TokenizationMandateRecord {
  if (row.status !== 'active' && row.status !== 'revoked') {
    throw corrupted(`Stored tokenization mandate '${row.mandate_id}' carries an unrecognized status '${row.status}'.`, { mandateId: row.mandate_id, status: row.status });
  }

  const record: TokenizationMandateRecord = {
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
    issuedUnits: row.issued_units,
    executionCount: row.execution_count,
    createdAt: row.created_at,
    ...(row.asset_tenant_id !== null ? { assetTenantId: row.asset_tenant_id } : {}),
    ...(row.evaluation_ref !== null ? { evaluationRef: row.evaluation_ref } : {}),
    ...(row.issuer_ref !== null ? { issuerRef: row.issuer_ref } : {}),
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
  // cannot project back onto a valid `EnterpriseTokenizationMandate` is a
  // corrupted record, never a usable authorization.
  const validation = validateEnterpriseTokenizationMandate(toCanonicalMandate(record));
  if (!validation.valid) {
    throw corrupted(
      `Stored tokenization mandate '${row.mandate_id}' does not reconstruct into a valid canonical mandate: ${validation.errors.map((issue) => issue.code).join(', ')}.`,
      { mandateId: row.mandate_id, issues: validation.errors },
    );
  }

  return record;
}

function rowToExecution(row: ExecutionRow): TokenizationExecutionRecord {
  const rights = parseJsonColumn(row.rights_json, 'rights_json', row.execution_id);
  if (!Array.isArray(rights) || rights.length === 0 || !rights.every((right) => typeof right === 'string' && right.length > 0)) {
    throw corrupted(`Stored tokenization execution '${row.execution_id}' has a malformed 'rights_json' column.`, { executionId: row.execution_id });
  }
  const issuedScope = parseJsonColumn(row.issued_scope_json, 'issued_scope_json', row.execution_id) as EnterpriseTokenizationScope;
  if (issuedScope === null || typeof issuedScope !== 'object' || (issuedScope.kind !== 'proportional' && issuedScope.kind !== 'unitized')) {
    throw corrupted(`Stored tokenization execution '${row.execution_id}' has a malformed 'issued_scope_json' column.`, { executionId: row.execution_id });
  }

  return {
    id: row.execution_id,
    mandateId: row.mandate_id,
    organizationId: row.organization_id,
    executorRef: row.executor_ref,
    executedAt: row.executed_at,
    issuedScope,
    rights: rights as readonly EnterpriseTokenizedRightType[],
    correlationId: row.correlation_id,
    recordedAt: row.recorded_at,
    ...(row.issued_units !== null ? { issuedUnits: row.issued_units } : {}),
    ...(row.external_system !== null ? { externalSystem: row.external_system } : {}),
    ...(row.external_network !== null ? { externalNetwork: row.external_network } : {}),
    ...(row.external_token_standard !== null ? { externalTokenStandard: row.external_token_standard } : {}),
    ...(row.external_contract_reference !== null ? { externalContractReference: row.external_contract_reference } : {}),
    ...(row.external_transaction_reference !== null ? { externalTransactionReference: row.external_transaction_reference } : {}),
    ...(() => {
      const evidenceRefs = parseStringArrayColumn(row.evidence_refs_json, 'evidence_refs_json', row.execution_id);
      return evidenceRefs === undefined ? {} : { evidenceRefs };
    })(),
  };
}

function rowToRevocation(row: RevocationRow): TokenizationMandateRevocationRecord {
  return {
    id: row.revocation_id,
    mandateId: row.mandate_id,
    organizationId: row.organization_id,
    revokedAt: row.revoked_at,
    reason: row.reason,
    issuerRef: row.issuer_ref,
    correlationId: row.correlation_id,
    executionsAtRevocation: row.executions_at_revocation,
    ...(row.description !== null ? { description: row.description } : {}),
    ...(() => {
      const evidenceRefs = parseStringArrayColumn(row.evidence_refs_json, 'evidence_refs_json', row.revocation_id);
      return evidenceRefs === undefined ? {} : { evidenceRefs };
    })(),
  };
}

/**
 * SQLite-backed `TokenizationMandateStore`, `better-sqlite3` loaded lazily,
 * hand-written SQL — mirrors `createSqliteAccessGrantStore`
 * (`../access-governance/sqlite-access-grant-store.ts`) in pragmas,
 * schema-version guarding, and transaction discipline. Every mutating call
 * that touches more than one row runs inside one synchronous
 * `db.transaction(...)`: better-sqlite3 is synchronous, so no other
 * in-process caller can interleave, and the UNIQUE constraints documented on
 * `SCHEMA_V1` serialize cross-process writers too.
 *
 * This store persists the authorization artifact only. It never mints,
 * issues, transfers, or values a token, holds no key, and contacts no
 * external system — the same boundary the in-memory implementation keeps.
 */
export async function createSqliteTokenizationMandateStore(
  dbPath: string,
  options: CreateSqliteTokenizationMandateStoreOptions = {},
): Promise<TokenizationMandateStore> {
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
  if (tableExists(db, 'tokenization_mandate_store_versions')) {
    const existingVersion = db.prepare(`SELECT schema_version FROM tokenization_mandate_store_versions ORDER BY id DESC LIMIT 1`).get() as
      | { schema_version: string }
      | undefined;
    if (existingVersion !== undefined && existingVersion.schema_version !== TOKENIZATION_MANDATE_STORE_SCHEMA_VERSION) {
      db.close();
      throw new TokenizationGovernanceError(
        'TOKENIZATION_STORE_UNAVAILABLE',
        `Tokenization Mandate Store schema version '${existingVersion.schema_version}' is not supported by this runtime (expected '${TOKENIZATION_MANDATE_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
      );
    }
  }

  db.exec(SCHEMA_V1);

  const latestVersion = db.prepare(`SELECT schema_version FROM tokenization_mandate_store_versions ORDER BY id DESC LIMIT 1`).get() as
    | { schema_version: string }
    | undefined;
  if (latestVersion === undefined) {
    db.prepare(`INSERT INTO tokenization_mandate_store_versions (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`).run(
      TOKENIZATION_MANDATE_STORE_SCHEMA_VERSION,
      now(),
    );
  } else if (latestVersion.schema_version !== TOKENIZATION_MANDATE_STORE_SCHEMA_VERSION) {
    db.close();
    throw new TokenizationGovernanceError(
      'TOKENIZATION_STORE_UNAVAILABLE',
      `Tokenization Mandate Store schema version '${latestVersion.schema_version}' is not supported by this runtime (expected '${TOKENIZATION_MANDATE_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
    );
  }

  const insertMandate = db.prepare(`INSERT INTO tokenization_mandates
    (mandate_id, organization_id, status, asset_kind, asset_id, asset_tenant_id, terms_json, terms_digest, request_ref, requested_by, decision_ref, evaluation_ref,
     effective_from, expires_at, correlation_id, issuer_ref, approval_refs_json, obligation_refs_json, evidence_refs_json, audit_refs_json,
     issued_units, execution_count, created_at, schema_version)
    VALUES (@mandateId, @organizationId, 'active', @assetKind, @assetId, @assetTenantId, @termsJson, @termsDigest, @requestRef, @requestedBy, @decisionRef, @evaluationRef,
     @effectiveFrom, @expiresAt, @correlationId, @issuerRef, @approvalRefsJson, @obligationRefsJson, @evidenceRefsJson, @auditRefsJson,
     0, 0, @createdAt, @schemaVersion)`);
  const selectMandateById = db.prepare(`SELECT * FROM tokenization_mandates WHERE mandate_id = ?`);
  const selectMandateByRequestRef = db.prepare(`SELECT * FROM tokenization_mandates WHERE request_ref = ?`);
  const updateMandateStatus = db.prepare(`UPDATE tokenization_mandates SET status = 'revoked' WHERE mandate_id = @mandateId AND status = 'active'`);
  const updateMandateCounters = db.prepare(
    `UPDATE tokenization_mandates SET issued_units = @issuedUnits, execution_count = @executionCount WHERE mandate_id = @mandateId AND execution_count = @expectedExecutionCount`,
  );

  const insertExecution = db.prepare(`INSERT INTO tokenization_executions
    (execution_id, mandate_id, organization_id, sequence, executor_ref, executed_at, issued_scope_json, rights_json, correlation_id, issued_units,
     external_system, external_network, external_token_standard, external_contract_reference, external_transaction_reference, evidence_refs_json, recorded_at)
    VALUES (@executionId, @mandateId, @organizationId, @sequence, @executorRef, @executedAt, @issuedScopeJson, @rightsJson, @correlationId, @issuedUnits,
     @externalSystem, @externalNetwork, @externalTokenStandard, @externalContractReference, @externalTransactionReference, @evidenceRefsJson, @recordedAt)`);
  const selectExecutionsByMandate = db.prepare(`SELECT * FROM tokenization_executions WHERE mandate_id = ? ORDER BY sequence ASC`);
  const selectExecutionById = db.prepare(`SELECT 1 FROM tokenization_executions WHERE execution_id = ?`);

  const insertRevocation = db.prepare(`INSERT INTO tokenization_mandate_revocations
    (revocation_id, mandate_id, organization_id, revoked_at, reason, issuer_ref, correlation_id, description, evidence_refs_json, executions_at_revocation)
    VALUES (@revocationId, @mandateId, @organizationId, @revokedAt, @reason, @issuerRef, @correlationId, @description, @evidenceRefsJson, @executionsAtRevocation)`);
  const selectRevocationByMandate = db.prepare(`SELECT * FROM tokenization_mandate_revocations WHERE mandate_id = ?`);

  let closed = false;

  function assertOpen(): void {
    if (closed) throw new TokenizationGovernanceError('TOKENIZATION_STORE_UNAVAILABLE', 'The Tokenization Mandate Store has been closed.');
  }

  function loadMandate(mandateId: string): TokenizationMandateRecord {
    const row = selectMandateById.get(mandateId) as MandateRow | undefined;
    if (row === undefined) throw new TokenizationGovernanceError('TOKENIZATION_MANDATE_NOT_FOUND', `No tokenization mandate for mandateId '${mandateId}'.`);
    return rowToMandate(row);
  }

  /** Tenant-scoped read, identical in ordering and error taxonomy to the in-memory store's own `requireVisibleMandate`. */
  function requireVisibleMandate(context: TokenizationGovernanceContext, mandateId: string): TokenizationMandateRecord {
    requireTokenizationTenantScope(context);
    const mandate = loadMandate(mandateId);
    if (!canAccessTokenizationOrganization(context, mandate.organizationId)) {
      throw new TokenizationGovernanceError(
        'TOKENIZATION_ACCESS_SCOPE_VIOLATION',
        `The caller is not authorized to access tokenization governance data for organization '${mandate.organizationId}'.`,
      );
    }
    return mandate;
  }

  /**
   * One synchronous commit section: append the evidence row and advance the
   * mandate's counters together. The counter UPDATE is guarded on the
   * execution count this call read, so a concurrent writer that advanced it
   * first loses this transaction rather than silently overwriting its
   * issuance total.
   */
  const commitExecution = db.transaction(
    (execution: TokenizationExecutionRecord, sequence: number, nextIssuedUnits: number, nextExecutionCount: number, expectedExecutionCount: number) => {
      insertExecution.run({
        executionId: execution.id,
        mandateId: execution.mandateId,
        organizationId: execution.organizationId,
        sequence,
        executorRef: execution.executorRef,
        executedAt: execution.executedAt,
        issuedScopeJson: JSON.stringify(execution.issuedScope),
        rightsJson: JSON.stringify(execution.rights),
        correlationId: execution.correlationId,
        issuedUnits: execution.issuedUnits ?? null,
        externalSystem: execution.externalSystem ?? null,
        externalNetwork: execution.externalNetwork ?? null,
        externalTokenStandard: execution.externalTokenStandard ?? null,
        externalContractReference: execution.externalContractReference ?? null,
        externalTransactionReference: execution.externalTransactionReference ?? null,
        evidenceRefsJson: execution.evidenceRefs === undefined ? null : JSON.stringify(execution.evidenceRefs),
        recordedAt: execution.recordedAt,
      });
      const updated = updateMandateCounters.run({
        mandateId: execution.mandateId,
        issuedUnits: nextIssuedUnits,
        executionCount: nextExecutionCount,
        expectedExecutionCount,
      });
      if (updated.changes !== 1) {
        throw new TokenizationGovernanceError(
          'TOKENIZATION_EXECUTION_ALREADY_RECORDED',
          `Tokenization mandate '${execution.mandateId}' advanced concurrently while recording execution '${execution.id}'; the issuance total was not double-counted.`,
        );
      }
    },
  );

  /** One synchronous commit section: record the revocation and flip the status together, or neither. */
  const commitRevocation = db.transaction((revocation: TokenizationMandateRevocationRecord) => {
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
    });
    updateMandateStatus.run({ mandateId: revocation.mandateId });
  });

  return {
    providerKind: 'sqlite',

    async issueMandate(context: TokenizationGovernanceContext, input: IssueTokenizationMandateInput): Promise<TokenizationMandateRecord> {
      assertOpen();
      requireTokenizationAccessToOrganization(context, input.organizationId);

      const effectiveFrom = requireStrictUtcTokenizationTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcTokenizationTimestamp(input.expiresAt, 'expiresAt');

      // A mandate may narrow what was requested; it may never widen it.
      assertNoScopeEscalation(input.terms, input.requestedTerms);

      const serializedTerms = serializeEnterpriseTokenizationTerms(input.terms);
      const candidate: TokenizationMandateRecord = {
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
        issuedUnits: 0,
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

      const validation = validateEnterpriseTokenizationMandate(toCanonicalMandate(candidate));
      if (!validation.valid) {
        throw new TokenizationGovernanceError(
          'TOKENIZATION_VALIDATION_ERROR',
          `Tokenization mandate candidate failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
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
          schemaVersion: TOKENIZATION_MANDATE_STORE_SCHEMA_VERSION,
        });
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          // Either the mandate id is taken, or -- the invariant that matters --
          // this tokenization request already produced a mandate and replaying
          // it must not create a second authorization.
          const existing = selectMandateByRequestRef.get(input.requestRef) as MandateRow | undefined;
          if (existing !== undefined && existing.mandate_id !== input.id) {
            throw new TokenizationGovernanceError(
              'TOKENIZATION_MANDATE_ALREADY_EXISTS',
              `Tokenization request '${input.requestRef}' has already been authorized by mandate '${existing.mandate_id}'; replaying it must not create additional issuance authorization.`,
              { requestRef: input.requestRef, mandateId: existing.mandate_id },
            );
          }
          throw new TokenizationGovernanceError('TOKENIZATION_MANDATE_ALREADY_EXISTS', `A tokenization mandate with id '${input.id}' already exists.`);
        }
        throw error;
      }

      return loadMandate(candidate.id);
    },

    async getMandate(context: TokenizationGovernanceContext, mandateId: string): Promise<TokenizationMandateRecord> {
      assertOpen();
      return requireVisibleMandate(context, mandateId);
    },

    async getMandateByRequestRef(context: TokenizationGovernanceContext, requestRef: string): Promise<TokenizationMandateRecord | null> {
      assertOpen();
      const row = selectMandateByRequestRef.get(requestRef) as MandateRow | undefined;
      if (row === undefined) return null;
      return requireVisibleMandate(context, row.mandate_id);
    },

    async recordExecution(context: TokenizationGovernanceContext, input: RecordTokenizationExecutionInput) {
      assertOpen();
      requireTokenizationAccessToOrganization(context, input.organizationId);

      const executedAt = requireStrictUtcTokenizationTimestamp(input.executedAt, 'executedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new TokenizationGovernanceError(
          'TOKENIZATION_ACCESS_SCOPE_VIOLATION',
          `Tokenization mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // Replay of an already-recorded execution must never create additional
      // issuance headroom by being counted twice. Checked here for a precise
      // error, and enforced independently by `execution_id PRIMARY KEY`.
      if (selectExecutionById.get(input.id) !== undefined) {
        throw new TokenizationGovernanceError(
          'TOKENIZATION_EXECUTION_ALREADY_RECORDED',
          `Tokenization execution '${input.id}' has already been recorded; replaying it would double-count issued units.`,
        );
      }

      assertExerciseAuthorized(mandate, {
        executorRef: input.executorRef,
        rights: input.rights,
        issuedScope: input.issuedScope,
        executedAt,
        ...(input.issuedUnits !== undefined ? { issuedUnits: input.issuedUnits } : {}),
      });

      const execution: TokenizationExecutionRecord = {
        id: input.id,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executorRef: input.executorRef,
        executedAt,
        issuedScope: input.issuedScope,
        rights: [...input.rights],
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.issuedUnits !== undefined ? { issuedUnits: input.issuedUnits } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalNetwork !== undefined ? { externalNetwork: input.externalNetwork } : {}),
        ...(input.externalTokenStandard !== undefined ? { externalTokenStandard: input.externalTokenStandard } : {}),
        ...(input.externalContractReference !== undefined ? { externalContractReference: input.externalContractReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      try {
        commitExecution(
          execution,
          mandate.executionCount + 1,
          mandate.issuedUnits + (input.issuedUnits ?? 0),
          mandate.executionCount + 1,
          mandate.executionCount,
        );
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          throw new TokenizationGovernanceError(
            'TOKENIZATION_EXECUTION_ALREADY_RECORDED',
            `Tokenization execution '${input.id}' has already been recorded; replaying it would double-count issued units.`,
          );
        }
        throw error;
      }

      return { mandate: loadMandate(mandate.id), execution };
    },

    async listExecutions(context: TokenizationGovernanceContext, mandateId: string): Promise<readonly TokenizationExecutionRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return (selectExecutionsByMandate.all(mandateId) as ExecutionRow[]).map(rowToExecution);
    },

    async revokeMandate(context: TokenizationGovernanceContext, input: RevokeTokenizationMandateInput): Promise<TokenizationRevokeOutcome> {
      assertOpen();
      requireTokenizationAccessToOrganization(context, input.organizationId);

      const revokedAt = requireStrictUtcTokenizationTimestamp(input.revokedAt, 'revokedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);

      const existingRow = selectRevocationByMandate.get(mandate.id) as RevocationRow | undefined;
      if (existingRow !== undefined) {
        return { kind: 'already-revoked', mandate, revocation: rowToRevocation(existingRow) };
      }
      assertRevocable(mandate.status);

      const revocation: TokenizationMandateRevocationRecord = {
        id: input.revocationId,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt,
        reason: input.reason,
        issuerRef: input.issuerRef,
        correlationId: input.correlationId,
        // Immutable proof that the authorization had already been exercised
        // this many times when authority was withdrawn. Revocation never
        // deletes or invalidates that evidence.
        executionsAtRevocation: mandate.executionCount,
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
          if (raced !== undefined) return { kind: 'already-revoked', mandate: loadMandate(mandate.id), revocation: rowToRevocation(raced) };
        }
        throw error;
      }

      return { kind: 'revoked', mandate: loadMandate(mandate.id), revocation };
    },

    async getRevocation(context: TokenizationGovernanceContext, mandateId: string): Promise<TokenizationMandateRevocationRecord | null> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      const row = selectRevocationByMandate.get(mandateId) as RevocationRow | undefined;
      return row === undefined ? null : rowToRevocation(row);
    },

    async health(): Promise<TokenizationMandateStoreHealth> {
      const readable = !closed && db.open;
      return {
        status: readable ? 'healthy' : 'unhealthy',
        readable,
        writable: readable,
        schemaVersion: TOKENIZATION_MANDATE_STORE_SCHEMA_VERSION,
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
