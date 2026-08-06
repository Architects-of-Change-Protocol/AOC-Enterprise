import { ContentProtectionError } from './errors.js';
import type {
  ContentProtectionContext,
  CreatePendingProtectedResourceInput,
  MarkProtectedResourceActiveInput,
  MarkProtectedResourceFailedInput,
  MarkProtectedResourceOrphanedInput,
  ProtectedResourceRecord,
  ProtectedResourceStoreHealth,
} from './contracts.js';

/**
 * The durable ProtectedResource Store (Slice 2). An independent store,
 * never persisted inside the Governance Store, the Passport Store, or
 * `../access-governance/`'s own `AccessGrantStore` -- mirrors the "one
 * store per Enterprise entity" precedent those modules already establish.
 */
export interface ProtectedResourceStore {
  readonly providerKind: 'memory' | 'sqlite';

  /** Durably persists a new `'pending'` row BEFORE any encryption/wrapping/upload is attempted. Throws `CONTENT_PROTECTION_ALREADY_EXISTS` if `input.protectedResourceId` is already claimed. */
  createPending(context: ContentProtectionContext, input: CreatePendingProtectedResourceInput): Promise<ProtectedResourceRecord>;

  /** Tenant-scoped lookup by id. Throws `CONTENT_PROTECTION_NOT_FOUND` if absent, `CONTENT_PROTECTION_ACCESS_SCOPE_VIOLATION` if `context` may not see it. */
  getProtectedResource(context: ContentProtectionContext, protectedResourceId: string): Promise<ProtectedResourceRecord>;

  /** Terminal transition `pending -> active`. Throws `CONTENT_PROTECTION_INVALID_STATE_TRANSITION` if the row is not currently `'pending'`. */
  markActive(context: ContentProtectionContext, input: MarkProtectedResourceActiveInput): Promise<ProtectedResourceRecord>;

  /** Terminal transition `pending -> failed`. */
  markFailed(context: ContentProtectionContext, input: MarkProtectedResourceFailedInput): Promise<ProtectedResourceRecord>;

  /** Terminal transition `pending -> orphaned` -- the compensating write `service.ts` attempts when ciphertext was uploaded but `markActive` itself failed. */
  markOrphaned(context: ContentProtectionContext, input: MarkProtectedResourceOrphanedInput): Promise<ProtectedResourceRecord>;

  health(): Promise<ProtectedResourceStoreHealth>;

  close(): Promise<void>;
}

/** True when `context` may see a record scoped to `recordOrganizationId`. Mirrors `canAccessAccessGrantOrganization` (`../access-governance/access-grant-store.ts`). */
export function canAccessContentProtectionOrganization(context: ContentProtectionContext, recordOrganizationId: string): boolean {
  if (context.system) return true;
  return context.organizationId !== undefined && context.organizationId === recordOrganizationId;
}

export function requireContentProtectionTenantScope(context: ContentProtectionContext): void {
  if (!context.system && (context.organizationId === undefined || context.organizationId.length === 0)) {
    throw new ContentProtectionError('CONTENT_PROTECTION_TENANT_SCOPE_REQUIRED', 'A non-system caller must provide an organization scope for Content Protection data.');
  }
}

export function requireContentProtectionAccessToOrganization(context: ContentProtectionContext, organizationId: string): void {
  requireContentProtectionTenantScope(context);
  if (!canAccessContentProtectionOrganization(context, organizationId)) {
    throw new ContentProtectionError('CONTENT_PROTECTION_ACCESS_SCOPE_VIOLATION', `The caller is not authorized to access Content Protection data for organization '${organizationId}'.`);
  }
}

// ---------------------------------------------------------------------------
// Strict UTC timestamp validation -- reuses the exact pattern
// `../access-governance/access-grant-store.ts` established for Slice 1,
// rather than defining a second, possibly-diverging one.
// ---------------------------------------------------------------------------

const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]00:00)$/;

export function isStrictUtcTimestamp(value: unknown): value is string {
  return typeof value === 'string' && STRICT_UTC_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function requireStrictUtcTimestamp(value: unknown, fieldName: string): string {
  if (!isStrictUtcTimestamp(value)) {
    throw new ContentProtectionError(
      'CONTENT_PROTECTION_INVALID_TIMESTAMP',
      `${fieldName} must be a strict UTC ISO 8601 timestamp (e.g. '2026-08-06T12:00:00.000Z'); received '${String(value)}'.`,
    );
  }
  return value;
}
