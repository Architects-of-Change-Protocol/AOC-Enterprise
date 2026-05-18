import type { AocIdentityClaims, AuditEventEnvelope, CapabilityToken, ScopedAccessRequest } from '@aoc/protocol';
import type { AuthorizationGrantInput } from './authorization/grants/grant-input';
import type {
  AgentAccessEvaluatorAdapter,
  AuditSinkAdapter,
  CapabilityRegistryAdapter,
  DelegationStoreAdapter,
  IdentityResolverAdapter,
  PolicyDecisionAdapter,
} from './adapters';

export interface RuntimeMetadata {
  runtimeId: string;
  trustDomain: string;
  environment?: string;
  version?: string;
  host?: string;
}

export type RuntimeDecisionEnvelope = {
  allowed: boolean;
  reasonCodes: string[];
  audit: AuditEventEnvelope;
  metadata: RuntimeMetadata;
};

export interface RuntimeSignedEnvelope<TPayload extends Record<string, unknown>> {
  payload: TPayload;
  signature: string;
  issuedAt: string;
  metadata: RuntimeMetadata;
}

export type ExecutionGrantPayload = {
  grantId: string;
  input: AuthorizationGrantInput;
  expiresAt?: string;
};

export type ExecutionGrant = RuntimeSignedEnvelope<ExecutionGrantPayload>;

export interface ExecutionGrantValidationResult {
  valid: boolean;
  reasonCodes: string[];
  grant: ExecutionGrant;
}

export type DelegatedCapabilityPayload = {
  delegationId: string;
  actorId: string;
  capability: CapabilityToken;
  orgId: string;
  expiresAt?: string;
  constraints?: Record<string, unknown>;
};

export type DelegatedCapability = RuntimeSignedEnvelope<DelegatedCapabilityPayload>;

export interface DelegatedAccessEvaluationInput {
  actor: AocIdentityClaims;
  delegatedCapability: DelegatedCapability;
  access: ScopedAccessRequest;
  orgId: string;
}

export interface DelegatedAccessEvaluationResult {
  allowed: boolean;
  reasonCodes: string[];
}

export type CapabilityClaimPayload = {
  claimId: string;
  actorId: string;
  capability: CapabilityToken;
  orgId: string;
  issuedAt: string;
  expiresAt?: string;
};

export type CapabilityClaim = RuntimeSignedEnvelope<CapabilityClaimPayload>;

export interface CapabilityClaimExpectedValues {
  actorId?: string;
  orgId?: string;
  trustDomain?: string;
}

export interface CapabilityClaimVerificationResult {
  valid: boolean;
  reasonCodes: string[];
}

export interface RuntimeSignerPort {
  sign(payload: Record<string, unknown>, metadata: RuntimeMetadata): Promise<string>;
  verify(payload: Record<string, unknown>, signature: string, metadata: RuntimeMetadata): Promise<boolean>;
}

export interface RuntimeContext {
  metadata: RuntimeMetadata;
  identity: IdentityResolverAdapter;
  capabilityRegistry: CapabilityRegistryAdapter;
  delegationStore: DelegationStoreAdapter;
  policyDecision: PolicyDecisionAdapter;
  agentAccess: AgentAccessEvaluatorAdapter;
  auditSink: AuditSinkAdapter;
  signer: RuntimeSignerPort;
}

export type RuntimePortSet = Omit<RuntimeContext, 'metadata'> & {
  metadata: RuntimeMetadata;
};
