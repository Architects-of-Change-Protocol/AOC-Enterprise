import { computeDigest } from './digest.js';
import type { GovernanceIntegrityFailure, GovernanceRecord, GovernanceRecordVerificationResult, GovernanceReferenceChainState } from './contracts.js';
import { verifyGovernanceReferenceIntegrity } from './reference-integrity.js';
import {
  computeAggregateDigest,
  evaluationRecordDigestInput,
  eventRecordDigestInput,
  eventRecordsDigestInput,
  metadataDigestInput,
  requestRecordDigestInput,
  traceRecordsDigestInput,
  traceStepDigestInput,
} from './projection.js';

/**
 * Pure integrity verification over a reconstructed `GovernanceRecord`.
 * Every digest is *recomputed* from the stored canonical payloads via the
 * exact digest-input definitions in `projection.ts`; stored digest values
 * are compared against the recomputation, never trusted.
 *
 * `expectedPreviousAggregateDigest` is the `aggregateDigest` of the
 * previously committed aggregate in the store-scoped chain (as loaded by
 * the store), `null` when this is the first aggregate, and `undefined` when
 * the store could not resolve the predecessor (chain check reported as a
 * failure rather than skipped).
 *
 * `referenceChain` is the stored head of this evaluation's protected
 * reference chain (`null` when no head row exists). Reference integrity is a
 * **separate domain**: it is checked here so one call answers "is this record
 * intact?", but it contributes nothing to any aggregate digest, and the
 * aggregate digest computation below is byte-for-byte what it always was.
 * That separation is deliberate and load-bearing — see
 * `docs/architecture/ADR-GOVERNANCE-REFERENCE-INTEGRITY.md`.
 */
export function verifyGovernanceRecordIntegrity(
  record: GovernanceRecord,
  expectedPreviousAggregateDigest: string | null | undefined,
  now: () => string,
  referenceChain?: GovernanceReferenceChainState | null,
): GovernanceRecordVerificationResult {
  const failures: GovernanceIntegrityFailure[] = [];
  const integrity = record.integrity;

  // -- request --
  const recomputedPayloadDigest = computeDigest(record.request.requestPayload);
  if (recomputedPayloadDigest !== record.request.payloadDigest) {
    failures.push({ check: 'requestDigest', message: 'Recomputed request payload digest does not match the stored payloadDigest column.' });
  }
  const recomputedRequestDigest = computeDigest(requestRecordDigestInput(record.request));
  if (recomputedRequestDigest !== integrity.requestDigest) {
    failures.push({ check: 'requestDigest', message: 'Recomputed request record digest does not match integrity.requestDigest.' });
  }
  const requestOk = recomputedPayloadDigest === record.request.payloadDigest && recomputedRequestDigest === integrity.requestDigest;

  // -- evaluation --
  const recomputedResultDigest = computeDigest(record.evaluation.resultPayload);
  if (recomputedResultDigest !== record.evaluation.resultDigest) {
    failures.push({ check: 'evaluationDigest', message: 'Recomputed result payload digest does not match the stored resultDigest column.' });
  }
  const recomputedEvaluationDigest = computeDigest(evaluationRecordDigestInput(record.evaluation));
  if (recomputedEvaluationDigest !== integrity.evaluationDigest) {
    failures.push({ check: 'evaluationDigest', message: 'Recomputed evaluation record digest does not match integrity.evaluationDigest.' });
  }
  const evaluationOk = recomputedResultDigest === record.evaluation.resultDigest && recomputedEvaluationDigest === integrity.evaluationDigest;

  // -- trace (each step's own digest, then the ordered set) --
  let traceOk = true;
  for (const step of record.trace) {
    const { traceDigest, ...withoutDigest } = step;
    if (computeDigest(traceStepDigestInput(withoutDigest)) !== traceDigest) {
      traceOk = false;
      failures.push({ check: 'traceDigest', message: `Recomputed digest for trace step ${step.sequence} does not match its stored traceDigest.` });
    }
  }
  if (computeDigest(traceRecordsDigestInput(record.trace)) !== integrity.traceDigest) {
    traceOk = false;
    failures.push({ check: 'traceDigest', message: 'Recomputed trace-set digest does not match integrity.traceDigest.' });
  }

  // -- events (each event's own digest, then the ordered set) --
  let eventsOk = true;
  for (const event of record.events) {
    const { eventDigest, ...withoutDigest } = event;
    if (computeDigest(eventRecordDigestInput(withoutDigest)) !== eventDigest) {
      eventsOk = false;
      failures.push({ check: 'eventsDigest', message: `Recomputed digest for event '${event.eventId}' does not match its stored eventDigest.` });
    }
  }
  if (computeDigest(eventRecordsDigestInput(record.events)) !== integrity.eventsDigest) {
    eventsOk = false;
    failures.push({ check: 'eventsDigest', message: 'Recomputed event-set digest does not match integrity.eventsDigest.' });
  }

  // -- metadata --
  const metadataOk = computeDigest(metadataDigestInput(record.metadata)) === integrity.metadataDigest;
  if (!metadataOk) {
    failures.push({ check: 'metadataDigest', message: 'Recomputed metadata digest does not match integrity.metadataDigest.' });
  }

  // -- aggregate (over the *recomputed* component digests, so a component tamper also fails here honestly) --
  const recomputedAggregateDigest = computeAggregateDigest({
    requestDigest: recomputedRequestDigest,
    evaluationDigest: recomputedEvaluationDigest,
    traceDigest: computeDigest(traceRecordsDigestInput(record.trace)),
    eventsDigest: computeDigest(eventRecordsDigestInput(record.events)),
    metadataDigest: computeDigest(metadataDigestInput(record.metadata)),
    ...(integrity.previousAggregateDigest !== undefined ? { previousAggregateDigest: integrity.previousAggregateDigest } : {}),
  });
  const aggregateOk = recomputedAggregateDigest === integrity.aggregateDigest;
  if (!aggregateOk) {
    failures.push({ check: 'aggregateDigest', message: 'Recomputed aggregate digest does not match integrity.aggregateDigest.' });
  }

  // -- chain linkage --
  let previousOk: boolean | undefined;
  if (integrity.chainPosition > 1 || integrity.previousAggregateDigest !== undefined) {
    if (expectedPreviousAggregateDigest === undefined) {
      previousOk = false;
      failures.push({ check: 'previousDigest', message: 'The predecessor aggregate in the store chain could not be resolved.' });
    } else if (expectedPreviousAggregateDigest === null) {
      previousOk = false;
      failures.push({ check: 'previousDigest', message: 'This aggregate references a previous digest but the store chain has no predecessor for it.' });
    } else {
      previousOk = integrity.previousAggregateDigest === expectedPreviousAggregateDigest;
      if (!previousOk) {
        failures.push({ check: 'previousDigest', message: 'integrity.previousAggregateDigest does not match the aggregateDigest of the preceding chain entry.' });
      }
    }
  }

  // -- reference integrity (second domain; contributes to `valid`, never to a digest) --
  const referenceResult = verifyGovernanceReferenceIntegrity(record.references, record.request.organizationId, referenceChain);
  failures.push(...referenceResult.failures);

  const checks = {
    requestDigest: requestOk,
    evaluationDigest: evaluationOk,
    traceDigest: traceOk,
    eventsDigest: eventsOk,
    metadataDigest: metadataOk,
    aggregateDigest: aggregateOk,
    ...(previousOk !== undefined ? { previousDigest: previousOk } : {}),
    referenceIntegrity: referenceResult.valid,
  };

  return {
    evaluationId: record.evaluation.evaluationId,
    valid: failures.length === 0,
    checks,
    verifiedAt: now(),
    failures,
    referenceIntegrity: referenceResult.summary,
  };
}
