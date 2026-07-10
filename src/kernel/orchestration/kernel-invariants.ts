import type { KernelEvaluationRequest } from '../contracts/kernel-request.js';
import type { KernelEvaluationResult } from '../contracts/kernel-result.js';
import { KernelInvariantError } from '../errors/kernel-errors.js';

/**
 * Mechanically-checkable invariants from `docs/kernel/AOC_KERNEL_INVARIANTS_V1.md`.
 * Asserted on every `AocKernel.evaluate()`/`enforce()` call; a violation here
 * means the wrapped engine (or the kernel's own adapters) produced output
 * inconsistent with a documented invariant -- a bug, not a governance
 * outcome, hence a thrown `KernelInvariantError` rather than a result field.
 */

/** Invariant 1: no action may be allowed for an unrecognized actor. */
export function assertRecognitionPrecedesAllow(result: KernelEvaluationResult): void {
  if (result.status === 'allowed' && (!result.recognition.performed || result.recognition.recognized !== true)) {
    throw new KernelInvariantError(
      `Kernel invariant violated: decision ${result.decisionId} was 'allowed' without a performed, recognized recognition evaluation.`,
    );
  }
}

/** Invariant 8: every terminal result must contain machine-readable reasons. */
export function assertReasonCodesPresent(result: KernelEvaluationResult): void {
  if (result.reasonCodes.length === 0) {
    throw new KernelInvariantError(`Kernel invariant violated: decision ${result.decisionId} carries no reason codes.`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord).sort();
  const bKeys = Object.keys(bRecord).sort();
  if (aKeys.length !== bKeys.length || aKeys.some((key, index) => key !== bKeys[index])) {
    return false;
  }
  return aKeys.every((key) => deepEqual(aRecord[key], bRecord[key]));
}

/**
 * No mutation of input: compares the request as originally received against
 * its state after evaluation completed. Structural (order-independent),
 * not a reference check, since the adapters legitimately build new objects
 * from the request's fields rather than mutating it in place.
 */
export function assertRequestNotMutated(before: KernelEvaluationRequest, after: KernelEvaluationRequest): void {
  if (!deepEqual(before, after)) {
    throw new KernelInvariantError(`Kernel invariant violated: KernelEvaluationRequest ${before.requestId} was mutated during evaluation.`);
  }
}

export function assertKernelInvariants(request: KernelEvaluationRequest, requestSnapshot: KernelEvaluationRequest, result: KernelEvaluationResult): void {
  assertRequestNotMutated(requestSnapshot, request);
  assertReasonCodesPresent(result);
  assertRecognitionPrecedesAllow(result);
}
