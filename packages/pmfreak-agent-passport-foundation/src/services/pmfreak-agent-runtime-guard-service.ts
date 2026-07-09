import type {
  AgentPassport,
  AgentRuntimeActionCategory,
  AgentRuntimeActionRequest,
  EvaluateAgentRuntimeGuardDeps,
  EvaluateAgentRuntimeGuardInput,
  AgentRuntimeGuardDecision,
  AgentRuntimeGuardEnforcementResult,
} from '@aoc-enterprise/agent-governance';
import { evaluateAgentRuntimeGuard, enforceAgentRuntimeGuard } from '@aoc-enterprise/agent-governance';

export interface BuildPMFreakAgentRuntimeActionRequestOptions {
  readonly requestId: string;
  readonly passport: AgentPassport;
  readonly actorId: string;
  readonly requestedAction: string;
  readonly actionCategory: AgentRuntimeActionCategory;
  readonly toolName?: string;
  readonly resource?: string;
  readonly dataCategories?: readonly string[];
  readonly riskTier?: string;
  /** Caller-supplied ISO-8601 timestamp. This module never reads the system clock. */
  readonly requestedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Builds a real `AgentRuntimeActionRequest` for an action a PMFreak agent
 * (identified by its already-issued real `AgentPassport`) is attempting.
 */
export function buildPMFreakAgentRuntimeActionRequest(
  options: BuildPMFreakAgentRuntimeActionRequestOptions,
): AgentRuntimeActionRequest {
  return {
    requestId: options.requestId,
    passportId: options.passport.passportId,
    actorId: options.actorId,
    requestedAction: options.requestedAction,
    actionCategory: options.actionCategory,
    ...(options.toolName !== undefined ? { toolName: options.toolName } : {}),
    ...(options.resource !== undefined ? { resource: options.resource } : {}),
    ...(options.dataCategories !== undefined ? { dataCategories: options.dataCategories } : {}),
    ...(options.riskTier !== undefined ? { riskTier: options.riskTier } : {}),
    requestedAt: options.requestedAt,
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
  };
}

/**
 * Thin wrapper over `@aoc-enterprise/agent-governance`'s real
 * `evaluateAgentRuntimeGuard` -- Runtime Guard Lite is genuinely exported
 * from that package's public surface, so this is not a structural mirror.
 */
export async function evaluatePMFreakAgentRuntimeGuard(
  input: EvaluateAgentRuntimeGuardInput,
  deps: EvaluateAgentRuntimeGuardDeps,
): Promise<AgentRuntimeGuardDecision> {
  return evaluateAgentRuntimeGuard(input, deps);
}

/**
 * Thin wrapper over `@aoc-enterprise/agent-governance`'s real
 * `enforceAgentRuntimeGuard`.
 */
export async function enforcePMFreakAgentRuntimeGuard(
  input: EvaluateAgentRuntimeGuardInput,
  deps: EvaluateAgentRuntimeGuardDeps,
): Promise<AgentRuntimeGuardEnforcementResult> {
  return enforceAgentRuntimeGuard(input, deps);
}
