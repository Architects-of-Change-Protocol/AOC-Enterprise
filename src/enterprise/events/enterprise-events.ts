import type { KernelEvaluationResult } from '../../kernel/index.js';
import type { EnterpriseLifecycleEvent } from '../lifecycle/lifecycle-events.js';

/**
 * The Soberanía Enterprise Host's own event catalog. These are
 * operational/integration events about the *hosting* of an evaluation, not
 * governance decisions -- the Kernel neither emits nor knows about them
 * (see `ports.ts`'s documented omission of a `KernelEventSink`). The event
 * *names* below (`GovernanceEvaluation...`) describe domain-neutral
 * Enterprise operations and are unchanged from the prior `kernel-host`
 * naming; only the surrounding TypeScript type names were renamed to avoid
 * colliding with the unrelated `src/runtime/` module.
 */
export type EnterpriseEventType =
  | 'GovernanceEvaluationRequested'
  | 'GovernanceEvaluationCompleted'
  | 'GovernanceEvaluationDenied'
  | 'GovernanceEvaluationApprovalRequired'
  | 'GovernanceEvaluationFailed'
  /** Post-commit only (PR-004): the Governance Store durably committed this evaluation's aggregate. Never published before the transaction commits. */
  | 'GovernanceRecordCommitted'
  /** The Governance Store transaction failed and rolled back; the evaluation was NOT durably recorded and the caller received an infrastructure failure. */
  | 'GovernanceRecordCommitFailed';

export interface EnterpriseEventBase {
  readonly eventId: string;
  readonly type: EnterpriseEventType;
  readonly occurredAt: string;
  readonly requestId: string;
  readonly correlationId?: string;
}

export interface GovernanceEvaluationRequestedEvent extends EnterpriseEventBase {
  readonly type: 'GovernanceEvaluationRequested';
}

/**
 * Covers every post-evaluation outcome, including `indeterminate`
 * (`GovernanceEvaluationFailed`) -- the Kernel always returns a full
 * `KernelEvaluationResult` for `evaluate()`, even when its own
 * `recognitionProvider` dependency failed, so there is always a
 * decision/reason-code shape to report, never a bare error.
 */
export interface GovernanceEvaluationCompletedEvent extends EnterpriseEventBase {
  readonly type: 'GovernanceEvaluationCompleted' | 'GovernanceEvaluationDenied' | 'GovernanceEvaluationApprovalRequired' | 'GovernanceEvaluationFailed';
  readonly decisionId: string;
  readonly status: KernelEvaluationResult['status'];
  readonly reasonCodes: readonly string[];
  readonly kernelVersion: string;
}

/** Published only after the Governance Store transaction commits (mission PR-004 section 63) — event timing is part of the persistence invariant, not decoration. */
export interface GovernanceRecordCommittedEvent extends EnterpriseEventBase {
  readonly type: 'GovernanceRecordCommitted';
  readonly decisionId: string;
  readonly evaluationId: string;
  readonly aggregateDigest: string;
}

/** Published (best-effort) when the Governance Store commit fails; the evaluation response is an infrastructure failure, never a governed success. */
export interface GovernanceRecordCommitFailedEvent extends EnterpriseEventBase {
  readonly type: 'GovernanceRecordCommitFailed';
  readonly errorCode: string;
}

/**
 * PR-007 Assurance Runtime operational events (mission section 69). These
 * are notifications that Assurance work happened -- the canonical assessment
 * and finding history lives in the Assurance Store, never here. Deliberately
 * a distinct shape from `EnterpriseEventBase` (no `requestId`: an assessment
 * is not a governance evaluation) and without `lifecycleCorrelationId`, so
 * the composition root's lifecycle-persistence subscription ignores them.
 */
export type AssuranceEnterpriseEventType =
  | 'AssuranceAssessmentCreated'
  | 'AssuranceEvidenceCollectionStarted'
  | 'AssuranceEvidenceResolved'
  | 'AssuranceControlEvaluated'
  | 'AssuranceFindingCreated'
  | 'AssuranceManualReviewRequested'
  | 'AssuranceManualReviewCompleted'
  | 'AssuranceDomainEvaluated'
  | 'AssuranceScoreCalculated'
  | 'AssuranceEligibilityEvaluated'
  | 'AssuranceAssessmentCompleted'
  | 'AssuranceAssessmentFailed'
  | 'AssuranceAssessmentSuperseded'
  | 'AssuranceAssessmentMarkedStale'
  | 'AssuranceSignalReceived'
  | 'AssuranceReassessmentRequested';

export interface AssuranceEnterpriseEvent {
  readonly eventId: string;
  readonly type: AssuranceEnterpriseEventType;
  readonly occurredAt: string;
  /** The Assurance correlation identity (assessment or subject id). Named `requestId` for union uniformity with governance events -- consumers that read `event.requestId` keep working unchanged. */
  readonly requestId: string;
  readonly correlationId?: string;
  readonly assessmentId?: string;
  readonly organizationId?: string;
  readonly subjectId?: string;
  /** Bounded structured detail (ids, statuses, codes) -- never evidence payloads, scores' full traces, or secrets. */
  readonly detail?: Readonly<Record<string, unknown>>;
}

/**
 * `EnterpriseLifecycleEvent` (`../lifecycle/lifecycle-events.ts`) is folded
 * into this same publisher's event union so lifecycle events flow through
 * the one Enterprise event system the mission asks for -- no second event
 * bus. Existing `GovernanceEvaluation*` event names/shapes are unchanged.
 */
export type EnterpriseEvent =
  | GovernanceEvaluationRequestedEvent
  | GovernanceEvaluationCompletedEvent
  | GovernanceRecordCommittedEvent
  | GovernanceRecordCommitFailedEvent
  | EnterpriseLifecycleEvent
  | AssuranceEnterpriseEvent;

export interface EnterpriseEventPublisher {
  publish(event: EnterpriseEvent): Promise<void>;
  subscribe(listener: (event: EnterpriseEvent) => void): () => void;
}

/**
 * Simple in-process publisher. The mission explicitly permits this ("Do not
 * introduce distributed messaging infrastructure unless already present"),
 * and nothing in this repository runs a message broker today.
 */
export function createInProcessEventPublisher(): EnterpriseEventPublisher {
  const listeners = new Set<(event: EnterpriseEvent) => void>();

  return {
    async publish(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
