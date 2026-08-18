import { EncumbranceReleaseGovernanceError } from './errors.js';
import type {
  EncumbranceReleaseExecutionRecord,
  EncumbranceReleaseGovernanceContext,
  EncumbranceReleaseMandateRecord,
  EncumbranceReleaseMandateRevocationRecord,
  EncumbranceReleaseMandateStoreHealth,
  EncumbranceReleaseRevokeOutcome,
  IssueEncumbranceReleaseMandateInput,
  RecordEncumbranceReleaseExecutionInput,
  RevokeEncumbranceReleaseMandateInput,
} from './contracts.js';

/**
 * The durable Encumbrance Release Mandate Store: the release authorizations
 * this deployment issued, and the executor evidence recorded against them.
 *
 * An independent store, never persisted inside the Governance Store, the
 * Governed Authority Store or the CollateralizationMandate Store — the same
 * "one store per Enterprise entity" precedent every other action module
 * follows.
 *
 * ## Why release mandates are *not* in the Governed Authority Store
 *
 * They reduce nothing and commit nothing, so the argument that put reservations
 * and encumbrances there does not reach them. That store's whole placement
 * rationale is that availability is a function of positions, reservations and
 * encumbrances together and therefore has to be read and written under one
 * consistency boundary. A release mandate is not a term in that function: while
 * it exists and until its execution is confirmed, capacity is *exactly* what it
 * was. Putting mandate lifecycle, policy references and executor evidence in
 * the authority store would have mixed governance artifacts into the accounting
 * layer that deliberately holds none — and the authority store's own
 * documentation says so.
 *
 * What does have to be atomic is terminalization, and it is: one
 * `db.transaction(...)` inside `GovernedAuthorityStore.releaseEncumbrance`.
 * The seam between the two stores is the ordinary one this codebase already
 * lives with between a mandate store and the authority store, and it is
 * ordered the conservative way — evidence first, terminalization second — so a
 * crash in between leaves the constraint *standing* rather than freed. See
 * `service.ts`, "the crash boundary".
 *
 * Note what this interface deliberately does *not* offer:
 *
 * - **No status setter.** A mandate reaches `'executed'` only by recording a
 *   confirmed successful execution against it, and `'revoked'` only by
 *   revocation. There is no `setStatus` a caller could reach for.
 * - **No un-execute and no un-revoke.** Both terminal states are terminal.
 * - **No release of the constraint.** This store never touches authority state.
 *   Terminalization lives in the Governed Authority Store, behind a typed
 *   basis, and this store's records are what make such a basis constructible —
 *   they are not the basis itself.
 */
export interface EncumbranceReleaseMandateStore {
  readonly providerKind: 'memory' | 'sqlite';

  /**
   * Records the authorization a decision produced.
   *
   * Refuses `ENCUMBRANCE_RELEASE_MANDATE_ALREADY_ACTIVE` when the same
   * constraint already has a live release authorization. Two mandates
   * concurrently committed to discharging one constraint is not a race to be
   * resolved by whichever executes first: it means two governance chains each
   * believe they own the discharge, and a caller has to see that. A revoked or
   * spent mandate frees the slot.
   *
   * Refuses `ENCUMBRANCE_RELEASE_MANDATE_ALREADY_EXISTS` when the same request
   * has already been authorized, so replaying a request can never accumulate
   * authority.
   */
  issueMandate(
    context: EncumbranceReleaseGovernanceContext,
    input: IssueEncumbranceReleaseMandateInput,
  ): Promise<EncumbranceReleaseMandateRecord>;

  getMandate(context: EncumbranceReleaseGovernanceContext, mandateId: string): Promise<EncumbranceReleaseMandateRecord>;

  getMandateByRequestRef(context: EncumbranceReleaseGovernanceContext, requestRef: string): Promise<EncumbranceReleaseMandateRecord | null>;

  /** The (at most one) live release authorization over a constraint, or `null`. What `issueMandate` checks, exposed for explanation and audit. */
  getActiveMandateForEncumbrance(
    context: EncumbranceReleaseGovernanceContext,
    organizationId: string,
    encumbranceRef: string,
  ): Promise<EncumbranceReleaseMandateRecord | null>;

  /**
   * Appends one attempt's evidence, and — only for a confirmed success —
   * spends the mandate in the same commit section.
   *
   * At most one confirmed success per mandate, enforced durably: a release
   * mandate authorizes exactly one discharge, and a second success against it
   * would be a second discharge nothing authorized. Failures and indeterminate
   * outcomes accumulate freely, because retrying them is the correct behaviour
   * and each attempt is a fact worth keeping.
   */
  recordExecution(
    context: EncumbranceReleaseGovernanceContext,
    input: RecordEncumbranceReleaseExecutionInput,
  ): Promise<{ readonly mandate: EncumbranceReleaseMandateRecord; readonly execution: EncumbranceReleaseExecutionRecord }>;

  listExecutions(
    context: EncumbranceReleaseGovernanceContext,
    mandateId: string,
  ): Promise<readonly EncumbranceReleaseExecutionRecord[]>;

  /** The confirmed successful execution of a mandate, or `null`. The recovery path's entry point: a mandate with one of these whose constraint is still active is a crash to finish, not a state to repair by hand. */
  getConfirmedExecution(
    context: EncumbranceReleaseGovernanceContext,
    mandateId: string,
  ): Promise<EncumbranceReleaseExecutionRecord | null>;

  /** Withdraws a release authorization before it is spent. Nothing external is released, and the constraint is untouched. Refuses a mandate that is already terminal. */
  revokeMandate(
    context: EncumbranceReleaseGovernanceContext,
    input: RevokeEncumbranceReleaseMandateInput,
  ): Promise<EncumbranceReleaseRevokeOutcome>;

  getRevocation(context: EncumbranceReleaseGovernanceContext, mandateId: string): Promise<EncumbranceReleaseMandateRevocationRecord | null>;

  health(): Promise<EncumbranceReleaseMandateStoreHealth>;

  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Tenancy guards — identical in intent and wording to
// `canAccessCollateralizationOrganization` and its neighbours, so one tenancy
// rule is learned once and applies everywhere.
// ---------------------------------------------------------------------------

export function canAccessEncumbranceReleaseOrganization(
  context: EncumbranceReleaseGovernanceContext,
  recordOrganizationId: string,
): boolean {
  if (context.system) return true;
  return context.organizationId !== undefined && context.organizationId === recordOrganizationId;
}

export function requireEncumbranceReleaseTenantScope(context: EncumbranceReleaseGovernanceContext): void {
  if (!context.system && (context.organizationId === undefined || context.organizationId.length === 0)) {
    throw new EncumbranceReleaseGovernanceError(
      'ENCUMBRANCE_RELEASE_TENANT_SCOPE_REQUIRED',
      'A non-system caller must provide an organization scope for encumbrance release governance data.',
    );
  }
}

export function requireEncumbranceReleaseAccessToOrganization(
  context: EncumbranceReleaseGovernanceContext,
  organizationId: string,
): void {
  requireEncumbranceReleaseTenantScope(context);
  if (!canAccessEncumbranceReleaseOrganization(context, organizationId)) {
    throw new EncumbranceReleaseGovernanceError(
      'ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION',
      `The caller is not authorized to access encumbrance release governance data for organization '${organizationId}'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Strict UTC timestamps — the same rule the five action stores enforce: a
// trailing offset like `+02:00` is well-formed ISO 8601 and is NOT accepted,
// so every durably recorded instant here is unambiguously UTC on its face.
// ---------------------------------------------------------------------------

const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]00:00)$/;

export function isStrictUtcEncumbranceReleaseTimestamp(value: unknown): value is string {
  return typeof value === 'string' && STRICT_UTC_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function requireStrictUtcEncumbranceReleaseTimestamp(value: unknown, fieldName: string): string {
  if (!isStrictUtcEncumbranceReleaseTimestamp(value)) {
    throw new EncumbranceReleaseGovernanceError(
      'ENCUMBRANCE_RELEASE_INVALID_TIMESTAMP',
      `${fieldName} must be a strict UTC ISO 8601 timestamp (e.g. '2026-08-06T12:00:00.000Z'); received '${String(value)}'.`,
      { fieldName },
    );
  }
  return value;
}
