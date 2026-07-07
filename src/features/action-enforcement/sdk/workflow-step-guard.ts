import type { EnforcementMode } from '../domain/enforcement-request.js';
import type { EnforcementOutcome } from '../domain/enforcement-outcome.js';
import type { AocGuard, GuardActionRequestInput } from './aoc-guard.js';

export interface WorkflowStepInput<T> {
  readonly stepId: string;
  readonly actorId: string;
  readonly principalActorId?: string;
  readonly trustDomainId: string;

  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;

  readonly idempotencyKey?: string;
  readonly mode?: EnforcementMode;

  readonly execute: () => Promise<T> | T;
}

/** Guards a workflow/orchestration step. The step never runs unless enforcement returns execute_allowed. */
export class WorkflowStepGuard {
  constructor(private readonly guard: AocGuard) {}

  async runStep<T>(input: WorkflowStepInput<T>): Promise<EnforcementOutcome<T>> {
    const guardInput: GuardActionRequestInput = {
      actorId: input.actorId,
      trustDomainId: input.trustDomainId,
      action: input.action,
      resourceScope: input.resourceScope,
      targetType: 'workflow_step',
      targetName: input.stepId,
      adapterId: input.stepId,
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
    };
    return this.guard.enforce(guardInput, input.execute);
  }
}

export function createWorkflowStepGuard(guard: AocGuard): WorkflowStepGuard {
  return new WorkflowStepGuard(guard);
}
