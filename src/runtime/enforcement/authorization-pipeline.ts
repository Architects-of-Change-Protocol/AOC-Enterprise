import type { AuthorizationDecision } from '../authorization/decisions/authorization-decision.js';
import type { AuthorizationGrantInput } from '../authorization/grants/grant-input.js';
import type { AuthorizationOrchestrationDeps } from '../orchestration/pipelines/authorization-orchestrator.js';
import { orchestrateAuthorization } from '../orchestration/pipelines/authorization-orchestrator.js';

export type EnforcementEvaluationInput = AuthorizationGrantInput;
export type EnforcementEvaluationResult = AuthorizationDecision;
export type EnforcementRuntimeDeps = AuthorizationOrchestrationDeps;

export async function evaluateEnforcementPipeline(
  input: EnforcementEvaluationInput,
  deps: EnforcementRuntimeDeps
): Promise<EnforcementEvaluationResult> {
  return orchestrateAuthorization(input, deps);
}
