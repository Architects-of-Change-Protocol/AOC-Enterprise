import { ContentProtectionError } from './errors.js';
import { requireContentProtectionAccessToOrganization } from './protected-resource-store.js';
import type { ProtectedResourceStore } from './protected-resource-store.js';
import type {
  ContentProtectionContext,
  CreatePendingProtectedResourceInput,
  MarkProtectedResourceActiveInput,
  MarkProtectedResourceFailedInput,
  MarkProtectedResourceOrphanedInput,
  ProtectedResourceRecord,
  ProtectedResourceStoreHealth,
} from './contracts.js';

export const CONTENT_PROTECTION_STORE_SCHEMA_VERSION = 'aoc.content-protection-store.schema.v2';

export interface CreateInMemoryProtectedResourceStoreOptions {
  readonly now?: () => string;
}

/**
 * In-memory `ProtectedResourceStore` — mirrors
 * `createInMemoryAccessGrantStore` (`../access-governance/in-memory-access-grant-store.ts`)
 * in structure: synchronous commit sections, no durability across a process
 * restart. Primary store this module's own crypto/service test suite runs
 * against; see `sqlite-protected-resource-store.ts` for the durable
 * equivalent.
 */
export function createInMemoryProtectedResourceStore(options: CreateInMemoryProtectedResourceStoreOptions = {}): ProtectedResourceStore {
  const now = options.now ?? (() => new Date().toISOString());
  const records = new Map<string, ProtectedResourceRecord>();
  let closed = false;

  function assertOpen(): void {
    if (closed) throw new ContentProtectionError('CONTENT_PROTECTION_STORE_UNAVAILABLE', 'The Content Protection Store has been closed.');
  }

  function requireRecord(protectedResourceId: string): ProtectedResourceRecord {
    const record = records.get(protectedResourceId);
    if (record === undefined) {
      throw new ContentProtectionError('CONTENT_PROTECTION_NOT_FOUND', `No ProtectedResource for protectedResourceId '${protectedResourceId}'.`);
    }
    return record;
  }

  function requirePendingRecord(context: ContentProtectionContext, protectedResourceId: string, organizationId: string): ProtectedResourceRecord {
    const record = requireRecord(protectedResourceId);
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
    providerKind: 'memory',

    async createPending(context: ContentProtectionContext, input: CreatePendingProtectedResourceInput): Promise<ProtectedResourceRecord> {
      assertOpen();
      requireContentProtectionAccessToOrganization(context, input.organizationId);

      if (records.has(input.protectedResourceId)) {
        throw new ContentProtectionError('CONTENT_PROTECTION_ALREADY_EXISTS', `A ProtectedResource with id '${input.protectedResourceId}' already exists.`);
      }

      const timestamp = now();
      const record: ProtectedResourceRecord = {
        protectedResourceId: input.protectedResourceId,
        organizationId: input.organizationId,
        state: 'pending',
        resource: input.resource,
        encryptionProfile: input.encryptionProfile,
        correlationId: input.correlationId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      records.set(record.protectedResourceId, record);
      return record;
    },

    async getProtectedResource(context: ContentProtectionContext, protectedResourceId: string): Promise<ProtectedResourceRecord> {
      assertOpen();
      const record = requireRecord(protectedResourceId);
      requireContentProtectionAccessToOrganization(context, record.organizationId);
      return record;
    },

    async markActive(context: ContentProtectionContext, input: MarkProtectedResourceActiveInput): Promise<ProtectedResourceRecord> {
      assertOpen();
      const record = requirePendingRecord(context, input.protectedResourceId, input.organizationId);
      const updated: ProtectedResourceRecord = {
        ...record,
        state: 'active',
        plaintextDigest: input.plaintextDigest,
        ciphertextDigest: input.ciphertextDigest,
        nonce: input.nonce,
        authTag: input.authTag,
        wrappedKey: input.wrappedKey,
        storageRef: input.storageRef,
        updatedAt: now(),
        ...(input.sovereignBinding !== undefined ? { sovereignBinding: input.sovereignBinding } : {}),
      };
      records.set(updated.protectedResourceId, updated);
      return updated;
    },

    async markFailed(context: ContentProtectionContext, input: MarkProtectedResourceFailedInput): Promise<ProtectedResourceRecord> {
      assertOpen();
      const record = requirePendingRecord(context, input.protectedResourceId, input.organizationId);
      const updated: ProtectedResourceRecord = { ...record, state: 'failed', failureReason: input.reason, updatedAt: now() };
      records.set(updated.protectedResourceId, updated);
      return updated;
    },

    async markOrphaned(context: ContentProtectionContext, input: MarkProtectedResourceOrphanedInput): Promise<ProtectedResourceRecord> {
      assertOpen();
      const record = requirePendingRecord(context, input.protectedResourceId, input.organizationId);
      const updated: ProtectedResourceRecord = { ...record, state: 'orphaned', failureReason: input.reason, storageRef: input.storageRef, updatedAt: now() };
      records.set(updated.protectedResourceId, updated);
      return updated;
    },

    async health(): Promise<ProtectedResourceStoreHealth> {
      return {
        status: closed ? 'unhealthy' : 'healthy',
        readable: !closed,
        writable: !closed,
        schemaVersion: CONTENT_PROTECTION_STORE_SCHEMA_VERSION,
        checkedAt: now(),
      };
    },

    async close(): Promise<void> {
      closed = true;
    },
  };
}
