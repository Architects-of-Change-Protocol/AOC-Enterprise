import { ContentProtectionError } from './errors.js';
import type { ProtectedResourceState } from './contracts.js';

/**
 * The ProtectedResource lifecycle state machine (Slice 2 requirement 11:
 * "Define the smallest lifecycle state machine necessary"):
 *
 * ```
 * pending --(protection succeeds)--------------------> active
 * pending --(protection fails before/without upload)-> failed
 * pending --(upload succeeds, finalize persist fails)-> orphaned
 * ```
 *
 * `active`, `failed`, and `orphaned` are all terminal -- this module has no
 * reactivate/retry transition (a retry is a brand-new `protectedResourceId`
 * and a brand-new `'pending'` row, never a mutation of a terminal one).
 * Only a `'pending'` row may transition at all.
 */
export function assertPendingTransitionAllowed(state: ProtectedResourceState): void {
  if (state !== 'pending') {
    throw new ContentProtectionError('CONTENT_PROTECTION_INVALID_STATE_TRANSITION', `ProtectedResource is '${state}', not 'pending'; no further state transition is permitted.`);
  }
}

/** True only for `'active'` -- the sole state from which a legitimate future `KeyBroker` may ever consider releasing key material. Never true for `'pending'`/`'failed'`/`'orphaned'`. */
export function isActiveProtectedResource(state: ProtectedResourceState): boolean {
  return state === 'active';
}
