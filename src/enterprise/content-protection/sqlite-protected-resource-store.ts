import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { ContentProtectionError } from './errors.js';
import { requireContentProtectionAccessToOrganization } from './protected-resource-store.js';
import type { ProtectedResourceStore } from './protected-resource-store.js';
import { CONTENT_PROTECTION_STORE_SCHEMA_VERSION } from './in-memory-protected-resource-store.js';
import type {
  ContentProtectionContext,
  CreatePendingProtectedResourceInput,
  MarkProtectedResourceActiveInput,
  MarkProtectedResourceFailedInput,
  MarkProtectedResourceOrphanedInput,
  ProtectedResourceRecord,
  ProtectedResourceStoreHealth,
} from './contracts.js';

export interface CreateSqliteProtectedResourceStoreOptions {
  readonly now?: () => string;
  readonly busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Schema (`aoc.content-protection-store.schema.v1`). One table,
// current-state (never event-sourced) -- this module's lifecycle
// (`pending -> active | failed | orphaned`) is a single-transition state
// machine per record, exactly like `../access-governance/`'s
// `access_grants` table.
// ---------------------------------------------------------------------------
const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS content_protection_store_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL,
    migration_state TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS protected_resources (
    protected_resource_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    state TEXT NOT NULL,
    resource_kind TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    encryption_profile TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    requested_sovereign_asset_id TEXT,
    plaintext_digest TEXT,
    ciphertext_digest TEXT,
    nonce TEXT,
    auth_tag TEXT,
    wrapped_key_kind TEXT,
    wrapped_key_profile TEXT,
    wrapped_key_reference TEXT,
    wrapped_key_dek TEXT,
    wrapped_key_nonce TEXT,
    wrapped_key_auth_tag TEXT,
    storage_provider_system TEXT,
    storage_provider_ref TEXT,
    storage_stored_at TEXT,
    storage_size_bytes INTEGER,
    sovereign_asset_id TEXT,
    sovereign_version TEXT,
    sovereign_content_digest TEXT,
    sovereign_verified_at TEXT,
    failure_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    schema_version TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_protected_resources_org ON protected_resources(organization_id);
`;

interface ProtectedResourceRow {
  readonly protected_resource_id: string;
  readonly organization_id: string;
  readonly state: string;
  readonly resource_kind: string;
  readonly resource_id: string;
  readonly encryption_profile: string;
  readonly correlation_id: string;
  readonly requested_sovereign_asset_id: string | null;
  readonly plaintext_digest: string | null;
  readonly ciphertext_digest: string | null;
  readonly nonce: string | null;
  readonly auth_tag: string | null;
  readonly wrapped_key_kind: string | null;
  readonly wrapped_key_profile: string | null;
  readonly wrapped_key_reference: string | null;
  readonly wrapped_key_dek: string | null;
  readonly wrapped_key_nonce: string | null;
  readonly wrapped_key_auth_tag: string | null;
  readonly storage_provider_system: string | null;
  readonly storage_provider_ref: string | null;
  readonly storage_stored_at: string | null;
  readonly storage_size_bytes: number | null;
  readonly sovereign_asset_id: string | null;
  readonly sovereign_version: string | null;
  readonly sovereign_content_digest: string | null;
  readonly sovereign_verified_at: string | null;
  readonly failure_reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function rowToRecord(row: ProtectedResourceRow): ProtectedResourceRecord {
  const wrappedKey =
    row.wrapped_key_kind !== null && row.wrapped_key_profile !== null && row.wrapped_key_dek !== null && row.wrapped_key_nonce !== null && row.wrapped_key_auth_tag !== null
      ? {
          kind: row.wrapped_key_kind,
          profile: row.wrapped_key_profile,
          wrappedDek: row.wrapped_key_dek,
          nonce: row.wrapped_key_nonce,
          authTag: row.wrapped_key_auth_tag,
          ...(row.wrapped_key_reference !== null ? { keyReference: row.wrapped_key_reference } : {}),
        }
      : undefined;

  const storageRef =
    row.storage_provider_system !== null && row.storage_provider_ref !== null && row.storage_stored_at !== null && row.storage_size_bytes !== null
      ? { providerSystem: row.storage_provider_system, providerRef: row.storage_provider_ref, storedAt: row.storage_stored_at, sizeBytes: row.storage_size_bytes }
      : undefined;

  const sovereignBinding =
    row.sovereign_asset_id !== null && row.sovereign_content_digest !== null && row.sovereign_verified_at !== null
      ? {
          sovereignAssetId: row.sovereign_asset_id,
          contentDigest: row.sovereign_content_digest,
          verifiedAt: row.sovereign_verified_at,
          ...(row.sovereign_version !== null ? { sovereignVersion: row.sovereign_version } : {}),
        }
      : undefined;

  return {
    protectedResourceId: row.protected_resource_id,
    organizationId: row.organization_id,
    state: row.state as ProtectedResourceRecord['state'],
    resource: { kind: row.resource_kind, id: row.resource_id },
    encryptionProfile: row.encryption_profile,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.plaintext_digest !== null ? { plaintextDigest: row.plaintext_digest } : {}),
    ...(row.ciphertext_digest !== null ? { ciphertextDigest: row.ciphertext_digest } : {}),
    ...(row.nonce !== null ? { nonce: row.nonce } : {}),
    ...(row.auth_tag !== null ? { authTag: row.auth_tag } : {}),
    ...(wrappedKey !== undefined ? { wrappedKey } : {}),
    ...(storageRef !== undefined ? { storageRef } : {}),
    ...(sovereignBinding !== undefined ? { sovereignBinding } : {}),
    ...(row.failure_reason !== null ? { failureReason: row.failure_reason } : {}),
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

/**
 * SQLite-backed `ProtectedResourceStore`, `better-sqlite3` loaded lazily,
 * hand-written SQL — mirrors `createSqliteAccessGrantStore`
 * (`../access-governance/sqlite-access-grant-store.ts`) in pragmas,
 * schema-version guarding, and transaction discipline. Every mutating call
 * runs inside one synchronous `db.transaction(...)`.
 *
 * Never stores a raw DEK: only `wrapped_key_dek` (the AEAD-wrapped
 * ciphertext of the DEK, produced by a `KeyWrappingPort`) is persisted,
 * exactly mirroring `wrappedDek` in `key-wrapping-port.ts`'s own invariant.
 */
export async function createSqliteProtectedResourceStore(dbPath: string, options: CreateSqliteProtectedResourceStoreOptions = {}): Promise<ProtectedResourceStore> {
  const { default: Database } = await import('better-sqlite3');

  const now = options.now ?? (() => new Date().toISOString());

  const path = dbPath === ':memory:' ? ':memory:' : resolveOnDisk(dbPath);
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma(`busy_timeout = ${resolveBusyTimeoutMs(options.busyTimeoutMs)}`);

  if (tableExists(db, 'content_protection_store_versions')) {
    const existingVersion = db.prepare(`SELECT schema_version FROM content_protection_store_versions ORDER BY id DESC LIMIT 1`).get() as { schema_version: string } | undefined;
    if (existingVersion !== undefined && existingVersion.schema_version !== CONTENT_PROTECTION_STORE_SCHEMA_VERSION) {
      db.close();
      throw new ContentProtectionError(
        'CONTENT_PROTECTION_STORE_UNAVAILABLE',
        `Content Protection Store schema version '${existingVersion.schema_version}' is not supported by this runtime (expected '${CONTENT_PROTECTION_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
      );
    }
  }

  db.exec(SCHEMA_V1);

  const latestVersion = db.prepare(`SELECT schema_version FROM content_protection_store_versions ORDER BY id DESC LIMIT 1`).get() as { schema_version: string } | undefined;
  if (latestVersion === undefined) {
    db.prepare(`INSERT INTO content_protection_store_versions (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`).run(CONTENT_PROTECTION_STORE_SCHEMA_VERSION, now());
  } else if (latestVersion.schema_version !== CONTENT_PROTECTION_STORE_SCHEMA_VERSION) {
    db.close();
    throw new ContentProtectionError(
      'CONTENT_PROTECTION_STORE_UNAVAILABLE',
      `Content Protection Store schema version '${latestVersion.schema_version}' is not supported by this runtime (expected '${CONTENT_PROTECTION_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
    );
  }

  const insertPending = db.prepare(`INSERT INTO protected_resources
    (protected_resource_id, organization_id, state, resource_kind, resource_id, encryption_profile, correlation_id, requested_sovereign_asset_id, created_at, updated_at, schema_version)
    VALUES (@protectedResourceId, @organizationId, 'pending', @resourceKind, @resourceId, @encryptionProfile, @correlationId, @requestedSovereignAssetId, @createdAt, @updatedAt, @schemaVersion)`);
  const selectById = db.prepare(`SELECT * FROM protected_resources WHERE protected_resource_id = ?`);
  const updateActive = db.prepare(`UPDATE protected_resources SET
    state = 'active', plaintext_digest = @plaintextDigest, ciphertext_digest = @ciphertextDigest, nonce = @nonce, auth_tag = @authTag,
    wrapped_key_kind = @wrappedKeyKind, wrapped_key_profile = @wrappedKeyProfile, wrapped_key_reference = @wrappedKeyReference,
    wrapped_key_dek = @wrappedKeyDek, wrapped_key_nonce = @wrappedKeyNonce, wrapped_key_auth_tag = @wrappedKeyAuthTag,
    storage_provider_system = @storageProviderSystem, storage_provider_ref = @storageProviderRef, storage_stored_at = @storageStoredAt, storage_size_bytes = @storageSizeBytes,
    sovereign_asset_id = @sovereignAssetId, sovereign_version = @sovereignVersion, sovereign_content_digest = @sovereignContentDigest, sovereign_verified_at = @sovereignVerifiedAt,
    updated_at = @updatedAt
    WHERE protected_resource_id = @protectedResourceId AND state = 'pending'`);
  const updateFailed = db.prepare(`UPDATE protected_resources SET state = 'failed', failure_reason = @reason, updated_at = @updatedAt WHERE protected_resource_id = @protectedResourceId AND state = 'pending'`);
  const updateOrphaned = db.prepare(`UPDATE protected_resources SET
    state = 'orphaned', failure_reason = @reason, updated_at = @updatedAt,
    storage_provider_system = @storageProviderSystem, storage_provider_ref = @storageProviderRef, storage_stored_at = @storageStoredAt, storage_size_bytes = @storageSizeBytes
    WHERE protected_resource_id = @protectedResourceId AND state = 'pending'`);

  let closed = false;

  function assertOpen(): void {
    if (closed) throw new ContentProtectionError('CONTENT_PROTECTION_STORE_UNAVAILABLE', 'The Content Protection Store has been closed.');
  }

  function loadRecord(protectedResourceId: string): ProtectedResourceRecord {
    const row = selectById.get(protectedResourceId) as ProtectedResourceRow | undefined;
    if (row === undefined) throw new ContentProtectionError('CONTENT_PROTECTION_NOT_FOUND', `No ProtectedResource for protectedResourceId '${protectedResourceId}'.`);
    return rowToRecord(row);
  }

  function requirePendingRow(context: ContentProtectionContext, protectedResourceId: string, organizationId: string): ProtectedResourceRecord {
    const record = loadRecord(protectedResourceId);
    requireContentProtectionAccessToOrganization(context, record.organizationId);
    if (record.organizationId !== organizationId) {
      throw new ContentProtectionError('CONTENT_PROTECTION_ACCESS_SCOPE_VIOLATION', `organizationId '${organizationId}' does not match ProtectedResource '${record.protectedResourceId}' organization '${record.organizationId}'.`);
    }
    if (record.state !== 'pending') {
      throw new ContentProtectionError('CONTENT_PROTECTION_INVALID_STATE_TRANSITION', `ProtectedResource '${record.protectedResourceId}' is '${record.state}', not 'pending'; no further state transition is permitted.`);
    }
    return record;
  }

  return {
    providerKind: 'sqlite',

    async createPending(context: ContentProtectionContext, input: CreatePendingProtectedResourceInput): Promise<ProtectedResourceRecord> {
      assertOpen();
      requireContentProtectionAccessToOrganization(context, input.organizationId);

      const timestamp = now();
      try {
        insertPending.run({
          protectedResourceId: input.protectedResourceId,
          organizationId: input.organizationId,
          resourceKind: input.resource.kind,
          resourceId: input.resource.id,
          encryptionProfile: input.encryptionProfile,
          correlationId: input.correlationId,
          requestedSovereignAssetId: input.requestedSovereignAssetId ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
          schemaVersion: CONTENT_PROTECTION_STORE_SCHEMA_VERSION,
        });
      } catch (error) {
        if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
          throw new ContentProtectionError('CONTENT_PROTECTION_ALREADY_EXISTS', `A ProtectedResource with id '${input.protectedResourceId}' already exists.`);
        }
        throw error;
      }

      return loadRecord(input.protectedResourceId);
    },

    async getProtectedResource(context: ContentProtectionContext, protectedResourceId: string): Promise<ProtectedResourceRecord> {
      assertOpen();
      const record = loadRecord(protectedResourceId);
      requireContentProtectionAccessToOrganization(context, record.organizationId);
      return record;
    },

    async markActive(context: ContentProtectionContext, input: MarkProtectedResourceActiveInput): Promise<ProtectedResourceRecord> {
      assertOpen();

      const run = db.transaction((): ProtectedResourceRecord => {
        requirePendingRow(context, input.protectedResourceId, input.organizationId);

        const changes = updateActive.run({
          protectedResourceId: input.protectedResourceId,
          plaintextDigest: input.plaintextDigest,
          ciphertextDigest: input.ciphertextDigest,
          nonce: input.nonce,
          authTag: input.authTag,
          wrappedKeyKind: input.wrappedKey.kind,
          wrappedKeyProfile: input.wrappedKey.profile,
          wrappedKeyReference: input.wrappedKey.keyReference ?? null,
          wrappedKeyDek: input.wrappedKey.wrappedDek,
          wrappedKeyNonce: input.wrappedKey.nonce,
          wrappedKeyAuthTag: input.wrappedKey.authTag,
          storageProviderSystem: input.storageRef.providerSystem,
          storageProviderRef: input.storageRef.providerRef,
          storageStoredAt: input.storageRef.storedAt,
          storageSizeBytes: input.storageRef.sizeBytes,
          sovereignAssetId: input.sovereignBinding?.sovereignAssetId ?? null,
          sovereignVersion: input.sovereignBinding?.sovereignVersion ?? null,
          sovereignContentDigest: input.sovereignBinding?.contentDigest ?? null,
          sovereignVerifiedAt: input.sovereignBinding?.verifiedAt ?? null,
          updatedAt: now(),
        }).changes;
        if (changes === 0) {
          throw new ContentProtectionError('CONTENT_PROTECTION_STORE_UNAVAILABLE', `Concurrent transition of ProtectedResource '${input.protectedResourceId}' could not be resolved.`);
        }

        return loadRecord(input.protectedResourceId);
      });

      return run();
    },

    async markFailed(context: ContentProtectionContext, input: MarkProtectedResourceFailedInput): Promise<ProtectedResourceRecord> {
      assertOpen();

      const run = db.transaction((): ProtectedResourceRecord => {
        requirePendingRow(context, input.protectedResourceId, input.organizationId);
        const changes = updateFailed.run({ protectedResourceId: input.protectedResourceId, reason: input.reason, updatedAt: now() }).changes;
        if (changes === 0) {
          throw new ContentProtectionError('CONTENT_PROTECTION_STORE_UNAVAILABLE', `Concurrent transition of ProtectedResource '${input.protectedResourceId}' could not be resolved.`);
        }
        return loadRecord(input.protectedResourceId);
      });

      return run();
    },

    async markOrphaned(context: ContentProtectionContext, input: MarkProtectedResourceOrphanedInput): Promise<ProtectedResourceRecord> {
      assertOpen();

      const run = db.transaction((): ProtectedResourceRecord => {
        requirePendingRow(context, input.protectedResourceId, input.organizationId);
        const changes = updateOrphaned.run({
          protectedResourceId: input.protectedResourceId,
          reason: input.reason,
          updatedAt: now(),
          storageProviderSystem: input.storageRef.providerSystem,
          storageProviderRef: input.storageRef.providerRef,
          storageStoredAt: input.storageRef.storedAt,
          storageSizeBytes: input.storageRef.sizeBytes,
        }).changes;
        if (changes === 0) {
          throw new ContentProtectionError('CONTENT_PROTECTION_STORE_UNAVAILABLE', `Concurrent transition of ProtectedResource '${input.protectedResourceId}' could not be resolved.`);
        }
        return loadRecord(input.protectedResourceId);
      });

      return run();
    },

    async health(): Promise<ProtectedResourceStoreHealth> {
      let readable = false;
      let writable = false;
      try {
        db.prepare(`SELECT schema_version FROM content_protection_store_versions ORDER BY id DESC LIMIT 1`).get();
        readable = true;
        writable = !closed;
      } catch {
        readable = false;
      }
      return {
        status: closed || !readable || !writable ? 'unhealthy' : 'healthy',
        readable,
        writable,
        schemaVersion: CONTENT_PROTECTION_STORE_SCHEMA_VERSION,
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
