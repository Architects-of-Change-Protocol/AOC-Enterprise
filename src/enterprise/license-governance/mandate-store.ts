import { LicenseGovernanceError } from './errors.js';
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

/**
 * The durable LicenseMandate Store. An independent store, never persisted
 * inside the Governance Store, the Passport Store, the TokenizationMandate
 * Store, the CollateralizationMandate Store, or any other module's tables —
 * mirrors the "one store per Enterprise entity" precedent
 * `../governance-store/`, `../passport/`, `../access-governance/`,
 * `../tokenization-governance/` and `../collateralization-governance/`
 * already establish.
 *
 * Deliberately entity-specific, not a generic KV/entity abstraction: issue,
 * record-execution, record-lifecycle and revoke are the only state
 * transitions this module's lifecycle has (`lifecycle.ts`), so this store has
 * no generic `update`, and both evidence tables are append-only with no
 * delete path at all.
 */
export interface LicenseMandateStore {
  readonly providerKind: 'memory' | 'sqlite';

  /**
   * Durably persists a newly-issued mandate. Throws
   * `LICENSE_MANDATE_ALREADY_EXISTS` if `input.id` is already claimed **or if
   * `input.requestRef` already produced a mandate**, and
   * `LICENSE_PERMISSION_ESCALATION` if the mandate terms are not contained by
   * the requested terms.
   */
  issueMandate(context: LicenseGovernanceContext, input: IssueLicenseMandateInput): Promise<LicenseMandateRecord>;

  /** Tenant-scoped lookup by id. Throws `LICENSE_MANDATE_NOT_FOUND` if absent, `LICENSE_ACCESS_SCOPE_VIOLATION` if `context` may not see it. */
  getMandate(context: LicenseGovernanceContext, mandateId: string): Promise<LicenseMandateRecord>;

  /**
   * Tenant-scoped lookup of the (at most one) mandate issued for a license
   * request, or `null` if that request never produced one. At most one exists
   * by construction -- `issueMandate` refuses a second mandate for a
   * `requestRef` it has already issued against, so replaying a request can
   * never accumulate authorization.
   */
  getMandateByRequestRef(context: LicenseGovernanceContext, requestRef: string): Promise<LicenseMandateRecord | null>;

  /**
   * Appends one external execution evidence record and advances the mandate's
   * `executionCount` in the same commit section. Authorization
   * (revoked/expired/executor/licensee/rights/uses/exclusivity/rights-scope/
   * context/term/units/agreement-reference/additional-licenses) is asserted by
   * the caller *and* re-asserted here, so no second write path can bypass it.
   * Replaying an already-recorded execution id is rejected with
   * `LICENSE_EXECUTION_ALREADY_RECORDED` rather than silently recording a
   * second grant.
   */
  recordExecution(
    context: LicenseGovernanceContext,
    input: RecordLicenseExecutionInput,
  ): Promise<{ readonly mandate: LicenseMandateRecord; readonly execution: LicenseExecutionRecord }>;

  /** Tenant-scoped, append-ordered list of every external license recorded under a mandate. */
  listExecutions(context: LicenseGovernanceContext, mandateId: string): Promise<readonly LicenseExecutionRecord[]>;

  /**
   * Appends one external lifecycle evidence record — expired, terminated,
   * cancelled, surrendered, superseded — against a previously-recorded
   * execution.
   *
   * Observation only. It does not change the mandate's status, does not
   * decrement the mandate's execution count, does not re-authorize anything,
   * and asserts nothing about whether the external license genuinely ended.
   * Recording one under a revoked or expired mandate is *allowed* and
   * deliberately so: reports about a license's end arrive after authority has
   * lapsed far more often than before, and refusing them would discard
   * exactly the evidence an auditor needs.
   */
  recordLifecycleEvent(context: LicenseGovernanceContext, input: RecordLicenseLifecycleInput): Promise<LicenseLifecycleRecord>;

  /** Tenant-scoped, append-ordered list of every lifecycle event reported under a mandate. */
  listLifecycleEvents(context: LicenseGovernanceContext, mandateId: string): Promise<readonly LicenseLifecycleRecord[]>;

  /**
   * Withdraws the authority to grant further external licenses:
   * `active -> revoked`, persisting the revocation record atomically with the
   * status flip. Idempotent — a second call returns the original revocation as
   * `{ kind: 'already-revoked' }`. Never deletes, rewrites, or invalidates
   * execution or lifecycle evidence already recorded, and makes no claim about
   * a license an external system already granted.
   */
  revokeMandate(context: LicenseGovernanceContext, input: RevokeLicenseMandateInput): Promise<LicenseRevokeOutcome>;

  /** Tenant-scoped lookup of the (at most one) revocation for a mandate, or `null` if it has never been revoked. */
  getRevocation(context: LicenseGovernanceContext, mandateId: string): Promise<LicenseMandateRevocationRecord | null>;

  health(): Promise<LicenseMandateStoreHealth>;

  close(): Promise<void>;
}

/** True when `context` may see a record scoped to `recordOrganizationId`. Mirrors `canAccessAccessGrantOrganization` (`../access-governance/access-grant-store.ts`). */
export function canAccessLicenseOrganization(context: LicenseGovernanceContext, recordOrganizationId: string): boolean {
  if (context.system) return true;
  return context.organizationId !== undefined && context.organizationId === recordOrganizationId;
}

export function requireLicenseTenantScope(context: LicenseGovernanceContext): void {
  if (!context.system && (context.organizationId === undefined || context.organizationId.length === 0)) {
    throw new LicenseGovernanceError(
      'LICENSE_TENANT_SCOPE_REQUIRED',
      'A non-system caller must provide an organization scope for license governance data.',
    );
  }
}

export function requireLicenseAccessToOrganization(context: LicenseGovernanceContext, organizationId: string): void {
  requireLicenseTenantScope(context);
  if (!canAccessLicenseOrganization(context, organizationId)) {
    throw new LicenseGovernanceError(
      'LICENSE_ACCESS_SCOPE_VIOLATION',
      `The caller is not authorized to access license governance data for organization '${organizationId}'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Strict UTC timestamp validation — identical in intent and pattern to
// `../access-governance/access-grant-store.ts`'s,
// `../tokenization-governance/mandate-store.ts`'s and
// `../collateralization-governance/mandate-store.ts`'s: a trailing offset like
// `+02:00` is well-formed ISO 8601 but is NOT accepted, so every durably
// recorded instant in this module is unambiguously UTC on its face.
// ---------------------------------------------------------------------------

const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]00:00)$/;

export function isStrictUtcLicenseTimestamp(value: unknown): value is string {
  return typeof value === 'string' && STRICT_UTC_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function requireStrictUtcLicenseTimestamp(value: unknown, fieldName: string): string {
  if (!isStrictUtcLicenseTimestamp(value)) {
    throw new LicenseGovernanceError(
      'LICENSE_INVALID_TIMESTAMP',
      `${fieldName} must be a strict UTC ISO 8601 timestamp (e.g. '2026-08-06T12:00:00.000Z'); received '${String(value)}'.`,
    );
  }
  return value;
}
