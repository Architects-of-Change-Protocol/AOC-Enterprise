import type { EnforcementAdapterType } from '../domain/enforcement-adapter.js';
import type { EnforcementDecision } from '../domain/enforcement-decision.js';
import type { EnforcementMode } from '../domain/enforcement-request.js';
import type { EnforcementOutcome } from '../domain/enforcement-outcome.js';
import type { EnforcementTarget, EnforcementTargetType } from '../domain/enforcement-target.js';
import type { ExecutionIntent, ExecutionRiskLevel } from '../domain/execution-intent.js';
import type { SideEffectType } from '../domain/side-effect.js';
import type { ActionEnforcementRuntime } from '../runtime/action-enforcement-runtime.js';

export interface GuardActionRequestInput {
  readonly actorId: string;
  readonly principalActorId?: string;
  readonly trustDomainId: string;

  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;

  readonly targetId?: string;
  readonly targetType?: EnforcementTargetType;
  readonly targetName?: string;
  readonly adapterId?: string;

  readonly riskLevel?: ExecutionRiskLevel;
  readonly sideEffectType?: SideEffectType;
  readonly description?: string;

  readonly idempotencyKey?: string;
  readonly mode?: EnforcementMode;
  readonly expiresAt?: string;
  readonly actionRequestId?: string;

  readonly approvalProofId?: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeProofId?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type GuardPreflightInput = GuardActionRequestInput;

export interface GuardExecutionInput<T> extends GuardActionRequestInput {
  readonly adapterType?: EnforcementAdapterType;
  readonly execute: () => Promise<T> | T;
}

function buildTarget(input: GuardActionRequestInput, adapterType?: EnforcementAdapterType): EnforcementTarget {
  const type: EnforcementTargetType = input.targetType ?? adapterType ?? 'generic';
  return {
    id: input.targetId ?? `target-${type}-${input.action}`,
    type,
    name: input.targetName ?? input.action,
    ...(input.adapterId !== undefined ? { adapterId: input.adapterId } : {}),
  };
}

function buildIntent(input: GuardActionRequestInput): ExecutionIntent {
  return {
    id: `intent-${input.actorId}-${input.action}-${input.resourceScope}`,
    action: input.action,
    resourceScope: input.resourceScope,
    riskLevel: input.riskLevel ?? 'medium',
    sideEffectType: input.sideEffectType ?? 'write',
    ...(input.capability !== undefined ? { capability: input.capability } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  };
}

/**
 * The primary SDK entry point: `await aocGuard.enforce(actionRequest, execute)`.
 * If AOC does not return `execute_allowed`, `execute` is never invoked.
 */
export class AocGuard {
  constructor(private readonly runtime: ActionEnforcementRuntime) {}

  preflight(input: GuardPreflightInput): EnforcementDecision {
    const request = this.buildRequest(input, input.mode ?? 'preflight');
    return this.runtime.preflight(request);
  }

  async enforce<T>(input: GuardActionRequestInput, execute: () => Promise<T> | T): Promise<EnforcementOutcome<T>> {
    const request = this.buildRequest(input, input.mode ?? 'execute');
    return this.runtime.enforce(request, execute);
  }

  async verifyAndExecute<T>(input: GuardExecutionInput<T>): Promise<EnforcementOutcome<T>> {
    const request = this.buildRequest(input, input.mode ?? 'execute', input.adapterType);
    return this.runtime.enforce(request, input.execute);
  }

  private buildRequest(input: GuardActionRequestInput, mode: EnforcementMode, adapterType?: EnforcementAdapterType) {
    return this.runtime.createEnforcementRequest({
      mode,
      trustDomainId: input.trustDomainId,
      actorId: input.actorId,
      action: input.action,
      resourceScope: input.resourceScope,
      target: buildTarget(input, adapterType),
      intent: buildIntent(input),
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.actionRequestId !== undefined ? { actionRequestId: input.actionRequestId } : {}),
      ...(input.approvalProofId !== undefined ? { approvalProofId: input.approvalProofId } : {}),
      ...(input.approvalRequestId !== undefined ? { approvalRequestId: input.approvalRequestId } : {}),
      ...(input.approvalDecisionId !== undefined ? { approvalDecisionId: input.approvalDecisionId } : {}),
      ...(input.visaId !== undefined ? { visaId: input.visaId } : {}),
      ...(input.ingressGrantId !== undefined ? { ingressGrantId: input.ingressGrantId } : {}),
      ...(input.handshakeProofId !== undefined ? { handshakeProofId: input.handshakeProofId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
  }
}

export function createAocGuard(runtime: ActionEnforcementRuntime): AocGuard {
  return new AocGuard(runtime);
}
