/**
 * Structural bridge to Recognition Runtime. Action Enforcement never imports
 * Recognition Runtime's domain types directly -- it only needs something
 * shaped like RecognitionRuntime.verifyAction, so the two features stay
 * loosely coupled. Mirrors the *-integration.ts structural adapters used
 * between Recognition Runtime, Authority Graph, Approval Runtime and
 * External Agent Handshake.
 */
export interface RecognitionVerificationInput {
  readonly actionRequestId?: string;

  readonly actorId: string;
  readonly principalActorId?: string;

  readonly trustDomainId: string;

  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;

  readonly requestedAt: string;

  readonly approvalProofId?: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;

  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeProofId?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Structurally matches Recognition Runtime's RecognitionDecision closely
 * enough to consume it without a hard type dependency: `type` mirrors
 * RecognitionDecisionType, `allowed`/`recognized` mirror the boolean
 * recognition verdict, and the upstream id fields mirror the optional
 * Authority Graph / Approval Runtime / External Agent Handshake references
 * Recognition Runtime already attaches to its own decisions.
 */
export interface RecognitionVerificationResult {
  readonly id?: string;

  readonly type: string;
  readonly allowed?: boolean;
  readonly recognized?: boolean;

  readonly reasonCode: string;
  readonly reason: string;

  readonly actionRequestId?: string;

  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;
  readonly handshakeDecisionId?: string;
  readonly handshakeProofId?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EnforcementRecognitionIntegration {
  verifyAction(input: RecognitionVerificationInput): RecognitionVerificationResult;
}
