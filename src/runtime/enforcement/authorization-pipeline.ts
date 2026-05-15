import type { AuthorizationDecision } from '../authorization/decisions/authorization-decision';
import type { AuthorizationGrantInput } from '../authorization/grants/grant-input';
import type { AuthorizationOrchestrationDeps } from '../orchestration/pipelines/authorization-orchestrator';
import { orchestrateAuthorization } from '../orchestration/pipelines/authorization-orchestrator';

export type EnforcementEvaluationInput = AuthorizationGrantInput;
export type EnforcementEvaluationResult = AuthorizationDecision;
export type EnforcementRuntimeDeps = AuthorizationOrchestrationDeps;

export async function evaluateEnforcementPipeline(
  input: EnforcementEvaluationInput,
  deps: EnforcementRuntimeDeps
): Promise<EnforcementEvaluationResult> {
  return orchestrateAuthorization(input, deps);
}
