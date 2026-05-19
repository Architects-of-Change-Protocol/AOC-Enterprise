export type {
  AocEnterpriseRuntime,
  AocEnterpriseRuntimeHostPorts,
} from './host';
export type {
  CapabilityClaim,
  CapabilityClaimExpectedValues,
  CapabilityClaimPayload,
  CapabilityClaimInput,
  CapabilityClaimVerificationResult,
  DelegatedAccessEvaluationInput,
  DelegatedAccessEvaluationResult,
  DelegatedCapability,
  DelegatedCapabilityPayload,
  DelegationStorePort,
  ReplayProtectionPort,
  AuditSinkPort,
  LifecycleAuditEvent,
  LifecycleAuditEventType,
  ExecutionGrant,
  ExecutionGrantPayload,
  ExecutionGrantValidationOptions,
  ExecutionGrantValidationResult,
  ExecutionGrantStorePort,
  RuntimeContext,
  RuntimeDecisionEnvelope,
  RuntimeMetadata,
  RuntimePortSet,
  RuntimeSignedEnvelope,
  RuntimeSignerPort,
} from './context';

export { createAocEnterpriseRuntime } from './host';
export type {
  AuthorizationDecision,
  AuthorizationGrantInput,
  AuthorizationOrchestrationDeps,
  EnforcementEvaluationInput,
  EnforcementEvaluationResult,
  EnforcementRuntimeDeps,
} from './authorization';
export type { RuntimeAuditEmitter } from './audit';
export type {
  CapabilityVerificationContext,
  DelegationVerificationContext,
  VerificationResult,
} from './crypto';
export type {
  AgentAccessEvaluatorAdapter,
  AuditSinkAdapter,
  CapabilityRegistryAdapter,
  DelegationStoreAdapter,
  IdentityResolverAdapter,
  PolicyDecisionAdapter,
} from './adapters';

export {
  evaluateEnforcementPipeline,
  enforceEnforcementPipeline,
  orchestrateAuthorization,
} from './authorization';
export { emitRuntimeAuditEvent } from './audit';
export { verifyCapabilityToken, verifyDelegatedCapability } from './crypto';
