import type { GovernedAuthorityEncumbrance } from '@aoc-enterprise/governed-authority';

import { EncumbranceReleaseGovernanceError } from './errors.js';
import type { EncumbranceReleaseMandateRecord, EncumbranceReleaseResourceRef } from './contracts.js';

/**
 * The rules deciding what a governed release may be — expressed once as pure
 * functions over records, the same arrangement every other action module uses,
 * and for the same reason: the in-memory and SQLite stores must not drift into
 * two different notions of "executable", or the shared contract suite proves
 * nothing about the durable one.
 *
 * Every check here is expressed against the *stored* constraint and the
 * *stored* mandate. Nothing a caller restated is trusted, and nothing is
 * coerced: a request naming a resource that is not the constraint's resource is
 * refused rather than reinterpreted as having meant the constraint's.
 */

/**
 * Whether a mandate may still be executed at an instant, and why not when it
 * cannot.
 *
 * Called before the executor is reached, never after. That ordering is the
 * whole point: a revoked or lapsed authorization must not produce an external
 * release that AOC then has to decide what to do with.
 */
export function assertEncumbranceReleaseMandateExecutable(mandate: EncumbranceReleaseMandateRecord, at: string): void {
  if (mandate.status === 'revoked') {
    throw new EncumbranceReleaseGovernanceError(
      'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
      `Encumbrance release mandate '${mandate.id}' was revoked; the authorization to discharge this constraint no longer exists and no executor is called.`,
      { mandateId: mandate.id, status: mandate.status },
    );
  }
  if (mandate.status === 'executed') {
    throw new EncumbranceReleaseGovernanceError(
      'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
      `Encumbrance release mandate '${mandate.id}' has already been spent by a confirmed release; it authorizes exactly one discharge.`,
      { mandateId: mandate.id, status: mandate.status, ...(mandate.executionRef !== undefined ? { executionRef: mandate.executionRef } : {}) },
    );
  }

  const instant = Date.parse(at);
  if (instant < Date.parse(mandate.effectiveFrom)) {
    throw new EncumbranceReleaseGovernanceError(
      'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
      `Encumbrance release mandate '${mandate.id}' is not effective until '${mandate.effectiveFrom}'.`,
      { mandateId: mandate.id, effectiveFrom: mandate.effectiveFrom, at },
    );
  }
  if (instant >= Date.parse(mandate.expiresAt)) {
    // Expiry is not release. An authorization that ran out authorized nothing
    // further; the arrangement it was going to discharge is exactly as it was.
    throw new EncumbranceReleaseGovernanceError(
      'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
      `Encumbrance release mandate '${mandate.id}' expired at '${mandate.expiresAt}'; an expired authorization releases nothing.`,
      { mandateId: mandate.id, expiresAt: mandate.expiresAt, at },
    );
  }
}

/**
 * Whether a stored constraint is the one a request or a mandate names.
 *
 * The tenant and resource correspondence checks, made against the canonical
 * record rather than against anything the caller supplied. A cross-tenant
 * target is refused before any decision is produced, and a resource that does
 * not match is refused rather than coerced — "you asked about asset B, the
 * constraint is on asset A, so you must have meant A" is exactly the
 * reinterpretation that turns an authority scoped to A into an authority over
 * B.
 */
export function assertEncumbranceMatchesTarget(
  encumbrance: GovernedAuthorityEncumbrance,
  target: { readonly organizationId: string; readonly resource: EncumbranceReleaseResourceRef },
): void {
  if (encumbrance.tenantId !== target.organizationId) {
    throw new EncumbranceReleaseGovernanceError(
      'ENCUMBRANCE_RELEASE_TARGET_MISMATCH',
      `Governed authority encumbrance '${encumbrance.id}' is governed by tenant '${encumbrance.tenantId}'; organization '${target.organizationId}' cannot request its release.`,
      { encumbranceRef: encumbrance.id, encumbranceTenantId: encumbrance.tenantId, organizationId: target.organizationId },
    );
  }
  if (encumbrance.resourceKind !== target.resource.kind || encumbrance.resourceId !== target.resource.id) {
    throw new EncumbranceReleaseGovernanceError(
      'ENCUMBRANCE_RELEASE_TARGET_MISMATCH',
      `Governed authority encumbrance '${encumbrance.id}' constrains authority over '${encumbrance.resourceKind}:${encumbrance.resourceId}', not '${target.resource.kind}:${target.resource.id}'.`,
      {
        encumbranceRef: encumbrance.id,
        encumbranceResource: `${encumbrance.resourceKind}:${encumbrance.resourceId}`,
        requestedResource: `${target.resource.kind}:${target.resource.id}`,
      },
    );
  }
}

/**
 * Whether a constraint is still standing, and therefore still something a
 * release could end.
 *
 * A constraint that is already released is not an error in every context — the
 * idempotent replay of the execution that ended it is a legitimate call — so
 * this is asserted by the caller that knows which context it is in, rather than
 * folded into the load.
 */
export function assertEncumbranceActive(encumbrance: GovernedAuthorityEncumbrance): void {
  if (encumbrance.status !== 'active') {
    throw new EncumbranceReleaseGovernanceError(
      'ENCUMBRANCE_RELEASE_TARGET_NOT_ACTIVE',
      `Governed authority encumbrance '${encumbrance.id}' is '${encumbrance.status}', not 'active'; there is nothing left for a release to end.`,
      {
        encumbranceRef: encumbrance.id,
        status: encumbrance.status,
        ...(encumbrance.releaseExecutionRef !== undefined ? { releaseExecutionRef: encumbrance.releaseExecutionRef } : {}),
      },
    );
  }
}

/**
 * The idempotency identity an external release is performed under: one per
 * release authorization.
 *
 * Derived from the mandate rather than from the attempt, deliberately. A
 * mandate authorizes exactly one discharge, so every retry after an
 * indeterminate outcome presents the same key and a conforming adapter performs
 * at most one external release however many times AOC asks — which is the whole
 * of what makes retrying an unknown outcome safe.
 */
export function deriveEncumbranceReleaseIdempotencyKey(mandate: EncumbranceReleaseMandateRecord): string {
  return `${mandate.id}:${mandate.encumbranceRef}`;
}

/** A resource scope string, in the same `kind:id` form Enterprise already uses for a resource identifier. */
export function encumbranceReleaseResourceScope(resource: { readonly kind: string; readonly id: string }): string {
  return `${resource.kind}:${resource.id}`;
}

/** Refuses a reference that is missing, not a string, or empty. A blank reference is not a reference, and the four action modules refuse one the same way. */
export function requireEncumbranceReleaseRef(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new EncumbranceReleaseGovernanceError(
      'ENCUMBRANCE_RELEASE_VALIDATION_ERROR',
      `${fieldName} is required and must be a non-empty string.`,
      { fieldName },
    );
  }
  return value;
}
