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

export interface RuntimeSigningMetadata {
  signerId: string;
  keyId: string;
  algorithm: string;
  issuedBy?: string;
  trustAnchorVersion?: string;
  signerValidFrom?: string;
  signerValidUntil?: string;
}

export interface RuntimeVerificationMetadata {
  verificationNotBefore?: string;
  verificationNotAfter?: string;
  trustedUntil?: string;
  trustDomain?: string;
}

export interface RuntimeSignedEnvelope<TPayload extends Record<string, unknown>> {
  payload: TPayload;
  signature: string;
  issuedAt: string;
  metadata: RuntimeMetadata;
  signer: RuntimeSigningMetadata;
  verification?: RuntimeVerificationMetadata;
}

export type ExecutionGrantPayload = {
  grantId: string;
  input: AuthorizationGrantInput;
  issuedAt: string;
  expiresAt?: string;
  issuer: RuntimeMetadata;
  subject: {
    actorId: string;
    orgId: string;
    tenantId: string;
  };
  nonce: string;
};

export type ExecutionGrant = RuntimeSignedEnvelope<ExecutionGrantPayload>;

export interface ExecutionGrantValidationOptions {
  expectedScope?: string | string[];
}

export interface ExecutionGrantValidationResult {
  valid: boolean;
  reasonCodes: string[];
  grant: ExecutionGrant;
}

export interface ExecutionGrantStorePort {
  /** Persist issued grants durably enough for the host's replay and revocation requirements. */
  persistGrant(grant: ExecutionGrant): Promise<void>;
  getGrant(grantId: string): Promise<ExecutionGrant | undefined>;
  /** Must be atomic: return consumed=false when the grant was already consumed. */
  markGrantConsumed(
    grantId: string,
    consumedBy: string,
    metadata?: Record<string, unknown>
  ): Promise<{ consumed: boolean; reasonCodes?: string[] }>;
  isGrantConsumed(grantId: string): Promise<boolean>;
  revokeGrant(grantId: string, reason?: string): Promise<void>;
  isGrantRevoked(grantId: string): Promise<boolean>;
}

export type DelegatedCapabilityPayload = {
  delegationId: string;
  actorId: string;
  capability: CapabilityToken;
  orgId: string;
  issuedAt: string;
  expiresAt?: string;
  constraints?: Record<string, unknown>;
  parentGrantId?: string;
  parentDelegationId?: string;
  nonce: string;
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

export interface DelegationStorePort {
  persistDelegation(delegation: DelegatedCapability): Promise<void>;
  getDelegation(delegationId: string): Promise<DelegatedCapability | undefined>;
  validateDelegation(input: DelegatedAccessEvaluationInput): Promise<{ valid: boolean; reasonCodes?: string[] }>;
  revokeDelegation(delegationId: string, reason?: string): Promise<void>;
  isDelegationRevoked(delegationId: string): Promise<boolean>;
}

export type CapabilityClaimPayload = {
  claimId: string;
  actorId: string;
  capability: CapabilityToken;
  orgId: string;
  issuedAt: string;
  expiresAt?: string;
  trustDomain: string;
  nonce: string;
};

export type CapabilityClaimInput = Omit<CapabilityClaimPayload, 'issuedAt' | 'trustDomain' | 'nonce'> &
  Partial<Pick<CapabilityClaimPayload, 'issuedAt' | 'trustDomain' | 'nonce'>>;

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


export interface CapabilityClaimStorePort {
  persistClaim(claim: CapabilityClaim): Promise<void>;
  getClaim(claimId: string): Promise<CapabilityClaim | undefined>;
  revokeClaim(claimId: string, reason?: string): Promise<void>;
  isClaimRevoked(claimId: string): Promise<boolean>;
  validateClaim(
    claim: CapabilityClaim,
    expectations?: CapabilityClaimExpectedValues
  ): Promise<{ valid: boolean; reasonCodes?: string[] }>;
}

export type AuditDeliveryPolicy = 'fail-open' | 'fail-closed' | 'warn-only';

export interface ReplayProtectionPort {
  /** Record a nonce/jti if unseen in scope until expiresAt. Return recorded=false for duplicates. */
  recordNonce(nonce: string, scope: string, expiresAt?: string): Promise<{ recorded: boolean }>;
  hasSeenNonce(nonce: string, scope: string): Promise<boolean>;
  /** Consume must be atomic when hosts use it for one-time operations. */
  consumeNonce(nonce: string, scope: string): Promise<{ consumed: boolean }>;
}

export type LifecycleAuditEventType =
  | 'grant_issued'
  | 'grant_validated'
  | 'grant_consumed'
  | 'grant_replayed'
  | 'grant_revoked'
  | 'delegation_issued'
  | 'delegation_validated'
  | 'delegation_revoked'
  | 'delegation_denied'
  | 'claim_issued'
  | 'claim_verified'
  | 'claim_denied'
  | 'lifecycle_error';

export interface LifecycleAuditEvent {
  eventType: LifecycleAuditEventType;
  runtimeId: string;
  trustDomain: string;
  actorId?: string;
  subjectId?: string;
  orgId?: string;
  tenantId?: string;
  grantId?: string;
  delegationId?: string;
  claimId?: string;
  reasonCodes: string[];
  timestamp: string;
  decision: 'allowed' | 'denied' | 'issued' | 'consumed' | 'revoked' | 'error';
  metadata?: Record<string, unknown>;
}

export interface AuditSinkPort {
  emitLifecycleAudit(event: LifecycleAuditEvent): Promise<void>;
}

export interface RuntimeSignerPort {
  sign(payload: Record<string, unknown>, metadata: RuntimeMetadata): Promise<{ signature: string; signer: RuntimeSigningMetadata }>;
  verify(payload: Record<string, unknown>, signature: string, metadata: RuntimeMetadata): Promise<boolean>;
  getCurrentKeyId(): Promise<string>;
  getTrustedVerificationKeys(): Promise<Array<{ keyId: string; trustedFrom?: string; trustedUntil?: string; revoked?: boolean }>>;
  verifyWithKeyId(payload: Record<string, unknown>, signature: string, keyId: string, metadata: RuntimeMetadata): Promise<boolean>;
}

export interface RuntimeContext {
  metadata: RuntimeMetadata;
  identity: IdentityResolverAdapter;
  capabilityRegistry: CapabilityRegistryAdapter;
  delegationStore: DelegationStoreAdapter;
  lifecycleDelegationStore: DelegationStorePort;
  executionGrantStore: ExecutionGrantStorePort;
  capabilityClaimStore: CapabilityClaimStorePort;
  replayProtection: ReplayProtectionPort;
  policyDecision: PolicyDecisionAdapter;
  agentAccess: AgentAccessEvaluatorAdapter;
  auditSink: AuditSinkAdapter;
  lifecycleAuditSink: AuditSinkPort;
  signer: RuntimeSignerPort;
  auditDeliveryPolicy?: AuditDeliveryPolicy;
}

export type RuntimePortSet = Omit<RuntimeContext, 'metadata'> & {
  metadata: RuntimeMetadata;
};
