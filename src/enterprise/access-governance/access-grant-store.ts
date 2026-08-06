import { AccessGovernanceError } from './errors.js';
import type {
  AccessGovernanceContext,
  AccessGrantRecord,
  AccessGrantRevocationRecord,
  AccessGrantStoreHealth,
  BeginRevocationInput,
  FinalizeRevocationEnforcementInput,
  IssueAccessGrantInput,
  RecordProviderCredentialIssuanceInput,
  RevokeOutcome,
} from './contracts.js';

/**
 * The durable AccessGrant Store (Slice 1). An independent store, never
 * persisted inside the Governance Store, the Passport Store, or any other
 * module's tables — mirrors the "one store per Enterprise entity" precedent
 * `../governance-store/` and `../passport/` already establish.
 *
 * Deliberately entity-specific (like `AgentPassportStore`, like
 * `GovernanceStore`), not a generic KV/entity abstraction: `issueGrant` and
 * `revokeGrant` are the only two state transitions this module's lifecycle
 * has (`lifecycle.ts`), so this store has no generic `update`.
 */
export interface AccessGrantStore {
  readonly providerKind: 'memory' | 'sqlite';

  /** Durably persists a newly-issued grant. Throws `ACCESS_GRANT_ALREADY_EXISTS` if `input.id` is already claimed. */
  issueGrant(context: AccessGovernanceContext, input: IssueAccessGrantInput): Promise<AccessGrantRecord>;

  /** Tenant-scoped lookup by id. Throws `ACCESS_GRANT_NOT_FOUND` if absent, `ACCESS_GRANT_ACCESS_SCOPE_VIOLATION` if `context` may not see it. */
  getGrant(context: AccessGovernanceContext, grantId: string): Promise<AccessGrantRecord>;

  /**
   * Phase 1 of revocation — concurrency-safe, idempotent state transition:
   * `active -> revoked`, durably persisting the revocation record (with a
   * neutral, honest placeholder enforcement result — see
   * `createPendingEnforcementResult`) atomically with the grant's own status
   * flip. Once this resolves, `requestProviderCredential`-shaped callers
   * (`lifecycle.ts`'s `assertActive`) are already denied — no provider has
   * been contacted yet. A second call against an already-revoked grant with
   * the same `grantId` never re-executes the transition and never errors —
   * it returns the original revocation as `{ kind: 'already-revoked' }`
   * (idempotent revoke, Slice 1 requirement).
   */
  beginRevocation(context: AccessGovernanceContext, input: BeginRevocationInput): Promise<RevokeOutcome>;

  /**
   * Phase 2 of revocation — attaches the real, determined provider
   * enforcement result to an already-`beginRevocation`-ed revocation,
   * overwriting the placeholder. Called exactly once per revocation, only
   * by `service.ts`'s `revokeGrant` orchestration, immediately after
   * `beginRevocation` — never a second, independent write path.
   */
  finalizeRevocationEnforcement(context: AccessGovernanceContext, input: FinalizeRevocationEnforcementInput): Promise<AccessGrantRevocationRecord>;

  /** Tenant-scoped lookup of the (at most one) revocation for a grant, or `null` if the grant has never been revoked. */
  getRevocation(context: AccessGovernanceContext, grantId: string): Promise<AccessGrantRevocationRecord | null>;

  /**
   * Records that a new time-bounded provider credential (e.g. a Pinata
   * signed access link) was issued under `grantId`, updating the durable
   * `latestOutstandingCredentialExpiresAt` high-water mark used by the
   * effective-revocation invariant. A no-op if `input.expiresAt` is not
   * later than the currently recorded value (the mark only ever advances).
   */
  recordProviderCredentialIssuance(context: AccessGovernanceContext, input: RecordProviderCredentialIssuanceInput): Promise<AccessGrantRecord>;

  health(): Promise<AccessGrantStoreHealth>;

  close(): Promise<void>;
}

/** True when `context` may see a record scoped to `recordOrganizationId`. Mirrors `canAccessPassportOrganization` (`../passport/passport-store.ts`). */
export function canAccessAccessGrantOrganization(context: AccessGovernanceContext, recordOrganizationId: string): boolean {
  if (context.system) return true;
  return context.organizationId !== undefined && context.organizationId === recordOrganizationId;
}

export function requireAccessGrantTenantScope(context: AccessGovernanceContext): void {
  if (!context.system && (context.organizationId === undefined || context.organizationId.length === 0)) {
    throw new AccessGovernanceError('ACCESS_GRANT_TENANT_SCOPE_REQUIRED', 'A non-system caller must provide an organization scope for Access Grant data.');
  }
}

export function requireAccessGrantAccessToOrganization(context: AccessGovernanceContext, organizationId: string): void {
  requireAccessGrantTenantScope(context);
  if (!canAccessAccessGrantOrganization(context, organizationId)) {
    throw new AccessGovernanceError('ACCESS_GRANT_ACCESS_SCOPE_VIOLATION', `The caller is not authorized to access Access Grant data for organization '${organizationId}'.`);
  }
}

// ---------------------------------------------------------------------------
// Strict UTC timestamp validation. Neither `../governance-store/` nor
// `../passport/` enforce timestamp format at all (both accept any
// non-empty string); Slice 1 explicitly requires "strict UTC validation",
// so this module is deliberately stricter: a trailing offset like
// `+02:00` is well-formed ISO 8601 but is NOT accepted here — only a
// `Z`-suffixed (or all-zero-offset) UTC instant is, so every durably
// recorded instant in this module is unambiguously UTC on its face, never
// dependent on the reader also parsing a non-zero offset correctly.
// ---------------------------------------------------------------------------

const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]00:00)$/;

export function isStrictUtcTimestamp(value: unknown): value is string {
  return typeof value === 'string' && STRICT_UTC_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function requireStrictUtcTimestamp(value: unknown, fieldName: string): string {
  if (!isStrictUtcTimestamp(value)) {
    throw new AccessGovernanceError(
      'ACCESS_GRANT_INVALID_TIMESTAMP',
      `${fieldName} must be a strict UTC ISO 8601 timestamp (e.g. '2026-08-06T12:00:00.000Z'); received '${String(value)}'.`,
    );
  }
  return value;
}
