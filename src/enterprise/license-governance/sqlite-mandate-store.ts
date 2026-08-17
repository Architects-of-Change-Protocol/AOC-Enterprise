import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  isEnterpriseLicensableRightType,
  isEnterpriseLicenseExclusivity,
  isEnterpriseLicenseLifecycleType,
  isEnterpriseLicensedUnits,
  isEnterpriseLicensedUseType,
  readEnterpriseLicenseContexts,
  readEnterpriseLicenseTerms,
  serializeEnterpriseLicenseTerms,
  validateEnterpriseLicenseMandate,
} from '@aoc-enterprise/license-mandate';
import type {
  EnterpriseLicensableRightType,
  EnterpriseLicenseExclusivity,
  EnterpriseLicenseRightsScope,
  EnterpriseLicenseTerms,
  EnterpriseLicensedUnits,
  EnterpriseLicensedUseType,
  SerializedEnterpriseLicenseTerms,
} from '@aoc-enterprise/license-mandate';

import { computeDigest } from '../governance-store/digest.js';
import { LicenseGovernanceError } from './errors.js';
import { assertLicenseExerciseAuthorized, assertLicenseRevocable, assertNoLicensePermissionEscalation, toCanonicalLicenseMandate } from './lifecycle.js';
import { LICENSE_MANDATE_STORE_SCHEMA_VERSION } from './in-memory-mandate-store.js';
import {
  canAccessLicenseOrganization,
  requireLicenseAccessToOrganization,
  requireLicenseTenantScope,
  requireStrictUtcLicenseTimestamp,
  type LicenseMandateStore,
} from './mandate-store.js';
import type {
  IssueLicenseMandateInput,
  LicenseExecutionRecord,
  LicenseGovernanceContext,
  LicenseLifecycleRecord,
  LicenseMandateRecord,
  LicenseMandateRevocationRecord,
  LicenseMandateStoreHealth,
  LicenseRevokeOutcome,
  RecordLicenseExecutionInput,
  RecordLicenseLifecycleInput,
  RevokeLicenseMandateInput,
} from './contracts.js';

export interface CreateSqliteLicenseMandateStoreOptions {
  readonly now?: () => string;
  readonly busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Schema (`aoc.license-mandate-store.schema.v1`). One current-state table plus
// three append-only evidence/lifecycle tables and the version row, never
// event-sourced — this module's mandate lifecycle has exactly one transition,
// `active -> revoked`, the same shape
// `../access-governance/sqlite-access-grant-store.ts` persists for grants and
// `../collateralization-governance/sqlite-mandate-store.ts` persists for
// collateralization mandates.
//
// Durable invariants pushed down to the database, so they hold even against a
// second writer this process never sees:
//  - `request_ref UNIQUE` -> one license request authorizes at most one
//    mandate; replaying a request can never accumulate authorization.
//  - `execution_id PRIMARY KEY` -> one external license is recorded at most
//    once; a replayed execution can never be counted twice.
//  - `mandate_id UNIQUE` on revocations -> at most one revocation per mandate.
//  - `(mandate_id, sequence) UNIQUE` on both evidence tables -> a stable,
//    restart-stable append order independent of insertion timing or rowid
//    reuse.
//  - `lifecycle_id PRIMARY KEY` + an `execution_id` foreign key -> a reported
//    expiry/termination always references a license AOC actually has evidence
//    of.
//
// `terms_json` is the canonical serialization of `EnterpriseLicenseTerms`
// (`serializeEnterpriseLicenseTerms`), and `terms_digest` is the Governance
// Store's own canonical digest primitive over it. Terms are the one structured
// column here and precisely what a use expansion, a licensee substitution, an
// exclusivity upgrade, a context widening or a rights-scope change would have
// to alter, so every read recomputes the digest and refuses a mismatch rather
// than reconstructing an authorization from bytes that changed after commit.
// This is integrity detection, not a signature — the same limits documented
// for the Governance Store's digests apply.
//
// There is deliberately **no** cumulative-scope column here, in contrast with
// `collateralization_mandates.committed_scope_json`. Licensed units do not
// accumulate against a finite governed right (see
// `LicenseMandateRecord.executionCount`), so `execution_count` alone carries
// the exercise history, and inventing a pool column would create a durable
// invariant the domain does not have.
// ---------------------------------------------------------------------------
const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS license_mandate_store_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL,
    migration_state TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS license_mandates (
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
    execution_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    schema_version TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_license_mandates_org ON license_mandates(organization_id);

  CREATE TABLE IF NOT EXISTS license_executions (
    execution_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL REFERENCES license_mandates(mandate_id),
    organization_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    executed_by TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    licensee_ref TEXT NOT NULL,
    rights_json TEXT NOT NULL,
    granted_uses_json TEXT NOT NULL,
    exclusivity TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    rights_scope_json TEXT,
    contexts_json TEXT,
    license_effective_at TEXT,
    license_expires_at TEXT,
    licensed_units_json TEXT,
    external_system TEXT,
    external_agreement_reference TEXT,
    external_acceptance_reference TEXT,
    external_transaction_reference TEXT,
    evidence_refs_json TEXT,
    recorded_at TEXT NOT NULL,
    UNIQUE (mandate_id, sequence)
  );
  CREATE INDEX IF NOT EXISTS idx_license_executions_mandate ON license_executions(mandate_id);

  CREATE TABLE IF NOT EXISTS license_lifecycle_events (
    lifecycle_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL REFERENCES license_mandates(mandate_id),
    execution_id TEXT NOT NULL REFERENCES license_executions(execution_id),
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
  CREATE INDEX IF NOT EXISTS idx_license_lifecycle_events_mandate ON license_lifecycle_events(mandate_id);

  CREATE TABLE IF NOT EXISTS license_mandate_revocations (
    revocation_id TEXT PRIMARY KEY,
    mandate_id TEXT NOT NULL UNIQUE REFERENCES license_mandates(mandate_id),
    organization_id TEXT NOT NULL,
    revoked_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    issuer_ref TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    description TEXT,
    evidence_refs_json TEXT,
    executions_at_revocation INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_license_mandate_revocations_org ON license_mandate_revocations(organization_id);
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
  readonly licensee_ref: string;
  readonly rights_json: string;
  readonly granted_uses_json: string;
  readonly exclusivity: string;
  readonly correlation_id: string;
  readonly rights_scope_json: string | null;
  readonly contexts_json: string | null;
  readonly license_effective_at: string | null;
  readonly license_expires_at: string | null;
  readonly licensed_units_json: string | null;
  readonly external_system: string | null;
  readonly external_agreement_reference: string | null;
  readonly external_acceptance_reference: string | null;
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
}

function corrupted(message: string, details?: Readonly<Record<string, unknown>>): LicenseGovernanceError {
  return new LicenseGovernanceError('LICENSE_RECORD_CORRUPTED', message, details);
}

/** Parses a stored JSON column, failing closed. A row that cannot be read back is never reconstructed into a partial authorization. */
function parseJsonColumn(value: string, column: string, recordId: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw corrupted(`Stored license record '${recordId}' has an unreadable '${column}' column; refusing to reconstruct an authorization from it.`, {
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

/** Reads a stored rights-scope column, failing closed on anything that is not one of the two canonical scope shapes. */
function parseRightsScopeColumn(value: string | null, column: string, recordId: string): EnterpriseLicenseRightsScope | undefined {
  if (value === null) return undefined;
  const parsed = parseJsonColumn(value, column, recordId);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw corrupted(`Stored license record '${recordId}' has a malformed '${column}' column.`, { recordId, column });
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
  throw corrupted(`Stored license record '${recordId}' has a malformed '${column}' column.`, { recordId, column });
}

/** Reads a stored operating-context column, failing closed on anything that is not a dimension -> non-empty-label-array map. */
function parseContextsColumn(value: string | null, column: string, recordId: string): Readonly<Record<string, readonly string[]>> | undefined {
  if (value === null) return undefined;
  const parsed = parseJsonColumn(value, column, recordId);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw corrupted(`Stored license record '${recordId}' has a malformed '${column}' column.`, { recordId, column });
  }
  const candidate = parsed as Record<string, unknown>;
  const dimensions = Object.keys(candidate);
  if (dimensions.length === 0) {
    throw corrupted(`Stored license record '${recordId}' has an empty '${column}' column; an absent restriction is stored as NULL, never as an empty map.`, {
      recordId,
      column,
    });
  }
  for (const dimension of dimensions) {
    const values = candidate[dimension];
    if (
      dimension.length === 0 ||
      !Array.isArray(values) ||
      values.length === 0 ||
      !values.every((entry) => typeof entry === 'string' && entry.length > 0)
    ) {
      throw corrupted(`Stored license record '${recordId}' has a malformed '${column}' column.`, { recordId, column, dimension });
    }
  }
  return readEnterpriseLicenseContexts(candidate as Record<string, readonly string[]>);
}

function parseLicensedUnitsColumn(value: string | null, column: string, recordId: string): EnterpriseLicensedUnits | undefined {
  if (value === null) return undefined;
  const parsed = parseJsonColumn(value, column, recordId);
  if (!isEnterpriseLicensedUnits(parsed)) {
    throw corrupted(`Stored license record '${recordId}' has a malformed '${column}' column.`, { recordId, column });
  }
  return { units: parsed.units, unitDenomination: parsed.unitDenomination };
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
 * Reconstructs `EnterpriseLicenseTerms` from its stored canonical form,
 * verifying the canonical digest first. A digest mismatch means the stored
 * bytes changed after commit -- which for this column would be exactly a
 * silent use, licensee, exclusivity, context, duration, unit-ceiling,
 * disposition or rights-scope change -- so it fails closed rather than handing
 * back a mandate that no longer says what was authorized.
 */
function readTermsColumn(row: MandateRow): EnterpriseLicenseTerms {
  const parsed = parseJsonColumn(row.terms_json, 'terms_json', row.mandate_id) as SerializedEnterpriseLicenseTerms;
  const terms = readEnterpriseLicenseTerms(parsed);
  const digest = computeDigest(serializeEnterpriseLicenseTerms(terms));
  if (digest !== row.terms_digest) {
    throw corrupted(
      `Stored license mandate '${row.mandate_id}' failed its terms integrity check; the authorized rights, licensee, permitted uses, exclusivity, rights scope, operating context, or constraints changed after commit.`,
      { mandateId: row.mandate_id, expectedDigest: row.terms_digest, actualDigest: digest },
    );
  }
  return terms;
}

function rowToMandate(row: MandateRow): LicenseMandateRecord {
  if (row.status !== 'active' && row.status !== 'revoked') {
    throw corrupted(`Stored license mandate '${row.mandate_id}' carries an unrecognized status '${row.status}'.`, {
      mandateId: row.mandate_id,
      status: row.status,
    });
  }

  const record: LicenseMandateRecord = {
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
  // cannot project back onto a valid `EnterpriseLicenseMandate` is a corrupted
  // record, never a usable authorization.
  const validation = validateEnterpriseLicenseMandate(toCanonicalLicenseMandate(record));
  if (!validation.valid) {
    throw corrupted(
      `Stored license mandate '${row.mandate_id}' does not reconstruct into a valid canonical mandate: ${validation.errors.map((issue) => issue.code).join(', ')}.`,
      { mandateId: row.mandate_id, issues: validation.errors },
    );
  }

  return record;
}

function rowToExecution(row: ExecutionRow): LicenseExecutionRecord {
  const rights = parseJsonColumn(row.rights_json, 'rights_json', row.execution_id);
  if (!Array.isArray(rights) || rights.length === 0 || !rights.every((right) => isEnterpriseLicensableRightType(right))) {
    throw corrupted(`Stored license execution '${row.execution_id}' has a malformed 'rights_json' column.`, { executionId: row.execution_id });
  }
  const grantedUses = parseJsonColumn(row.granted_uses_json, 'granted_uses_json', row.execution_id);
  if (!Array.isArray(grantedUses) || grantedUses.length === 0 || !grantedUses.every((use) => isEnterpriseLicensedUseType(use))) {
    throw corrupted(`Stored license execution '${row.execution_id}' has a malformed 'granted_uses_json' column.`, { executionId: row.execution_id });
  }
  if (!isEnterpriseLicenseExclusivity(row.exclusivity)) {
    throw corrupted(`Stored license execution '${row.execution_id}' carries an unrecognized exclusivity '${row.exclusivity}'.`, {
      executionId: row.execution_id,
      exclusivity: row.exclusivity,
    });
  }

  const rightsScope = parseRightsScopeColumn(row.rights_scope_json, 'rights_scope_json', row.execution_id);
  const contexts = parseContextsColumn(row.contexts_json, 'contexts_json', row.execution_id);
  const licensedUnits = parseLicensedUnitsColumn(row.licensed_units_json, 'licensed_units_json', row.execution_id);

  return {
    id: row.execution_id,
    mandateId: row.mandate_id,
    organizationId: row.organization_id,
    executedBy: row.executed_by,
    executedAt: row.executed_at,
    licenseeRef: row.licensee_ref,
    rights: rights as readonly EnterpriseLicensableRightType[],
    grantedUses: grantedUses as readonly EnterpriseLicensedUseType[],
    exclusivity: row.exclusivity as EnterpriseLicenseExclusivity,
    correlationId: row.correlation_id,
    recordedAt: row.recorded_at,
    ...(rightsScope === undefined ? {} : { rightsScope }),
    ...(contexts === undefined ? {} : { contexts }),
    ...(row.license_effective_at !== null ? { licenseEffectiveAt: row.license_effective_at } : {}),
    ...(row.license_expires_at !== null ? { licenseExpiresAt: row.license_expires_at } : {}),
    ...(licensedUnits === undefined ? {} : { licensedUnits }),
    ...(row.external_system !== null ? { externalSystem: row.external_system } : {}),
    ...(row.external_agreement_reference !== null ? { externalAgreementReference: row.external_agreement_reference } : {}),
    ...(row.external_acceptance_reference !== null ? { externalAcceptanceReference: row.external_acceptance_reference } : {}),
    ...(row.external_transaction_reference !== null ? { externalTransactionReference: row.external_transaction_reference } : {}),
    ...(() => {
      const evidenceRefs = parseStringArrayColumn(row.evidence_refs_json, 'evidence_refs_json', row.execution_id);
      return evidenceRefs === undefined ? {} : { evidenceRefs };
    })(),
  };
}

function rowToLifecycle(row: LifecycleRow): LicenseLifecycleRecord {
  if (!isEnterpriseLicenseLifecycleType(row.lifecycle_type)) {
    throw corrupted(`Stored license lifecycle event '${row.lifecycle_id}' carries an unrecognized lifecycle type '${row.lifecycle_type}'.`, {
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

function rowToRevocation(row: RevocationRow): LicenseMandateRevocationRecord {
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
 * SQLite-backed `LicenseMandateStore`, `better-sqlite3` loaded lazily,
 * hand-written SQL — mirrors `createSqliteAccessGrantStore`
 * (`../access-governance/sqlite-access-grant-store.ts`),
 * `createSqliteTokenizationMandateStore` and
 * `createSqliteCollateralizationMandateStore` in pragmas, schema-version
 * guarding, and transaction discipline. Every mutating call that touches more
 * than one row runs inside one synchronous `db.transaction(...)`:
 * better-sqlite3 is synchronous, so no other in-process caller can interleave,
 * and the UNIQUE constraints documented on `SCHEMA_V1` serialize cross-process
 * writers too.
 *
 * This store persists the authorization artifact and the evidence reported
 * against it. It never drafts an agreement, captures a signature, prices or
 * values anything, calculates or settles a royalty, meters usage, or contacts
 * an external system — the same boundary the in-memory implementation keeps.
 */
export async function createSqliteLicenseMandateStore(
  dbPath: string,
  options: CreateSqliteLicenseMandateStoreOptions = {},
): Promise<LicenseMandateStore> {
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
  if (tableExists(db, 'license_mandate_store_versions')) {
    const existingVersion = db.prepare(`SELECT schema_version FROM license_mandate_store_versions ORDER BY id DESC LIMIT 1`).get() as
      | { schema_version: string }
      | undefined;
    if (existingVersion !== undefined && existingVersion.schema_version !== LICENSE_MANDATE_STORE_SCHEMA_VERSION) {
      db.close();
      throw new LicenseGovernanceError(
        'LICENSE_STORE_UNAVAILABLE',
        `License Mandate Store schema version '${existingVersion.schema_version}' is not supported by this runtime (expected '${LICENSE_MANDATE_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
      );
    }
  }

  db.exec(SCHEMA_V1);

  const latestVersion = db.prepare(`SELECT schema_version FROM license_mandate_store_versions ORDER BY id DESC LIMIT 1`).get() as
    | { schema_version: string }
    | undefined;
  if (latestVersion === undefined) {
    db.prepare(`INSERT INTO license_mandate_store_versions (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`).run(
      LICENSE_MANDATE_STORE_SCHEMA_VERSION,
      now(),
    );
  } else if (latestVersion.schema_version !== LICENSE_MANDATE_STORE_SCHEMA_VERSION) {
    db.close();
    throw new LicenseGovernanceError(
      'LICENSE_STORE_UNAVAILABLE',
      `License Mandate Store schema version '${latestVersion.schema_version}' is not supported by this runtime (expected '${LICENSE_MANDATE_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
    );
  }

  const insertMandate = db.prepare(`INSERT INTO license_mandates
    (mandate_id, organization_id, status, asset_kind, asset_id, asset_tenant_id, terms_json, terms_digest, request_ref, requested_by, decision_ref, evaluation_ref,
     effective_from, expires_at, correlation_id, issuer_ref, approval_refs_json, obligation_refs_json, evidence_refs_json, audit_refs_json,
     execution_count, created_at, schema_version)
    VALUES (@mandateId, @organizationId, 'active', @assetKind, @assetId, @assetTenantId, @termsJson, @termsDigest, @requestRef, @requestedBy, @decisionRef, @evaluationRef,
     @effectiveFrom, @expiresAt, @correlationId, @issuerRef, @approvalRefsJson, @obligationRefsJson, @evidenceRefsJson, @auditRefsJson,
     0, @createdAt, @schemaVersion)`);
  const selectMandateById = db.prepare(`SELECT * FROM license_mandates WHERE mandate_id = ?`);
  const selectMandateByRequestRef = db.prepare(`SELECT * FROM license_mandates WHERE request_ref = ?`);
  const updateMandateStatus = db.prepare(`UPDATE license_mandates SET status = 'revoked' WHERE mandate_id = @mandateId AND status = 'active'`);
  const updateMandateExecutionCount = db.prepare(
    `UPDATE license_mandates SET execution_count = @executionCount WHERE mandate_id = @mandateId AND execution_count = @expectedExecutionCount`,
  );

  const insertExecution = db.prepare(`INSERT INTO license_executions
    (execution_id, mandate_id, organization_id, sequence, executed_by, executed_at, licensee_ref, rights_json, granted_uses_json, exclusivity,
     correlation_id, rights_scope_json, contexts_json, license_effective_at, license_expires_at, licensed_units_json,
     external_system, external_agreement_reference, external_acceptance_reference, external_transaction_reference, evidence_refs_json, recorded_at)
    VALUES (@executionId, @mandateId, @organizationId, @sequence, @executedBy, @executedAt, @licenseeRef, @rightsJson, @grantedUsesJson, @exclusivity,
     @correlationId, @rightsScopeJson, @contextsJson, @licenseEffectiveAt, @licenseExpiresAt, @licensedUnitsJson,
     @externalSystem, @externalAgreementReference, @externalAcceptanceReference, @externalTransactionReference, @evidenceRefsJson, @recordedAt)`);
  const selectExecutionsByMandate = db.prepare(`SELECT * FROM license_executions WHERE mandate_id = ? ORDER BY sequence ASC`);
  const selectExecutionById = db.prepare(`SELECT 1 FROM license_executions WHERE execution_id = ?`);
  const selectExecutionByIdAndMandate = db.prepare(`SELECT 1 FROM license_executions WHERE execution_id = ? AND mandate_id = ?`);

  const insertLifecycle = db.prepare(`INSERT INTO license_lifecycle_events
    (lifecycle_id, mandate_id, execution_id, organization_id, sequence, reported_by, occurred_at, lifecycle_type, correlation_id,
     external_system, external_reference, evidence_refs_json, recorded_at)
    VALUES (@lifecycleId, @mandateId, @executionId, @organizationId, @sequence, @reportedBy, @occurredAt, @lifecycleType, @correlationId,
     @externalSystem, @externalReference, @evidenceRefsJson, @recordedAt)`);
  const selectLifecycleByMandate = db.prepare(`SELECT * FROM license_lifecycle_events WHERE mandate_id = ? ORDER BY sequence ASC`);
  const selectLifecycleById = db.prepare(`SELECT 1 FROM license_lifecycle_events WHERE lifecycle_id = ?`);
  const countLifecycleByMandate = db.prepare(`SELECT COUNT(*) AS count FROM license_lifecycle_events WHERE mandate_id = ?`);

  const insertRevocation = db.prepare(`INSERT INTO license_mandate_revocations
    (revocation_id, mandate_id, organization_id, revoked_at, reason, issuer_ref, correlation_id, description, evidence_refs_json, executions_at_revocation)
    VALUES (@revocationId, @mandateId, @organizationId, @revokedAt, @reason, @issuerRef, @correlationId, @description, @evidenceRefsJson, @executionsAtRevocation)`);
  const selectRevocationByMandate = db.prepare(`SELECT * FROM license_mandate_revocations WHERE mandate_id = ?`);

  let closed = false;

  function assertOpen(): void {
    if (closed) {
      throw new LicenseGovernanceError('LICENSE_STORE_UNAVAILABLE', 'The License Mandate Store has been closed.');
    }
  }

  function loadMandate(mandateId: string): LicenseMandateRecord {
    const row = selectMandateById.get(mandateId) as MandateRow | undefined;
    if (row === undefined) {
      throw new LicenseGovernanceError('LICENSE_MANDATE_NOT_FOUND', `No license mandate for mandateId '${mandateId}'.`);
    }
    return rowToMandate(row);
  }

  /** Tenant-scoped read, identical in ordering and error taxonomy to the in-memory store's own `requireVisibleMandate`. */
  function requireVisibleMandate(context: LicenseGovernanceContext, mandateId: string): LicenseMandateRecord {
    requireLicenseTenantScope(context);
    const mandate = loadMandate(mandateId);
    if (!canAccessLicenseOrganization(context, mandate.organizationId)) {
      throw new LicenseGovernanceError(
        'LICENSE_ACCESS_SCOPE_VIOLATION',
        `The caller is not authorized to access license governance data for organization '${mandate.organizationId}'.`,
      );
    }
    return mandate;
  }

  /**
   * One synchronous commit section: append the evidence row and advance the
   * mandate's execution count together. The update is guarded on the count
   * this call read, so a concurrent writer that advanced it first loses this
   * transaction rather than silently overwriting a count computed from a stale
   * read.
   */
  const commitExecution = db.transaction((execution: LicenseExecutionRecord, sequence: number, expectedExecutionCount: number) => {
    insertExecution.run({
      executionId: execution.id,
      mandateId: execution.mandateId,
      organizationId: execution.organizationId,
      sequence,
      executedBy: execution.executedBy,
      executedAt: execution.executedAt,
      licenseeRef: execution.licenseeRef,
      rightsJson: JSON.stringify(execution.rights),
      grantedUsesJson: JSON.stringify(execution.grantedUses),
      exclusivity: execution.exclusivity,
      correlationId: execution.correlationId,
      rightsScopeJson: execution.rightsScope === undefined ? null : JSON.stringify(execution.rightsScope),
      contextsJson: execution.contexts === undefined ? null : JSON.stringify(execution.contexts),
      licenseEffectiveAt: execution.licenseEffectiveAt ?? null,
      licenseExpiresAt: execution.licenseExpiresAt ?? null,
      licensedUnitsJson: execution.licensedUnits === undefined ? null : JSON.stringify(execution.licensedUnits),
      externalSystem: execution.externalSystem ?? null,
      externalAgreementReference: execution.externalAgreementReference ?? null,
      externalAcceptanceReference: execution.externalAcceptanceReference ?? null,
      externalTransactionReference: execution.externalTransactionReference ?? null,
      evidenceRefsJson: execution.evidenceRefs === undefined ? null : JSON.stringify(execution.evidenceRefs),
      recordedAt: execution.recordedAt,
    });
    const updated = updateMandateExecutionCount.run({
      mandateId: execution.mandateId,
      executionCount: expectedExecutionCount + 1,
      expectedExecutionCount,
    });
    if (updated.changes !== 1) {
      throw new LicenseGovernanceError(
        'LICENSE_EXECUTION_ALREADY_RECORDED',
        `License mandate '${execution.mandateId}' advanced concurrently while recording execution '${execution.id}'; the execution count was not computed from a stale total.`,
      );
    }
  });

  /** One synchronous commit section: record the revocation and flip the status together, or neither. */
  const commitRevocation = db.transaction((revocation: LicenseMandateRevocationRecord) => {
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

    async issueMandate(context: LicenseGovernanceContext, input: IssueLicenseMandateInput): Promise<LicenseMandateRecord> {
      assertOpen();
      requireLicenseAccessToOrganization(context, input.organizationId);

      const effectiveFrom = requireStrictUtcLicenseTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcLicenseTimestamp(input.expiresAt, 'expiresAt');

      // A mandate may narrow what was requested; it may never widen it, and
      // it may never substitute a different licensee or bound executor.
      assertNoLicensePermissionEscalation(input.terms, input.requestedTerms);

      const serializedTerms = serializeEnterpriseLicenseTerms(input.terms);
      const candidate: LicenseMandateRecord = {
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

      const validation = validateEnterpriseLicenseMandate(toCanonicalLicenseMandate(candidate));
      if (!validation.valid) {
        throw new LicenseGovernanceError(
          'LICENSE_VALIDATION_ERROR',
          `License mandate candidate failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
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
          schemaVersion: LICENSE_MANDATE_STORE_SCHEMA_VERSION,
        });
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          // Either the mandate id is taken, or -- the invariant that matters --
          // this license request already produced a mandate and replaying it
          // must not create a second authorization.
          const existing = selectMandateByRequestRef.get(input.requestRef) as MandateRow | undefined;
          if (existing !== undefined && existing.mandate_id !== input.id) {
            throw new LicenseGovernanceError(
              'LICENSE_MANDATE_ALREADY_EXISTS',
              `License request '${input.requestRef}' has already been authorized by mandate '${existing.mandate_id}'; replaying it must not create additional licensing authority.`,
              { requestRef: input.requestRef, mandateId: existing.mandate_id },
            );
          }
          throw new LicenseGovernanceError('LICENSE_MANDATE_ALREADY_EXISTS', `A license mandate with id '${input.id}' already exists.`);
        }
        throw error;
      }

      return loadMandate(candidate.id);
    },

    async getMandate(context: LicenseGovernanceContext, mandateId: string): Promise<LicenseMandateRecord> {
      assertOpen();
      return requireVisibleMandate(context, mandateId);
    },

    async getMandateByRequestRef(context: LicenseGovernanceContext, requestRef: string): Promise<LicenseMandateRecord | null> {
      assertOpen();
      const row = selectMandateByRequestRef.get(requestRef) as MandateRow | undefined;
      if (row === undefined) return null;
      return requireVisibleMandate(context, row.mandate_id);
    },

    async recordExecution(context: LicenseGovernanceContext, input: RecordLicenseExecutionInput) {
      assertOpen();
      requireLicenseAccessToOrganization(context, input.organizationId);

      const executedAt = requireStrictUtcLicenseTimestamp(input.executedAt, 'executedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new LicenseGovernanceError(
          'LICENSE_ACCESS_SCOPE_VIOLATION',
          `License mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // Replay of an already-recorded execution must never record a second
      // grant. Checked here for a precise error, and enforced independently by
      // `execution_id PRIMARY KEY`.
      if (selectExecutionById.get(input.id) !== undefined) {
        throw new LicenseGovernanceError(
          'LICENSE_EXECUTION_ALREADY_RECORDED',
          `License execution '${input.id}' has already been recorded; replaying it would record the same grant twice.`,
        );
      }

      assertLicenseExerciseAuthorized(mandate, {
        executedBy: input.executedBy,
        licenseeRef: input.licenseeRef,
        rights: input.rights,
        grantedUses: input.grantedUses,
        exclusivity: input.exclusivity,
        executedAt,
        ...(input.rightsScope !== undefined ? { rightsScope: input.rightsScope } : {}),
        ...(input.contexts !== undefined ? { contexts: input.contexts } : {}),
        ...(input.licenseExpiresAt !== undefined ? { licenseExpiresAt: input.licenseExpiresAt } : {}),
        ...(input.licensedUnits !== undefined ? { licensedUnits: input.licensedUnits } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
      });

      const execution: LicenseExecutionRecord = {
        id: input.id,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executedBy: input.executedBy,
        executedAt,
        licenseeRef: input.licenseeRef,
        rights: [...input.rights],
        grantedUses: [...input.grantedUses],
        exclusivity: input.exclusivity,
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.rightsScope !== undefined ? { rightsScope: input.rightsScope } : {}),
        ...(input.contexts !== undefined ? { contexts: input.contexts } : {}),
        ...(input.licenseEffectiveAt !== undefined ? { licenseEffectiveAt: input.licenseEffectiveAt } : {}),
        ...(input.licenseExpiresAt !== undefined ? { licenseExpiresAt: input.licenseExpiresAt } : {}),
        ...(input.licensedUnits !== undefined ? { licensedUnits: input.licensedUnits } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
        ...(input.externalAcceptanceReference !== undefined ? { externalAcceptanceReference: input.externalAcceptanceReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      try {
        commitExecution(execution, mandate.executionCount + 1, mandate.executionCount);
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          throw new LicenseGovernanceError(
            'LICENSE_EXECUTION_ALREADY_RECORDED',
            `License execution '${input.id}' has already been recorded; replaying it would record the same grant twice.`,
          );
        }
        throw error;
      }

      return { mandate: loadMandate(mandate.id), execution };
    },

    async listExecutions(context: LicenseGovernanceContext, mandateId: string): Promise<readonly LicenseExecutionRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return (selectExecutionsByMandate.all(mandateId) as ExecutionRow[]).map(rowToExecution);
    },

    async recordLifecycleEvent(context: LicenseGovernanceContext, input: RecordLicenseLifecycleInput): Promise<LicenseLifecycleRecord> {
      assertOpen();
      requireLicenseAccessToOrganization(context, input.organizationId);

      const occurredAt = requireStrictUtcLicenseTimestamp(input.occurredAt, 'occurredAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new LicenseGovernanceError(
          'LICENSE_ACCESS_SCOPE_VIOLATION',
          `License mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // A lifecycle report ends one specific granted license. Reporting one
      // against an execution this mandate never had would be an unanchored
      // claim about the external world.
      if (selectExecutionByIdAndMandate.get(input.executionId, mandate.id) === undefined) {
        throw new LicenseGovernanceError(
          'LICENSE_EXECUTION_NOT_FOUND',
          `No license execution '${input.executionId}' recorded under mandate '${mandate.id}'; a lifecycle report must reference a license AOC has evidence of.`,
          { mandateId: mandate.id, executionId: input.executionId },
        );
      }

      if (selectLifecycleById.get(input.id) !== undefined) {
        throw new LicenseGovernanceError(
          'LICENSE_LIFECYCLE_ALREADY_RECORDED',
          `License lifecycle event '${input.id}' has already been recorded; replaying it would duplicate the evidence.`,
        );
      }

      const sequence = ((countLifecycleByMandate.get(mandate.id) as { count: number }).count ?? 0) + 1;
      const event: LicenseLifecycleRecord = {
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
        // Deliberately a single INSERT and nothing else: a reported end is an
        // observation about an external license, so there is no mandate row to
        // update. In particular `execution_count` is untouched -- AOC cannot
        // verify the license ended and must not manufacture fresh licensing
        // capacity from an unverified report.
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
          throw new LicenseGovernanceError(
            'LICENSE_LIFECYCLE_ALREADY_RECORDED',
            `License lifecycle event '${input.id}' has already been recorded; replaying it would duplicate the evidence.`,
          );
        }
        throw error;
      }

      return event;
    },

    async listLifecycleEvents(context: LicenseGovernanceContext, mandateId: string): Promise<readonly LicenseLifecycleRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return (selectLifecycleByMandate.all(mandateId) as LifecycleRow[]).map(rowToLifecycle);
    },

    async revokeMandate(context: LicenseGovernanceContext, input: RevokeLicenseMandateInput): Promise<LicenseRevokeOutcome> {
      assertOpen();
      requireLicenseAccessToOrganization(context, input.organizationId);

      const revokedAt = requireStrictUtcLicenseTimestamp(input.revokedAt, 'revokedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);

      const existingRow = selectRevocationByMandate.get(mandate.id) as RevocationRow | undefined;
      if (existingRow !== undefined) {
        return { kind: 'already-revoked', mandate, revocation: rowToRevocation(existingRow) };
      }
      assertLicenseRevocable(mandate.status);

      const revocation: LicenseMandateRevocationRecord = {
        id: input.revocationId,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt,
        reason: input.reason,
        issuerRef: input.issuerRef,
        correlationId: input.correlationId,
        // Immutable proof of how far the authorization had already been
        // exercised when authority was withdrawn. Revocation never deletes or
        // invalidates that evidence, and never claims that an external license
        // was terminated.
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
          if (raced !== undefined) {
            return { kind: 'already-revoked', mandate: loadMandate(mandate.id), revocation: rowToRevocation(raced) };
          }
        }
        throw error;
      }

      return { kind: 'revoked', mandate: loadMandate(mandate.id), revocation };
    },

    async getRevocation(context: LicenseGovernanceContext, mandateId: string): Promise<LicenseMandateRevocationRecord | null> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      const row = selectRevocationByMandate.get(mandateId) as RevocationRow | undefined;
      return row === undefined ? null : rowToRevocation(row);
    },

    async health(): Promise<LicenseMandateStoreHealth> {
      const readable = !closed && db.open;
      return {
        status: readable ? 'healthy' : 'unhealthy',
        readable,
        writable: readable,
        schemaVersion: LICENSE_MANDATE_STORE_SCHEMA_VERSION,
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
