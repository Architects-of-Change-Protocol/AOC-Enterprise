export type { Actor, ActorType, ActorStatus } from './actor.js';
export type { TrustDomain, TrustDomainStatus } from './trust-domain.js';
export type { RecognitionProof } from './proof.js';
export { stableStringify, createDigest, createProof } from './proof.js';
export type { Passport, PassportType, PassportStatus } from './passport.js';
export type { EvidenceItem } from './evidence.js';
export type {
  RecognitionCapabilityToken,
  CapabilityTokenStatus,
  CapabilityConstraints,
  DelegationPolicyRecord,
  EvidenceRequirement,
  ApprovalRequirement,
  RiskLevel,
} from './capability-token.js';
export type { ActionRequest } from './action-request.js';
export type {
  RecognitionDecision,
  RecognitionDecisionType,
  PolicyResult,
} from './recognition-decision.js';
export type { AuditEvent, AuditEventType } from './audit-event.js';
export type { Policy, PolicyContext, PolicyOutcome, CapabilityCheckResult } from './policy.js';
export type {
  RevocableEntityType,
  RevocationCheckInput,
  RevocationCheckResult,
} from './revocation.js';
