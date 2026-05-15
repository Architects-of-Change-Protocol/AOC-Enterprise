export type {
  PolicyDecisionAdapter,
  DelegationStoreAdapter,
  AuditSinkAdapter,
  IdentityResolverAdapter,
  CapabilityRegistryAdapter,
  AgentAccessEvaluatorAdapter,
} from './adapters/protocol-adapters';

export type { AuthorizationGrantInput } from './runtime/authorization/grants/grant-input';
export type { AuthorizationDecision } from './runtime/authorization/decisions/authorization-decision';
export type { AuthorizationOrchestrationDeps } from './runtime/orchestration/pipelines/authorization-orchestrator';
export { orchestrateAuthorization } from './runtime/orchestration/pipelines/authorization-orchestrator';

export type {
  EnforcementEvaluationInput,
  EnforcementEvaluationResult,
  EnforcementRuntimeDeps,
} from './runtime/enforcement/authorization-pipeline';
export { evaluateEnforcementPipeline } from './runtime/enforcement/authorization-pipeline';

export type { RuntimeAuditEmitter } from './runtime/audit/emitters/runtime-audit-emitter';
export { emitRuntimeAuditEvent } from './runtime/audit/emitters/runtime-audit-emitter';
export { emitRuntimeEvent } from './runtime/audit/runtime-audit';

export type { DelegationVerificationContext } from './runtime/crypto/verification/delegation-verifier';
export { verifyDelegatedCapability } from './runtime/crypto/verification/delegation-verifier';
export type { CapabilityVerificationContext, VerificationResult } from './runtime/crypto/verification/capability-verifier';
export { verifyCapabilityToken } from './runtime/crypto/verification/capability-verifier';
