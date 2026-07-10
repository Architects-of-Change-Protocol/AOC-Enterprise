import type { KernelEvaluationResult } from '../../kernel/index.js';
import type { EnterpriseLifecycleEvent } from '../lifecycle/lifecycle-events.js';

/**
 * The AOC Enterprise Host's own event catalog. These are
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
  | 'GovernanceEvaluationFailed';

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

/**
 * `EnterpriseLifecycleEvent` (`../lifecycle/lifecycle-events.ts`) is folded
 * into this same publisher's event union so lifecycle events flow through
 * the one Enterprise event system the mission asks for -- no second event
 * bus. Existing `GovernanceEvaluation*` event names/shapes are unchanged.
 */
export type EnterpriseEvent = GovernanceEvaluationRequestedEvent | GovernanceEvaluationCompletedEvent | EnterpriseLifecycleEvent;

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
