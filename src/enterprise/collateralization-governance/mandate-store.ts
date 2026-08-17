import { CollateralizationGovernanceError } from './errors.js';
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

/**
 * The durable CollateralizationMandate Store. An independent store, never
 * persisted inside the Governance Store, the Passport Store, the
 * TokenizationMandate Store, or any other module's tables — mirrors the "one
 * store per Enterprise entity" precedent `../governance-store/`,
 * `../passport/`, `../access-governance/` and `../tokenization-governance/`
 * already establish.
 *
 * Deliberately entity-specific, not a generic KV/entity abstraction: issue,
 * record-execution, record-release and revoke are the only state transitions
 * this module's lifecycle has (`lifecycle.ts`), so this store has no generic
 * `update`, and both evidence tables are append-only with no delete path at
 * all.
 */
export interface CollateralizationMandateStore {
  readonly providerKind: 'memory' | 'sqlite';

  /**
   * Durably persists a newly-issued mandate. Throws
   * `COLLATERALIZATION_MANDATE_ALREADY_EXISTS` if `input.id` is already
   * claimed **or if `input.requestRef` already produced a mandate**, and
   * `COLLATERALIZATION_SCOPE_ESCALATION` if the mandate terms are not
   * contained by the requested terms.
   */
  issueMandate(
    context: CollateralizationGovernanceContext,
    input: IssueCollateralizationMandateInput,
  ): Promise<CollateralizationMandateRecord>;

  /** Tenant-scoped lookup by id. Throws `COLLATERALIZATION_MANDATE_NOT_FOUND` if absent, `COLLATERALIZATION_ACCESS_SCOPE_VIOLATION` if `context` may not see it. */
  getMandate(context: CollateralizationGovernanceContext, mandateId: string): Promise<CollateralizationMandateRecord>;

  /**
   * Tenant-scoped lookup of the (at most one) mandate issued for a
   * collateralization request, or `null` if that request never produced one.
   * At most one exists by construction -- `issueMandate` refuses a second
   * mandate for a `requestRef` it has already issued against, so replaying a
   * request can never accumulate authorization.
   */
  getMandateByRequestRef(
    context: CollateralizationGovernanceContext,
    requestRef: string,
  ): Promise<CollateralizationMandateRecord | null>;

  /**
   * Appends one external execution evidence record and advances the mandate's
   * cumulative `committedScope`/`executionCount` in the same commit section.
   * Authorization (revoked/expired/executor/obligation/party/rights/scope/
   * cumulative-scope/amount/registry/jurisdiction/priority) is asserted by the
   * caller *and* re-asserted here, so no second write path can bypass it.
   * Replaying an already-recorded execution id is rejected with
   * `COLLATERALIZATION_EXECUTION_ALREADY_RECORDED` rather than silently
   * committing further scope.
   */
  recordExecution(
    context: CollateralizationGovernanceContext,
    input: RecordCollateralizationExecutionInput,
  ): Promise<{ readonly mandate: CollateralizationMandateRecord; readonly execution: CollateralizationExecutionRecord }>;

  /** Tenant-scoped, append-ordered list of every execution recorded under a mandate. */
  listExecutions(
    context: CollateralizationGovernanceContext,
    mandateId: string,
  ): Promise<readonly CollateralizationExecutionRecord[]>;

  /**
   * Appends one external release/discharge evidence record against a
   * previously-recorded execution.
   *
   * Observation only. It does not change the mandate's status, does not
   * reduce the mandate's committed scope, does not re-authorize anything, and
   * asserts nothing about whether the external encumbrance genuinely ended.
   * Recording a release under a revoked or expired mandate is *allowed* and
   * deliberately so: reports about an arrangement's end arrive after
   * authority has lapsed far more often than before, and refusing them would
   * discard exactly the evidence an auditor needs.
   */
  recordRelease(
    context: CollateralizationGovernanceContext,
    input: RecordCollateralizationReleaseInput,
  ): Promise<CollateralizationReleaseRecord>;

  /** Tenant-scoped, append-ordered list of every release reported under a mandate. */
  listReleases(context: CollateralizationGovernanceContext, mandateId: string): Promise<readonly CollateralizationReleaseRecord[]>;

  /**
   * Withdraws the authority to perform further external collateralization:
   * `active -> revoked`, persisting the revocation record atomically with the
   * status flip. Idempotent — a second call returns the original revocation
   * as `{ kind: 'already-revoked' }`. Never deletes, rewrites, or invalidates
   * execution or release evidence already recorded, and makes no claim about
   * a security interest an external system already created.
   */
  revokeMandate(
    context: CollateralizationGovernanceContext,
    input: RevokeCollateralizationMandateInput,
  ): Promise<CollateralizationRevokeOutcome>;

  /** Tenant-scoped lookup of the (at most one) revocation for a mandate, or `null` if it has never been revoked. */
  getRevocation(
    context: CollateralizationGovernanceContext,
    mandateId: string,
  ): Promise<CollateralizationMandateRevocationRecord | null>;

  health(): Promise<CollateralizationMandateStoreHealth>;

  close(): Promise<void>;
}

/** True when `context` may see a record scoped to `recordOrganizationId`. Mirrors `canAccessAccessGrantOrganization` (`../access-governance/access-grant-store.ts`). */
export function canAccessCollateralizationOrganization(
  context: CollateralizationGovernanceContext,
  recordOrganizationId: string,
): boolean {
  if (context.system) return true;
  return context.organizationId !== undefined && context.organizationId === recordOrganizationId;
}

export function requireCollateralizationTenantScope(context: CollateralizationGovernanceContext): void {
  if (!context.system && (context.organizationId === undefined || context.organizationId.length === 0)) {
    throw new CollateralizationGovernanceError(
      'COLLATERALIZATION_TENANT_SCOPE_REQUIRED',
      'A non-system caller must provide an organization scope for collateralization governance data.',
    );
  }
}

export function requireCollateralizationAccessToOrganization(
  context: CollateralizationGovernanceContext,
  organizationId: string,
): void {
  requireCollateralizationTenantScope(context);
  if (!canAccessCollateralizationOrganization(context, organizationId)) {
    throw new CollateralizationGovernanceError(
      'COLLATERALIZATION_ACCESS_SCOPE_VIOLATION',
      `The caller is not authorized to access collateralization governance data for organization '${organizationId}'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Strict UTC timestamp validation — identical in intent and pattern to
// `../access-governance/access-grant-store.ts`'s and
// `../tokenization-governance/mandate-store.ts`'s: a trailing offset like
// `+02:00` is well-formed ISO 8601 but is NOT accepted, so every durably
// recorded instant in this module is unambiguously UTC on its face.
// ---------------------------------------------------------------------------

const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]00:00)$/;

export function isStrictUtcCollateralizationTimestamp(value: unknown): value is string {
  return typeof value === 'string' && STRICT_UTC_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function requireStrictUtcCollateralizationTimestamp(value: unknown, fieldName: string): string {
  if (!isStrictUtcCollateralizationTimestamp(value)) {
    throw new CollateralizationGovernanceError(
      'COLLATERALIZATION_INVALID_TIMESTAMP',
      `${fieldName} must be a strict UTC ISO 8601 timestamp (e.g. '2026-08-06T12:00:00.000Z'); received '${String(value)}'.`,
    );
  }
  return value;
}
