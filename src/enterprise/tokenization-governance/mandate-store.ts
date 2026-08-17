import { TokenizationGovernanceError } from './errors.js';
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

/**
 * The durable TokenizationMandate Store. An independent store, never
 * persisted inside the Governance Store, the Passport Store, or any other
 * module's tables — mirrors the "one store per Enterprise entity" precedent
 * `../governance-store/`, `../passport/` and `../access-governance/` already
 * establish.
 *
 * Deliberately entity-specific, not a generic KV/entity abstraction: issue,
 * record-execution and revoke are the only state transitions this module's
 * lifecycle has (`lifecycle.ts`), so this store has no generic `update`, and
 * execution records are append-only with no delete path at all.
 */
export interface TokenizationMandateStore {
  readonly providerKind: 'memory';

  /**
   * Durably persists a newly-issued mandate. Throws
   * `TOKENIZATION_MANDATE_ALREADY_EXISTS` if `input.id` is already claimed
   * **or if `input.requestRef` already produced a mandate**, and
   * `TOKENIZATION_SCOPE_ESCALATION` if the mandate terms are not contained
   * by the requested terms.
   */
  issueMandate(context: TokenizationGovernanceContext, input: IssueTokenizationMandateInput): Promise<TokenizationMandateRecord>;

  /** Tenant-scoped lookup by id. Throws `TOKENIZATION_MANDATE_NOT_FOUND` if absent, `TOKENIZATION_ACCESS_SCOPE_VIOLATION` if `context` may not see it. */
  getMandate(context: TokenizationGovernanceContext, mandateId: string): Promise<TokenizationMandateRecord>;

  /**
   * Tenant-scoped lookup of the (at most one) mandate issued for a
   * tokenization request, or `null` if that request never produced one.
   * At most one exists by construction -- `issueMandate` refuses a second
   * mandate for a `requestRef` it has already issued against, so replaying a
   * request can never accumulate authorization.
   */
  getMandateByRequestRef(context: TokenizationGovernanceContext, requestRef: string): Promise<TokenizationMandateRecord | null>;

  /**
   * Appends one external execution evidence record and advances the
   * mandate's `issuedUnits`/`executionCount` counters in the same commit
   * section. Authorization (revoked/expired/executor/rights/scope/ceiling)
   * is asserted by the caller *and* re-asserted here, so no second write
   * path can bypass it. Replaying an already-recorded execution id is
   * rejected with `TOKENIZATION_EXECUTION_ALREADY_RECORDED` rather than
   * silently creating additional issuance headroom.
   */
  recordExecution(
    context: TokenizationGovernanceContext,
    input: RecordTokenizationExecutionInput,
  ): Promise<{ readonly mandate: TokenizationMandateRecord; readonly execution: TokenizationExecutionRecord }>;

  /** Tenant-scoped, append-ordered list of every execution recorded under a mandate. */
  listExecutions(context: TokenizationGovernanceContext, mandateId: string): Promise<readonly TokenizationExecutionRecord[]>;

  /**
   * Withdraws the authority to perform further external issuance:
   * `active -> revoked`, persisting the revocation record atomically with
   * the status flip. Idempotent — a second call returns the original
   * revocation as `{ kind: 'already-revoked' }`. Never deletes, rewrites, or
   * invalidates execution evidence already recorded.
   */
  revokeMandate(context: TokenizationGovernanceContext, input: RevokeTokenizationMandateInput): Promise<TokenizationRevokeOutcome>;

  /** Tenant-scoped lookup of the (at most one) revocation for a mandate, or `null` if it has never been revoked. */
  getRevocation(context: TokenizationGovernanceContext, mandateId: string): Promise<TokenizationMandateRevocationRecord | null>;

  health(): Promise<TokenizationMandateStoreHealth>;

  close(): Promise<void>;
}

/** True when `context` may see a record scoped to `recordOrganizationId`. Mirrors `canAccessAccessGrantOrganization` (`../access-governance/access-grant-store.ts`). */
export function canAccessTokenizationOrganization(context: TokenizationGovernanceContext, recordOrganizationId: string): boolean {
  if (context.system) return true;
  return context.organizationId !== undefined && context.organizationId === recordOrganizationId;
}

export function requireTokenizationTenantScope(context: TokenizationGovernanceContext): void {
  if (!context.system && (context.organizationId === undefined || context.organizationId.length === 0)) {
    throw new TokenizationGovernanceError(
      'TOKENIZATION_TENANT_SCOPE_REQUIRED',
      'A non-system caller must provide an organization scope for tokenization governance data.',
    );
  }
}

export function requireTokenizationAccessToOrganization(context: TokenizationGovernanceContext, organizationId: string): void {
  requireTokenizationTenantScope(context);
  if (!canAccessTokenizationOrganization(context, organizationId)) {
    throw new TokenizationGovernanceError(
      'TOKENIZATION_ACCESS_SCOPE_VIOLATION',
      `The caller is not authorized to access tokenization governance data for organization '${organizationId}'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Strict UTC timestamp validation — identical in intent and pattern to
// `../access-governance/access-grant-store.ts`'s: a trailing offset like
// `+02:00` is well-formed ISO 8601 but is NOT accepted, so every durably
// recorded instant in this module is unambiguously UTC on its face.
// ---------------------------------------------------------------------------

const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]00:00)$/;

export function isStrictUtcTokenizationTimestamp(value: unknown): value is string {
  return typeof value === 'string' && STRICT_UTC_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function requireStrictUtcTokenizationTimestamp(value: unknown, fieldName: string): string {
  if (!isStrictUtcTokenizationTimestamp(value)) {
    throw new TokenizationGovernanceError(
      'TOKENIZATION_INVALID_TIMESTAMP',
      `${fieldName} must be a strict UTC ISO 8601 timestamp (e.g. '2026-08-06T12:00:00.000Z'); received '${String(value)}'.`,
    );
  }
  return value;
}
