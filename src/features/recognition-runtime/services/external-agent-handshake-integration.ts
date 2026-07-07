import type { RecognitionDecisionType } from '../domain/recognition-decision.js';

/**
 * Structural adapter for the External Agent Handshake runtime. Recognition
 * Runtime does not import External Agent Handshake's domain types directly
 * -- it only needs something shaped like
 * ExternalAgentHandshakeRuntime.verifyExternalStanding, so the two features
 * stay loosely coupled. Mirrors approval-runtime-integration.ts and
 * authority-graph-integration.ts.
 */
export interface ExternalStandingVerificationInput {
  readonly actorId: string;
  readonly trustDomainId: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly capability?: string;
  readonly requestedAt: string;

  readonly externalAgentId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeProofId?: string;
}

export type ExternalStandingVerificationResultType =
  | 'standing_valid'
  | 'standing_missing'
  | 'handshake_required'
  | 'handshake_pending'
  | 'handshake_rejected'
  | 'handshake_quarantined'
  | 'visa_expired'
  | 'visa_revoked'
  | 'ingress_denied'
  | 'scope_denied'
  | 'capability_denied'
  | 'approval_required';

export interface ExternalStandingVerificationResult {
  readonly type: ExternalStandingVerificationResultType;
  readonly valid: boolean;

  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeDecisionId?: string;
  readonly handshakeProofId?: string;

  readonly reasonCode: string;
  readonly reason: string;
}

export interface ExternalAgentStandingIntegration {
  verifyExternalStanding(input: ExternalStandingVerificationInput): ExternalStandingVerificationResult;
}

const RESULT_TYPE_TO_DECISION_TYPE: Readonly<Record<ExternalStandingVerificationResultType, RecognitionDecisionType>> = {
  standing_valid: 'allow',
  standing_missing: 'unrecognized_actor',
  handshake_required: 'unrecognized_actor',
  handshake_pending: 'unrecognized_actor',
  handshake_rejected: 'policy_violation',
  handshake_quarantined: 'policy_violation',
  visa_expired: 'expired',
  visa_revoked: 'revoked',
  ingress_denied: 'policy_violation',
  scope_denied: 'out_of_scope',
  capability_denied: 'invalid_capability',
  approval_required: 'require_human_approval',
};

/** Maps a non-'standing_valid' ExternalStandingVerificationResultType onto the RecognitionDecisionType it should surface as. */
export function mapExternalStandingResultType(type: ExternalStandingVerificationResultType): RecognitionDecisionType {
  return RESULT_TYPE_TO_DECISION_TYPE[type];
}
