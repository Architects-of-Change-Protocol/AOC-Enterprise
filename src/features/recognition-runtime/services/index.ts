export { ActorRegistry } from './actor-registry.js';
export type { RegisterActorInput } from './actor-registry.js';

export { TrustDomainService } from './trust-domain-service.js';
export type { CreateTrustDomainInput } from './trust-domain-service.js';

export { PassportService } from './passport-service.js';
export type { IssuePassportInput, PassportVerificationResult } from './passport-service.js';

export { CapabilityTokenService } from './capability-token-service.js';
export type { IssueCapabilityTokenInput, CapabilityTokenVerificationResult } from './capability-token-service.js';

export { PolicyEvaluator } from './policy-evaluator.js';
export type { PolicyEvaluationResult } from './policy-evaluator.js';

export { RevocationEngine } from './revocation-engine.js';

export { EvidenceLedger } from './evidence-ledger.js';
export type { RecordAuditEventInput, AuditTrailFilter, ActionProofExport } from './evidence-ledger.js';

export { RecognitionVerifier } from './recognition-verifier.js';

export { requiresAuthorityChain, mapAuthorityDecisionType } from './authority-graph-integration.js';
export type { AuthorityGraphIntegration, AuthorityChainRequestLike, AuthorityDecisionLike } from './authority-graph-integration.js';

export { isHardBlockingApprovalResult, APPROVAL_EVALUATION_DECISION_TYPE } from './approval-runtime-integration.js';
export type {
  ApprovalRuntimeIntegration,
  RecognitionApprovalVerificationInput,
  RecognitionApprovalVerificationResultType,
  RecognitionApprovalVerificationResult,
  CreateApprovalRequestForDecisionInput,
  CreateApprovalRequestForDecisionRiskLevel,
  ApprovalRequestReferenceStatus,
  ApprovalRequestReference,
} from './approval-runtime-integration.js';
