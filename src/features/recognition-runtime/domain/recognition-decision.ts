import type { RiskLevel } from './capability-token.js';

export type RecognitionDecisionType =
  | 'allow'
  | 'deny'
  | 'require_human_approval'
  | 'require_more_evidence'
  | 'revoked'
  | 'expired'
  | 'unrecognized_actor'
  | 'invalid_passport'
  | 'invalid_capability'
  | 'out_of_scope'
  | 'policy_violation';

export interface PolicyResult {
  readonly policyId: string;
  readonly passed: boolean;
  readonly reasonCode: string;
  readonly reason: string;
}

export interface RecognitionDecision {
  readonly id: string;
  readonly requestId: string;
  readonly type: RecognitionDecisionType;
  readonly recognized: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly actorId: string;
  readonly trustDomainId: string;
  readonly evaluatedAt: string;
  readonly riskLevel?: RiskLevel;
  readonly requiredEvidence?: readonly string[];
  readonly requiredApproverActorIds?: readonly string[];
  readonly policyResults: readonly PolicyResult[];
  readonly auditEventId: string;
  /** Set when Authority Graph integration evaluated this request's authority lineage. */
  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;
}
