import type { ApprovalDecision, ApprovalDecisionType } from './approval-decision.js';
import type { ApprovalEvidenceArtifact } from './approval-evidence.js';
import type { ApprovalRequest } from './approval-request.js';

export interface ApprovalPolicyResult {
  readonly policyId: string;
  readonly passed: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly severity: 'info' | 'warning' | 'error' | 'critical';
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** The approval decision an approver is attempting to submit, prior to persistence. */
export interface ApprovalDecisionAttempt {
  readonly approverActorId: string;
  readonly type: ApprovalDecisionType;
  readonly evidenceReviewed: readonly ApprovalEvidenceArtifact[];
}

/**
 * Local, structurally-typed result of an approver-recognition check. Approval Runtime
 * does not import Recognition Runtime's Actor type -- it only needs this shape, so the
 * two features stay loosely coupled. See services/approval-actor-recognition-integration.ts.
 */
export interface ApprovalApproverRecognitionResult {
  readonly recognized: boolean;
  readonly reasonCode: string;
  readonly reason: string;
}

/**
 * Local, structurally-typed result of an Authority Graph authority check. Mirrors
 * AuthorityDecision's shape without importing Authority Graph's domain types. See
 * services/approval-authority-graph-integration.ts.
 */
export interface ApprovalAuthorityCheckResult {
  readonly valid: boolean;
  readonly type: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;
}

export interface ApprovalPolicyContext {
  readonly now: string;
  readonly request?: ApprovalRequest;
  readonly attempt: ApprovalDecisionAttempt;
  readonly approverRecognition: ApprovalApproverRecognitionResult;
  readonly authorityCheck?: ApprovalAuthorityCheckResult;
  readonly priorDecisions: readonly ApprovalDecision[];
}

export interface ApprovalPolicyOutcome extends ApprovalPolicyResult {
  readonly decisionType?: ApprovalDecisionType;
}

export interface ApprovalPolicy {
  readonly id: string;
  evaluate(context: ApprovalPolicyContext): ApprovalPolicyOutcome;
}
