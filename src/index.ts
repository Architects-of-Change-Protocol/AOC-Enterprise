export type {
  PolicyDecisionAdapter,
  DelegationStoreAdapter,
  AuditSinkAdapter,
  IdentityResolverAdapter,
  CapabilityRegistryAdapter,
  AgentAccessEvaluatorAdapter,
} from './adapters/protocol-adapters';

export type {
  EnforcementEvaluationInput,
  EnforcementEvaluationResult,
  EnforcementRuntimeDeps,
} from './runtime/enforcement/authorization-pipeline';
export { evaluateEnforcementPipeline } from './runtime/enforcement/authorization-pipeline';

export type { RuntimeAuditEmitter } from './runtime/audit/runtime-audit';
export { emitRuntimeEvent } from './runtime/audit/runtime-audit';

export type { DelegationVerificationContext } from './runtime/crypto/verification/delegation-verifier';
export { verifyDelegatedCapability } from './runtime/crypto/verification/delegation-verifier';
