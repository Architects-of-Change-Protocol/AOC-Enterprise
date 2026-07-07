import type { ExternalAuthorityPresentation } from './external-authority-presentation.js';
import type { ExternalCapabilityRiskLevel } from './external-capability-request.js';
import type { ExternalTrustIssuer } from './external-trust-issuer.js';
import type { HandshakeChallenge } from './handshake-challenge.js';
import type { HandshakeDecisionType } from './handshake-decision.js';
import type { HandshakeRequest } from './handshake-request.js';
import type { TrustBoundary } from './trust-boundary.js';

export interface HandshakePolicyResult {
  readonly policyId: string;
  readonly passed: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly severity: 'info' | 'warning' | 'error' | 'critical';
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Local, structurally-typed result of an Authority Graph authority check --
 * mirrors approval-runtime's ApprovalAuthorityCheckResult without importing
 * Authority Graph's domain types.
 */
export interface HandshakeAuthorityCheckResult {
  readonly valid: boolean;
  readonly type: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;
}

/**
 * Local, structurally-typed result of an Approval Runtime check -- mirrors
 * recognition-runtime's RecognitionApprovalVerificationResult without
 * importing Approval Runtime's domain types.
 */
export interface HandshakeApprovalCheckResult {
  readonly valid: boolean;
  readonly type: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;
}

export interface HandshakePolicyContext {
  readonly now: string;

  readonly request: HandshakeRequest;

  readonly issuer?: ExternalTrustIssuer;
  readonly trustBoundary?: TrustBoundary;
  readonly challenge?: HandshakeChallenge;
  readonly authorityPresentation?: ExternalAuthorityPresentation;
  readonly authorityCheck?: HandshakeAuthorityCheckResult;
  readonly approvalCheck?: HandshakeApprovalCheckResult;

  readonly riskLevel: ExternalCapabilityRiskLevel;

  readonly allowedCapabilities: readonly string[];
  readonly allowedActions: readonly string[];
  readonly allowedResourceScopes: readonly string[];

  readonly duplicateActiveRequest?: HandshakeRequest;

  /** Running tally maintained by HandshakePolicyEvaluator: whether some policy evaluated so far has flagged this handshake as needing human approval. */
  readonly requiresApprovalSoFar: boolean;
}

export interface HandshakePolicyOutcome extends HandshakePolicyResult {
  readonly decisionType?: HandshakeDecisionType;
  readonly requiresApproval?: boolean;
  readonly allowedCapabilities?: readonly string[];
  readonly allowedActions?: readonly string[];
  readonly allowedResourceScopes?: readonly string[];
}

export interface HandshakePolicy {
  readonly id: string;
  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome;
}
