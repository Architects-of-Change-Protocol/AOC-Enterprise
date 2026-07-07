export { HandshakeStore } from './handshake-store.js';

export { ExternalIssuerRegistry, type RegisterExternalIssuerInput } from './external-issuer-registry.js';

export { TrustBoundaryService, type CreateTrustBoundaryInput, type BoundaryEvaluation } from './trust-boundary-service.js';

export { HandshakeRequestService, type SubmitHandshakeRequestInput } from './handshake-request-service.js';

export {
  HandshakeChallengeService,
  type IssueChallengeInput,
  type ChallengeVerification,
} from './handshake-challenge-service.js';

export {
  PassportPresentationService,
  type PresentPassportInput,
  type PassportPresentationVerification,
} from './passport-presentation-service.js';

export {
  CapabilityRequestService,
  type CreateCapabilityRequestInput,
  type CapabilityRequestEvaluation,
} from './capability-request-service.js';

export { AuthorityPresentationService, type PresentAuthorityInput } from './authority-presentation-service.js';

export {
  type HandshakeAuthorityVerificationInput,
  type HandshakeAuthorityVerificationResultType,
  type HandshakeAuthorityVerificationResult,
  type HandshakeAuthorityGraphIntegration,
  type AuthorityChainRequestLike,
  type AuthorityDecisionLike,
  type AuthorityGraphRuntimeLike,
  createHandshakeAuthorityGraphIntegration,
} from './handshake-authority-graph-integration.js';

export {
  type HandshakeApprovalRiskLevel,
  type HandshakeApprovalRequestInput,
  type HandshakeApprovalRequestStatus,
  type HandshakeApprovalRequestReference,
  type HandshakeApprovalVerificationInput,
  type HandshakeApprovalVerificationResultType,
  type HandshakeApprovalVerificationResult,
  type HandshakeApprovalRuntimeIntegration,
  type ApprovalRuntimeLike,
  createHandshakeApprovalRuntimeIntegration,
} from './handshake-approval-runtime-integration.js';

export { HandshakePolicyEvaluator, type HandshakePolicyEvaluationResult } from './handshake-policy-evaluator.js';

export {
  HandshakeDecisionService,
  type DecideHandshakeInput,
  type HandshakeDecisionResult,
} from './handshake-decision-service.js';

export { AgentVisaService, type IssueAgentVisaInput, type AgentVisaVerification } from './agent-visa-service.js';

export { IngressGrantService, type IssueIngressGrantInput, type IngressGrantVerification } from './ingress-grant-service.js';

export { HandshakeProofService, type CreateHandshakeProofInput } from './handshake-proof-service.js';

export { HandshakeLedger, type RecordHandshakeEventInput, type HandshakeEventTrailFilter } from './handshake-ledger.js';

export { HandshakeRevocationService } from './handshake-revocation-service.js';

export { HandshakeExpirationService } from './handshake-expiration-service.js';
