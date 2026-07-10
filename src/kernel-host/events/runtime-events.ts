import type { KernelEvaluationResult } from '../../kernel/index.js';

/**
 * The Runtime's own event catalog. These are operational/integration
 * events about the *hosting* of an evaluation, not governance decisions --
 * the Kernel neither emits nor knows about them (see `ports.ts`'s
 * documented omission of a `KernelEventSink`).
 */
export type RuntimeEventType =
  | 'GovernanceEvaluationRequested'
  | 'GovernanceEvaluationCompleted'
  | 'GovernanceEvaluationDenied'
  | 'GovernanceEvaluationApprovalRequired'
  | 'GovernanceEvaluationFailed';

export interface RuntimeEventBase {
  readonly eventId: string;
  readonly type: RuntimeEventType;
  readonly occurredAt: string;
  readonly requestId: string;
  readonly correlationId?: string;
}

export interface GovernanceEvaluationRequestedEvent extends RuntimeEventBase {
  readonly type: 'GovernanceEvaluationRequested';
}

/**
 * Covers every post-evaluation outcome, including `indeterminate`
 * (`GovernanceEvaluationFailed`) -- the Kernel always returns a full
 * `KernelEvaluationResult` for `evaluate()`, even when its own
 * `recognitionProvider` dependency failed, so there is always a
 * decision/reason-code shape to report, never a bare error.
 */
export interface GovernanceEvaluationCompletedEvent extends RuntimeEventBase {
  readonly type: 'GovernanceEvaluationCompleted' | 'GovernanceEvaluationDenied' | 'GovernanceEvaluationApprovalRequired' | 'GovernanceEvaluationFailed';
  readonly decisionId: string;
  readonly status: KernelEvaluationResult['status'];
  readonly reasonCodes: readonly string[];
  readonly kernelVersion: string;
}

export type RuntimeEvent = GovernanceEvaluationRequestedEvent | GovernanceEvaluationCompletedEvent;

export interface RuntimeEventPublisher {
  publish(event: RuntimeEvent): Promise<void>;
  subscribe(listener: (event: RuntimeEvent) => void): () => void;
}

/**
 * Simple in-process publisher. The mission explicitly permits this ("Do not
 * introduce distributed messaging infrastructure unless already present"),
 * and nothing in this repository runs a message broker today.
 */
export function createInProcessEventPublisher(): RuntimeEventPublisher {
  const listeners = new Set<(event: RuntimeEvent) => void>();

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
