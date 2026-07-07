import type { EnforcementPolicyResult } from './enforcement-verification.js';

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

  readonly metadata?: Readonly<Record<string, unknown>>;
}
