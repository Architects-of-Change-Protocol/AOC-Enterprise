import { TransferGovernanceError } from './errors.js';
import type {
  IssueTransferMandateInput,
  RecordTransferExecutionInput,
  RecordTransferLifecycleInput,
  RevokeTransferMandateInput,
  TransferExecutionRecord,
  TransferGovernanceContext,
  TransferLifecycleRecord,
  TransferMandateRecord,
  TransferMandateRevocationRecord,
  TransferMandateStoreHealth,
  TransferRevokeOutcome,
} from './contracts.js';

/**
 * The durable TransferMandate Store. An independent store, never persisted
 * inside the Governance Store, the Passport Store, the TokenizationMandate
 * Store, the CollateralizationMandate Store, the LicenseMandate Store, or any
 * other module's tables — mirrors the "one store per Enterprise entity"
 * precedent `../governance-store/`, `../passport/`, `../access-governance/`,
 * `../tokenization-governance/`, `../collateralization-governance/` and
 * `../license-governance/` already establish.
 *
 * Deliberately entity-specific, not a generic KV/entity abstraction: issue,
 * record-execution, record-lifecycle and revoke are the only state transitions
 * this module's lifecycle has (`lifecycle.ts`), so this store has no generic
 * `update`, and both evidence tables are append-only with no delete path at
 * all.
 *
 * Note what this interface deliberately does not offer: no method that changes
 * who holds a right, no method that grants the transferee anything, and no
 * hook by which recorded evidence could reach the Authority Graph. See
 * `docs/architecture/ADR-TRANSFER-ACTION.md`, "Post-transfer authority".
 */
export interface TransferMandateStore {
  readonly providerKind: 'memory' | 'sqlite';

  /**
   * Durably persists a newly-issued mandate. Throws
   * `TRANSFER_MANDATE_ALREADY_EXISTS` if `input.id` is already claimed **or if
   * `input.requestRef` already produced a mandate**, and
   * `TRANSFER_SCOPE_ESCALATION` if the mandate terms are not contained by the
   * requested terms.
   */
  issueMandate(context: TransferGovernanceContext, input: IssueTransferMandateInput): Promise<TransferMandateRecord>;

  /** Tenant-scoped lookup by id. Throws `TRANSFER_MANDATE_NOT_FOUND` if absent, `TRANSFER_ACCESS_SCOPE_VIOLATION` if `context` may not see it. */
  getMandate(context: TransferGovernanceContext, mandateId: string): Promise<TransferMandateRecord>;

  /**
   * Tenant-scoped lookup of the (at most one) mandate issued for a transfer
   * request, or `null` if that request never produced one. At most one exists
   * by construction -- `issueMandate` refuses a second mandate for a
   * `requestRef` it has already issued against, so replaying a request can
   * never accumulate authorization.
   */
  getMandateByRequestRef(context: TransferGovernanceContext, requestRef: string): Promise<TransferMandateRecord | null>;

  /**
   * Appends one external execution evidence record and advances the mandate's
   * cumulative `transferredScope`/`executionCount` in the same commit section.
   * Authorization
   * (revoked/expired/executor/transferor/transferee/rights/scope/cumulative-scope/
   * partiality/registry/acceptance/consideration/agreement-reference) is
   * asserted by the caller *and* re-asserted here, so no second write path can
   * bypass it. Replaying an already-recorded execution id is rejected with
   * `TRANSFER_EXECUTION_ALREADY_RECORDED` rather than silently recording a
   * second movement.
   */
  recordExecution(
    context: TransferGovernanceContext,
    input: RecordTransferExecutionInput,
  ): Promise<{ readonly mandate: TransferMandateRecord; readonly execution: TransferExecutionRecord }>;

  /** Tenant-scoped, append-ordered list of every external movement recorded under a mandate. */
  listExecutions(context: TransferGovernanceContext, mandateId: string): Promise<readonly TransferExecutionRecord[]>;

  /**
   * Appends one external lifecycle evidence record — registered, rejected,
   * reversed, corrected, superseded — against a previously-recorded execution.
   *
   * Observation only. It does not change the mandate's status, does not
   * decrement the mandate's transferred scope or execution count, does not
   * re-authorize anything, and asserts nothing about whether the reported
   * outcome genuinely occurred. Recording one under a revoked or expired
   * mandate is *allowed* and deliberately so: reports about a movement's
   * registration or reversal arrive after authority has lapsed far more often
   * than before, and refusing them would discard exactly the evidence an
   * auditor needs.
   */
  recordLifecycleEvent(context: TransferGovernanceContext, input: RecordTransferLifecycleInput): Promise<TransferLifecycleRecord>;

  /** Tenant-scoped, append-ordered list of every lifecycle event reported under a mandate. */
  listLifecycleEvents(context: TransferGovernanceContext, mandateId: string): Promise<readonly TransferLifecycleRecord[]>;

  /**
   * Withdraws the authority to move further rights: `active -> revoked`,
   * persisting the revocation record atomically with the status flip.
   * Idempotent — a second call returns the original revocation as
   * `{ kind: 'already-revoked' }`. Never deletes, rewrites, or invalidates
   * execution or lifecycle evidence already recorded, and makes no claim about
   * rights an external system already moved.
   */
  revokeMandate(context: TransferGovernanceContext, input: RevokeTransferMandateInput): Promise<TransferRevokeOutcome>;

  /** Tenant-scoped lookup of the (at most one) revocation for a mandate, or `null` if it has never been revoked. */
  getRevocation(context: TransferGovernanceContext, mandateId: string): Promise<TransferMandateRevocationRecord | null>;

  health(): Promise<TransferMandateStoreHealth>;

  close(): Promise<void>;
}

/** True when `context` may see a record scoped to `recordOrganizationId`. Mirrors `canAccessAccessGrantOrganization` (`../access-governance/access-grant-store.ts`). */
export function canAccessTransferOrganization(context: TransferGovernanceContext, recordOrganizationId: string): boolean {
  if (context.system) return true;
  return context.organizationId !== undefined && context.organizationId === recordOrganizationId;
}

export function requireTransferTenantScope(context: TransferGovernanceContext): void {
  if (!context.system && (context.organizationId === undefined || context.organizationId.length === 0)) {
    throw new TransferGovernanceError(
      'TRANSFER_TENANT_SCOPE_REQUIRED',
      'A non-system caller must provide an organization scope for transfer governance data.',
    );
  }
}

export function requireTransferAccessToOrganization(context: TransferGovernanceContext, organizationId: string): void {
  requireTransferTenantScope(context);
  if (!canAccessTransferOrganization(context, organizationId)) {
    throw new TransferGovernanceError(
      'TRANSFER_ACCESS_SCOPE_VIOLATION',
      `The caller is not authorized to access transfer governance data for organization '${organizationId}'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Strict UTC timestamp validation — identical in intent and pattern to
// `../access-governance/access-grant-store.ts`'s,
// `../tokenization-governance/mandate-store.ts`'s,
// `../collateralization-governance/mandate-store.ts`'s and
// `../license-governance/mandate-store.ts`'s: a trailing offset like `+02:00`
// is well-formed ISO 8601 but is NOT accepted, so every durably recorded
// instant in this module is unambiguously UTC on its face.
// ---------------------------------------------------------------------------

const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]00:00)$/;

export function isStrictUtcTransferTimestamp(value: unknown): value is string {
  return typeof value === 'string' && STRICT_UTC_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function requireStrictUtcTransferTimestamp(value: unknown, fieldName: string): string {
  if (!isStrictUtcTransferTimestamp(value)) {
    throw new TransferGovernanceError(
      'TRANSFER_INVALID_TIMESTAMP',
      `${fieldName} must be a strict UTC ISO 8601 timestamp (e.g. '2026-08-06T12:00:00.000Z'); received '${String(value)}'.`,
    );
  }
  return value;
}
