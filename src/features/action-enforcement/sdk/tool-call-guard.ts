import type { EnforcementOutcome } from '../domain/enforcement-outcome.js';
import type { ExecutionRiskLevel } from '../domain/execution-intent.js';
import type { SideEffectType } from '../domain/side-effect.js';
import type { AocGuard, GuardActionRequestInput } from './aoc-guard.js';

export interface ToolCallInput<T> {
  readonly actorId: string;
  readonly principalActorId?: string;
  readonly trustDomainId: string;

  readonly toolName: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;

  readonly riskLevel?: ExecutionRiskLevel;
  readonly sideEffectType?: SideEffectType;
  readonly idempotencyKey?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;

  readonly execute: () => Promise<T> | T;
}

/** Guards agent tool calls. The tool function never runs unless enforcement returns execute_allowed. */
export class ToolCallGuard {
  constructor(private readonly guard: AocGuard) {}

  async execute<T>(input: ToolCallInput<T>): Promise<EnforcementOutcome<T>> {
    const guardInput: GuardActionRequestInput = {
      actorId: input.actorId,
      trustDomainId: input.trustDomainId,
      action: input.action,
      resourceScope: input.resourceScope,
      targetType: 'tool_call',
      targetName: input.toolName,
      adapterId: input.toolName,
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel } : {}),
      ...(input.sideEffectType !== undefined ? { sideEffectType: input.sideEffectType } : {}),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    return this.guard.enforce(guardInput, input.execute);
  }
}

export function createToolCallGuard(guard: AocGuard): ToolCallGuard {
  return new ToolCallGuard(guard);
}
