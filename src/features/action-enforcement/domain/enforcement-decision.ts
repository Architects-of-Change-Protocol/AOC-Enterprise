import type { EnforcementPolicyResult } from './enforcement-verification.js';
import type { ExecutionRiskLevel } from './execution-intent.js';

export type EnforcementDecisionType =
  | 'execute_allowed'
  | 'execution_blocked'
  | 'approval_required'
  | 'evidence_required'
  | 'external_handshake_required'
  | 'dry_run_allowed'
  | 'duplicate_suppressed'
  | 'emergency_denied'
  | 'adapter_denied'
  | 'expired'
  | 'invalid_request';

export interface EnforcementDecision {
  readonly id: string;

  readonly enforcementRequestId: string;

  readonly type: EnforcementDecisionType;

  readonly allowedToExecute: boolean;

  readonly reasonCode: string;
  readonly reason: string;

  readonly recognitionDecisionId?: string;
  readonly recognitionDecisionType?: string;

  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;

  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;

  readonly handshakeDecisionId?: string;
  readonly handshakeProofId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;

  readonly idempotencyKey?: string;

  readonly decidedAt: string;

  readonly policyResults: readonly EnforcementPolicyResult[];

  /**
   * Populated only when the optional Domain Policy Pack Runtime preflight
   * integration actually evaluated this request (i.e. a policy pack
   * integration is configured on the runtime). Absent -- not just
   * `undefined` in memory, but genuinely never set -- when no integration is
   * configured, so decisions produced by an unconfigured runtime are
   * byte-for-byte identical to decisions produced before this integration
   * existed.
   */
  readonly policyDecisionId?: string;
  readonly policyProofId?: string;
  readonly policyPackVersionIds?: readonly string[];
  readonly policyMatchedRuleIds?: readonly string[];
  readonly policyReasonCode?: string;
  readonly policyReason?: string;
  readonly policyEffectiveRiskLevel?: ExecutionRiskLevel;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
