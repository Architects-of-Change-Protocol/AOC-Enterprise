import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { AccessGovernanceError } from './errors.js';
import { requireAccessGrantAccessToOrganization } from './access-grant-store.js';
import type { AccessGrantStore } from './access-grant-store.js';
import { ACCESS_GRANT_STORE_SCHEMA_VERSION } from './in-memory-access-grant-store.js';
import { createPendingEnforcementResult } from './contracts.js';
import type {
  AccessGovernanceContext,
  AccessGrantProviderEnforcementResult,
  AccessGrantRecord,
  AccessGrantRevocationRecord,
  AccessGrantStoreHealth,
  BeginRevocationInput,
  FinalizeRevocationEnforcementInput,
  IssueAccessGrantInput,
  ProviderActionResult,
  RecordProviderCredentialIssuanceInput,
  RevokeOutcome,
} from './contracts.js';

export interface CreateSqliteAccessGrantStoreOptions {
  readonly now?: () => string;
  readonly busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Schema (`aoc.access-grant-store.schema.v1`). Two tables, current-state
// (never event-sourced — this module's lifecycle has exactly one transition,
// active -> revoked, unlike Passport's six-status machine): `access_grants`
// is the durable grant row, `access_grant_revocations` is the durable,
// at-most-one-per-grant revocation + provider-enforcement row, enforced by
// `grant_id UNIQUE` at the database layer in addition to the application
// check performed before insert (mirrors `../passport/sqlite-passport-store.ts`'s
// partial-unique-index pattern for its own "at most one active" invariant).
// ---------------------------------------------------------------------------
const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS access_grant_store_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL,
    migration_state TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS access_grants (
    grant_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    status TEXT NOT NULL,
    resource_kind TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    decision_ref TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    issuer_ref TEXT,
    provider_system TEXT,
    provider_cid TEXT,
    provider_file_id TEXT,
    latest_outstanding_credential_expires_at TEXT,
    created_at TEXT NOT NULL,
    schema_version TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_access_grants_org ON access_grants(organization_id);

  CREATE TABLE IF NOT EXISTS access_grant_revocations (
    revocation_id TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL UNIQUE REFERENCES access_grants(grant_id),
    organization_id TEXT NOT NULL,
    revoked_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    issuer_ref TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    description TEXT,
    evidence_refs_json TEXT,
    revocation_requested_at TEXT NOT NULL,
    provider_system TEXT,
    provider_action TEXT,
    provider_action_attempted_at TEXT,
    provider_action_result TEXT NOT NULL,
    provider_action_detail TEXT NOT NULL,
    effective_revocation_mode TEXT NOT NULL,
    effective_revocation_at TEXT,
    enforcement_lag_seconds REAL,
    outstanding_credential_expires_at TEXT,
    measured INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_access_grant_revocations_org ON access_grant_revocations(organization_id);
`;

interface GrantRow {
  readonly grant_id: string;
  readonly organization_id: string;
  readonly status: string;
  readonly resource_kind: string;
  readonly resource_id: string;
  readonly principal_id: string;
  readonly decision_ref: string;
  readonly issued_at: string;
  readonly expires_at: string;
  readonly correlation_id: string;
  readonly issuer_ref: string | null;
  readonly provider_system: string | null;
  readonly provider_cid: string | null;
  readonly provider_file_id: string | null;
  readonly latest_outstanding_credential_expires_at: string | null;
  readonly created_at: string;
}

interface RevocationRow {
  readonly revocation_id: string;
  readonly grant_id: string;
  readonly organization_id: string;
  readonly revoked_at: string;
  readonly reason: string;
  readonly issuer_ref: string;
  readonly correlation_id: string;
  readonly description: string | null;
  readonly evidence_refs_json: string | null;
  readonly revocation_requested_at: string;
  readonly provider_system: string | null;
  readonly provider_action: string | null;
  readonly provider_action_attempted_at: string | null;
  readonly provider_action_result: string;
  readonly provider_action_detail: string;
  readonly effective_revocation_mode: string;
  readonly effective_revocation_at: string | null;
  readonly enforcement_lag_seconds: number | null;
  readonly outstanding_credential_expires_at: string | null;
  readonly measured: number;
}

function rowToGrant(row: GrantRow): AccessGrantRecord {
  return {
    id: row.grant_id,
    organizationId: row.organization_id,
    status: row.status as AccessGrantRecord['status'],
    resource: { kind: row.resource_kind, id: row.resource_id },
    principalId: row.principal_id,
    decisionRef: row.decision_ref,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    ...(row.issuer_ref !== null ? { issuerRef: row.issuer_ref } : {}),
    ...(row.provider_system !== null ? { providerSystem: row.provider_system } : {}),
    ...(row.provider_cid !== null ? { providerCid: row.provider_cid } : {}),
    ...(row.provider_file_id !== null ? { providerFileId: row.provider_file_id } : {}),
    ...(row.latest_outstanding_credential_expires_at !== null ? { latestOutstandingCredentialExpiresAt: row.latest_outstanding_credential_expires_at } : {}),
  };
}

function rowToRevocation(row: RevocationRow): AccessGrantRevocationRecord {
  const enforcement: AccessGrantProviderEnforcementResult = {
    revocationRequestedAt: row.revocation_requested_at,
    providerActionResult: row.provider_action_result as ProviderActionResult,
    providerActionDetail: row.provider_action_detail,
    effectiveRevocationMode: row.effective_revocation_mode as AccessGrantProviderEnforcementResult['effectiveRevocationMode'],
    measured: row.measured === 1,
    ...(row.provider_system !== null ? { providerSystem: row.provider_system } : {}),
    ...(row.provider_action !== null ? { providerAction: row.provider_action } : {}),
    ...(row.provider_action_attempted_at !== null ? { providerActionAttemptedAt: row.provider_action_attempted_at } : {}),
    ...(row.effective_revocation_at !== null ? { effectiveRevocationAt: row.effective_revocation_at } : {}),
    ...(row.enforcement_lag_seconds !== null ? { enforcementLagSeconds: row.enforcement_lag_seconds } : {}),
    ...(row.outstanding_credential_expires_at !== null ? { outstandingCredentialExpiresAt: row.outstanding_credential_expires_at } : {}),
  };

  return {
    id: row.revocation_id,
    grantId: row.grant_id,
    organizationId: row.organization_id,
    revokedAt: row.revoked_at,
    reason: row.reason,
    issuerRef: row.issuer_ref,
    correlationId: row.correlation_id,
    enforcement,
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.evidence_refs_json !== null ? { evidenceRefs: JSON.parse(row.evidence_refs_json) as readonly string[] } : {}),
  };
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

function laterExpiry(a: string | null, b: string): string {
  if (a === null) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * SQLite-backed `AccessGrantStore`, `better-sqlite3` loaded lazily,
 * hand-written SQL — mirrors `createSqlitePassportStore`
 * (`../passport/sqlite-passport-store.ts`) in pragmas, schema-version
 * guarding, and transaction discipline. Every mutating call runs inside one
 * synchronous `db.transaction(...)`: better-sqlite3 is synchronous, so no
 * other in-process caller can interleave, and `grant_id UNIQUE` on
 * `access_grant_revocations` plus the `status = 'active'` guard on the
 * revoking `UPDATE` serialize cross-process writers too (concurrency-safe
 * state transition).
 */
export async function createSqliteAccessGrantStore(dbPath: string, options: CreateSqliteAccessGrantStoreOptions = {}): Promise<AccessGrantStore> {
  const { default: Database } = await import('better-sqlite3');

  const now = options.now ?? (() => new Date().toISOString());

  const path = dbPath === ':memory:' ? ':memory:' : resolveOnDisk(dbPath);
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma(`busy_timeout = ${resolveBusyTimeoutMs(options.busyTimeoutMs)}`);

  if (tableExists(db, 'access_grant_store_versions')) {
    const existingVersion = db.prepare(`SELECT schema_version FROM access_grant_store_versions ORDER BY id DESC LIMIT 1`).get() as { schema_version: string } | undefined;
    if (existingVersion !== undefined && existingVersion.schema_version !== ACCESS_GRANT_STORE_SCHEMA_VERSION) {
      db.close();
      throw new AccessGovernanceError(
        'ACCESS_GRANT_STORE_UNAVAILABLE',
        `Access Grant Store schema version '${existingVersion.schema_version}' is not supported by this runtime (expected '${ACCESS_GRANT_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
      );
    }
  }

  db.exec(SCHEMA_V1);

  const latestVersion = db.prepare(`SELECT schema_version FROM access_grant_store_versions ORDER BY id DESC LIMIT 1`).get() as { schema_version: string } | undefined;
  if (latestVersion === undefined) {
    db.prepare(`INSERT INTO access_grant_store_versions (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`).run(ACCESS_GRANT_STORE_SCHEMA_VERSION, now());
  } else if (latestVersion.schema_version !== ACCESS_GRANT_STORE_SCHEMA_VERSION) {
    db.close();
    throw new AccessGovernanceError(
      'ACCESS_GRANT_STORE_UNAVAILABLE',
      `Access Grant Store schema version '${latestVersion.schema_version}' is not supported by this runtime (expected '${ACCESS_GRANT_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
    );
  }

  const insertGrant = db.prepare(`INSERT INTO access_grants
    (grant_id, organization_id, status, resource_kind, resource_id, principal_id, decision_ref, issued_at, expires_at, correlation_id, issuer_ref, provider_system, provider_cid, provider_file_id, latest_outstanding_credential_expires_at, created_at, schema_version)
    VALUES (@grantId, @organizationId, 'active', @resourceKind, @resourceId, @principalId, @decisionRef, @issuedAt, @expiresAt, @correlationId, @issuerRef, @providerSystem, @providerCid, @providerFileId, NULL, @createdAt, @schemaVersion)`);
  const selectGrantById = db.prepare(`SELECT * FROM access_grants WHERE grant_id = ?`);
  const updateGrantStatus = db.prepare(`UPDATE access_grants SET status = 'revoked' WHERE grant_id = @grantId AND status = 'active'`);
  const updateGrantOutstandingExpiry = db.prepare(`UPDATE access_grants SET latest_outstanding_credential_expires_at = @expiresAt WHERE grant_id = @grantId`);
  const insertRevocation = db.prepare(`INSERT INTO access_grant_revocations
    (revocation_id, grant_id, organization_id, revoked_at, reason, issuer_ref, correlation_id, description, evidence_refs_json, revocation_requested_at, provider_system, provider_action, provider_action_attempted_at, provider_action_result, provider_action_detail, effective_revocation_mode, effective_revocation_at, enforcement_lag_seconds, outstanding_credential_expires_at, measured)
    VALUES (@revocationId, @grantId, @organizationId, @revokedAt, @reason, @issuerRef, @correlationId, @description, @evidenceRefsJson, @revocationRequestedAt, @providerSystem, @providerAction, @providerActionAttemptedAt, @providerActionResult, @providerActionDetail, @effectiveRevocationMode, @effectiveRevocationAt, @enforcementLagSeconds, @outstandingCredentialExpiresAt, @measured)`);
  const selectRevocationByGrantId = db.prepare(`SELECT * FROM access_grant_revocations WHERE grant_id = ?`);
  const updateRevocationEnforcement = db.prepare(`UPDATE access_grant_revocations SET
    provider_system = @providerSystem, provider_action = @providerAction, provider_action_attempted_at = @providerActionAttemptedAt,
    provider_action_result = @providerActionResult, provider_action_detail = @providerActionDetail,
    effective_revocation_mode = @effectiveRevocationMode, effective_revocation_at = @effectiveRevocationAt,
    enforcement_lag_seconds = @enforcementLagSeconds, outstanding_credential_expires_at = @outstandingCredentialExpiresAt, measured = @measured
    WHERE grant_id = @grantId`);

  let closed = false;

  function assertOpen(): void {
    if (closed) throw new AccessGovernanceError('ACCESS_GRANT_STORE_UNAVAILABLE', 'The Access Grant Store has been closed.');
  }

  function loadGrant(grantId: string): AccessGrantRecord {
    const row = selectGrantById.get(grantId) as GrantRow | undefined;
    if (row === undefined) throw new AccessGovernanceError('ACCESS_GRANT_NOT_FOUND', `No Access Grant for grantId '${grantId}'.`);
    return rowToGrant(row);
  }

  return {
    providerKind: 'sqlite',

    async issueGrant(context: AccessGovernanceContext, input: IssueAccessGrantInput): Promise<AccessGrantRecord> {
      assertOpen();
      requireAccessGrantAccessToOrganization(context, input.organizationId);

      try {
        insertGrant.run({
          grantId: input.id,
          organizationId: input.organizationId,
          resourceKind: input.resource.kind,
          resourceId: input.resource.id,
          principalId: input.principalId,
          decisionRef: input.decisionRef,
          issuedAt: input.issuedAt,
          expiresAt: input.expiresAt,
          correlationId: input.correlationId,
          issuerRef: input.issuerRef ?? null,
          providerSystem: input.providerSystem ?? null,
          providerCid: input.providerCid ?? null,
          providerFileId: input.providerFileId ?? null,
          createdAt: now(),
          schemaVersion: ACCESS_GRANT_STORE_SCHEMA_VERSION,
        });
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          throw new AccessGovernanceError('ACCESS_GRANT_ALREADY_EXISTS', `An Access Grant with id '${input.id}' already exists.`);
        }
        throw error;
      }

      return loadGrant(input.id);
    },

    async getGrant(context: AccessGovernanceContext, grantId: string): Promise<AccessGrantRecord> {
      assertOpen();
      const grant = loadGrant(grantId);
      requireAccessGrantAccessToOrganization(context, grant.organizationId);
      return grant;
    },

    async beginRevocation(context: AccessGovernanceContext, input: BeginRevocationInput): Promise<RevokeOutcome> {
      assertOpen();

      const runBegin = db.transaction((): RevokeOutcome => {
        const grant = loadGrant(input.grantId);
        requireAccessGrantAccessToOrganization(context, grant.organizationId);
        if (grant.organizationId !== input.organizationId) {
          throw new AccessGovernanceError('ACCESS_GRANT_ACCESS_SCOPE_VIOLATION', `Revocation organizationId '${input.organizationId}' does not match grant '${grant.id}' organization '${grant.organizationId}'.`);
        }

        const existingRow = selectRevocationByGrantId.get(grant.id) as RevocationRow | undefined;
        if (existingRow !== undefined) {
          return { kind: 'already-revoked', grant, revocation: rowToRevocation(existingRow) };
        }

        const changes = updateGrantStatus.run({ grantId: grant.id }).changes;
        if (changes === 0) {
          // Raced with a concurrent revoker between our read and this
          // UPDATE (or the row was mutated outside this transition) —
          // the grant is no longer 'active'; the only valid re-read is
          // "already revoked" (this module has no other status).
          const revocationRow = selectRevocationByGrantId.get(grant.id) as RevocationRow | undefined;
          if (revocationRow === undefined) {
            throw new AccessGovernanceError('ACCESS_GRANT_STORE_UNAVAILABLE', `Concurrent revocation of grant '${grant.id}' could not be resolved.`);
          }
          return { kind: 'already-revoked', grant: { ...grant, status: 'revoked' }, revocation: rowToRevocation(revocationRow) };
        }

        const enforcement = createPendingEnforcementResult(input.revokedAt);
        insertRevocation.run({
          revocationId: input.revocationId,
          grantId: grant.id,
          organizationId: grant.organizationId,
          revokedAt: input.revokedAt,
          reason: input.reason,
          issuerRef: input.issuerRef,
          correlationId: input.correlationId,
          description: input.description ?? null,
          evidenceRefsJson: input.evidenceRefs !== undefined ? JSON.stringify(input.evidenceRefs) : null,
          revocationRequestedAt: enforcement.revocationRequestedAt,
          providerSystem: enforcement.providerSystem ?? null,
          providerAction: enforcement.providerAction ?? null,
          providerActionAttemptedAt: enforcement.providerActionAttemptedAt ?? null,
          providerActionResult: enforcement.providerActionResult,
          providerActionDetail: enforcement.providerActionDetail,
          effectiveRevocationMode: enforcement.effectiveRevocationMode,
          effectiveRevocationAt: enforcement.effectiveRevocationAt ?? null,
          enforcementLagSeconds: enforcement.enforcementLagSeconds ?? null,
          outstandingCredentialExpiresAt: enforcement.outstandingCredentialExpiresAt ?? null,
          measured: enforcement.measured ? 1 : 0,
        });

        // By the time this transaction commits, `access_grants.status` is
        // already 'revoked' — no provider has been contacted yet, so
        // future-issuance blocking (`assertActive` in `lifecycle.ts`) is
        // durable before any provider enforcement is even attempted.
        return { kind: 'revoked', grant: { ...grant, status: 'revoked' }, revocation: rowToRevocation(selectRevocationByGrantId.get(grant.id) as RevocationRow) };
      });

      return runBegin();
    },

    async finalizeRevocationEnforcement(context: AccessGovernanceContext, input: FinalizeRevocationEnforcementInput): Promise<AccessGrantRevocationRecord> {
      assertOpen();

      const runFinalize = db.transaction((): AccessGrantRevocationRecord => {
        const grant = loadGrant(input.grantId);
        requireAccessGrantAccessToOrganization(context, grant.organizationId);
        if (grant.organizationId !== input.organizationId) {
          throw new AccessGovernanceError('ACCESS_GRANT_ACCESS_SCOPE_VIOLATION', `Enforcement organizationId '${input.organizationId}' does not match grant '${grant.id}' organization '${grant.organizationId}'.`);
        }
        const existingRow = selectRevocationByGrantId.get(grant.id) as RevocationRow | undefined;
        if (existingRow === undefined) {
          throw new AccessGovernanceError('ACCESS_GRANT_NOT_FOUND', `No revocation is in progress for grant '${grant.id}'; call beginRevocation first.`);
        }

        const enforcement = input.enforcement;
        updateRevocationEnforcement.run({
          grantId: grant.id,
          providerSystem: enforcement.providerSystem ?? null,
          providerAction: enforcement.providerAction ?? null,
          providerActionAttemptedAt: enforcement.providerActionAttemptedAt ?? null,
          providerActionResult: enforcement.providerActionResult,
          providerActionDetail: enforcement.providerActionDetail,
          effectiveRevocationMode: enforcement.effectiveRevocationMode,
          effectiveRevocationAt: enforcement.effectiveRevocationAt ?? null,
          enforcementLagSeconds: enforcement.enforcementLagSeconds ?? null,
          outstandingCredentialExpiresAt: enforcement.outstandingCredentialExpiresAt ?? null,
          measured: enforcement.measured ? 1 : 0,
        });

        return rowToRevocation(selectRevocationByGrantId.get(grant.id) as RevocationRow);
      });

      return runFinalize();
    },

    async getRevocation(context: AccessGovernanceContext, grantId: string): Promise<AccessGrantRevocationRecord | null> {
      assertOpen();
      const grant = loadGrant(grantId);
      requireAccessGrantAccessToOrganization(context, grant.organizationId);
      const row = selectRevocationByGrantId.get(grantId) as RevocationRow | undefined;
      return row === undefined ? null : rowToRevocation(row);
    },

    async recordProviderCredentialIssuance(context: AccessGovernanceContext, input: RecordProviderCredentialIssuanceInput): Promise<AccessGrantRecord> {
      assertOpen();

      const runRecord = db.transaction((): AccessGrantRecord => {
        const grant = loadGrant(input.grantId);
        requireAccessGrantAccessToOrganization(context, grant.organizationId);
        if (grant.organizationId !== input.organizationId) {
          throw new AccessGovernanceError('ACCESS_GRANT_ACCESS_SCOPE_VIOLATION', `Credential-issuance organizationId '${input.organizationId}' does not match grant '${grant.id}' organization '${grant.organizationId}'.`);
        }

        const row = selectGrantById.get(grant.id) as GrantRow;
        const nextExpiry = laterExpiry(row.latest_outstanding_credential_expires_at, input.expiresAt);
        updateGrantOutstandingExpiry.run({ grantId: grant.id, expiresAt: nextExpiry });
        return loadGrant(grant.id);
      });

      return runRecord();
    },

    async health(): Promise<AccessGrantStoreHealth> {
      let readable = false;
      let writable = false;
      try {
        db.prepare(`SELECT schema_version FROM access_grant_store_versions ORDER BY id DESC LIMIT 1`).get();
        readable = true;
        writable = !closed;
      } catch {
        readable = false;
      }
      return {
        status: closed || !readable || !writable ? 'unhealthy' : 'healthy',
        readable,
        writable,
        schemaVersion: ACCESS_GRANT_STORE_SCHEMA_VERSION,
        checkedAt: now(),
      };
    },

    async close(): Promise<void> {
      if (!closed) {
        closed = true;
        db.close();
      }
    },
  };
}
