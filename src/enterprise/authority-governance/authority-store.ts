import type { GovernedAuthorityPosition, GovernedAuthorityTransition } from '@aoc-enterprise/governed-authority';
import type { GovernedRightType } from '@aoc-enterprise/governed-authorization';

import { AuthorityGovernanceError } from './errors.js';
import type {
  ApplyGovernedAuthorityTransitionInput,
  ApplyGovernedAuthorityTransitionOutcome,
  AuthorityGovernanceContext,
  BootstrapGovernedAuthorityInput,
  GovernedAuthorityProvenance,
  GovernedAuthorityResourceRef,
  GovernedAuthorityStoreHealth,
} from './contracts.js';

/**
 * The durable Governed Authority Store: the recognized right-scoped authority
 * positions of a deployment, and the append-only transition history that
 * produced them.
 *
 * An independent store, never persisted inside the Governance Store, the
 * TransferMandate Store or any other module's tables — the same "one store per
 * Enterprise entity" precedent `../governance-store/`,
 * `../access-governance/`, `../tokenization-governance/`,
 * `../collateralization-governance/`, `../license-governance/` and
 * `../transfer-governance/` already establish.
 *
 * Deliberately entity-specific rather than a generic ledger abstraction. There
 * are exactly two ways state changes here — issue authority that did not exist
 * (privileged), and move authority that did (evidenced) — so there is no
 * generic `update`, no `setBalance`, no `delete`, and no path by which a
 * caller could write a position directly.
 *
 * Note what this interface deliberately does *not* offer, and why:
 *
 * - **No revocation.** Withdrawing an actor's underlying authority is a
 *   different governance event from revoking a mandate, needs its own
 *   authority basis, and has no existing counterpart in the Authority Graph to
 *   mirror. Adding a generic `revokePosition` here would be inventing a
 *   governance act rather than persisting one.
 * - **No reversal.** A reported reversal is an observation, and an observation
 *   must not silently rewrite authority.
 * - **No reservation.** Mandate issuance reserves nothing; see
 *   `docs/architecture/ADR-GOVERNED-AUTHORITY-TRANSITION.md`, "Reservation
 *   decision".
 * - **No broad query surface.** `listPositionsForHolder` and `getProvenance`
 *   exist for enforcement and audit respectively; there is no "list everything
 *   this tenant holds" report, because nothing needs one yet.
 */
export interface GovernedAuthorityStore {
  readonly providerKind: 'memory' | 'sqlite';

  /**
   * Creates or increases authority from a privileged basis. Throws
   * `GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED` unless `context.system`, and
   * `GOVERNED_AUTHORITY_BASIS_INVALID` for a `governed-execution` basis, which
   * is a movement rather than an issuance.
   */
  bootstrapPosition(context: AuthorityGovernanceContext, input: BootstrapGovernedAuthorityInput): Promise<GovernedAuthorityPosition>;

  /**
   * Debits the source holder and credits the target holder by the same
   * quantity, for every named right, in one commit section.
   *
   * Idempotent on `basis.executionRef`: replaying an execution already applied
   * returns the original transitions with `replayed: true`, and performs no
   * second debit and no second credit. Throws
   * `GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE` rather than producing a negative
   * position, and `GOVERNED_AUTHORITY_TRANSITION_CONFLICT` when the same
   * execution reference is replayed against materially different terms.
   */
  applyTransition(
    context: AuthorityGovernanceContext,
    input: ApplyGovernedAuthorityTransitionInput,
  ): Promise<ApplyGovernedAuthorityTransitionOutcome>;

  /** Tenant-scoped lookup of the (at most one) position an actor holds in a right of a resource, or `null`. */
  getPosition(
    context: AuthorityGovernanceContext,
    tenantId: string,
    holderRef: string,
    resource: GovernedAuthorityResourceRef,
    governedRight: GovernedRightType,
  ): Promise<GovernedAuthorityPosition | null>;

  /**
   * Whether this tenant holds *any* governed authority state for a resource.
   *
   * This is the enrollment question, and it is the whole of the legacy
   * compatibility policy: a resource nothing has been recorded against is one
   * this deployment has not enrolled in right-scoped authority, and enforcing
   * a right-scoped check against it would deny every existing deployment's
   * every request. See `resolver.ts`.
   */
  isResourceEnrolled(context: AuthorityGovernanceContext, tenantId: string, resource: GovernedAuthorityResourceRef): Promise<boolean>;

  /** Tenant-scoped list of everything one actor holds over one resource, in a stable order. Used by audit and by the reference scenario, never by the enforcement path. */
  listPositionsForHolder(
    context: AuthorityGovernanceContext,
    tenantId: string,
    holderRef: string,
    resource: GovernedAuthorityResourceRef,
  ): Promise<readonly GovernedAuthorityPosition[]>;

  /** A position and the ordered transitions that produced it. Throws `GOVERNED_AUTHORITY_POSITION_NOT_FOUND` if there is no such position. */
  getProvenance(
    context: AuthorityGovernanceContext,
    tenantId: string,
    holderRef: string,
    resource: GovernedAuthorityResourceRef,
    governedRight: GovernedRightType,
  ): Promise<GovernedAuthorityProvenance>;

  /** Tenant-scoped, append-ordered transitions recorded under one execution reference. Empty when that execution has never been applied — which is what makes recovery after a crash between stores decidable. */
  listTransitionsByExecutionRef(
    context: AuthorityGovernanceContext,
    tenantId: string,
    executionRef: string,
  ): Promise<readonly GovernedAuthorityTransition[]>;

  health(): Promise<GovernedAuthorityStoreHealth>;

  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Tenancy guards — identical in intent and wording to
// `canAccessTransferOrganization` / `requireTransferAccessToOrganization`
// (`../transfer-governance/mandate-store.ts`), so one tenancy rule is learned
// once and applies everywhere.
// ---------------------------------------------------------------------------

export function canAccessAuthorityOrganization(context: AuthorityGovernanceContext, recordOrganizationId: string): boolean {
  if (context.system) return true;
  return context.organizationId !== undefined && context.organizationId === recordOrganizationId;
}

export function requireAuthorityTenantScope(context: AuthorityGovernanceContext): void {
  if (!context.system && (context.organizationId === undefined || context.organizationId.length === 0)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_TENANT_SCOPE_REQUIRED',
      'A non-system caller must provide an organization scope for governed authority data.',
    );
  }
}

export function requireAuthorityAccessToOrganization(context: AuthorityGovernanceContext, organizationId: string): void {
  requireAuthorityTenantScope(context);
  if (!canAccessAuthorityOrganization(context, organizationId)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION',
      `The caller is not authorized to access governed authority data for organization '${organizationId}'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Strict UTC timestamps — the same rule the four action stores enforce: a
// trailing offset like `+02:00` is well-formed ISO 8601 and is NOT accepted,
// so every durably recorded instant here is unambiguously UTC on its face.
// ---------------------------------------------------------------------------

const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]00:00)$/;

export function isStrictUtcAuthorityTimestamp(value: unknown): value is string {
  return typeof value === 'string' && STRICT_UTC_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function requireStrictUtcAuthorityTimestamp(value: unknown, fieldName: string): string {
  if (!isStrictUtcAuthorityTimestamp(value)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_INVALID_TIMESTAMP',
      `${fieldName} must be a strict UTC ISO 8601 timestamp (e.g. '2026-08-06T12:00:00.000Z'); received '${String(value)}'.`,
    );
  }
  return value;
}
