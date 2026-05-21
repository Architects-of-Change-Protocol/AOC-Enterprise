export type { AuthorizationDecision } from './decisions/authorization-decision.js';
export type { AuthorizationGrantInput } from './grants/grant-input.js';
export type { AuthorizationOrchestrationDeps } from '../orchestration/pipelines/authorization-orchestrator.js';
export type {
  EnforcementEvaluationInput,
  EnforcementEvaluationResult,
  EnforcementRuntimeDeps,
} from '../enforcement/authorization-pipeline.js';

export { orchestrateAuthorization } from '../orchestration/pipelines/authorization-orchestrator.js';
export { evaluateEnforcementPipeline } from '../enforcement/authorization-pipeline.js';
export { evaluateEnforcementPipeline as enforceEnforcementPipeline } from '../enforcement/authorization-pipeline.js';
