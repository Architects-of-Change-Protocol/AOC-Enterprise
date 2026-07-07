import { createDigest } from '../domain/handshake-proof.js';
import type { HandshakeDecisionType } from '../domain/handshake-decision.js';
import type { HandshakeProof } from '../domain/handshake-proof.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { HandshakeProofNotFoundError } from '../runtime/handshake-runtime-errors.js';
import type { HandshakeStore } from './handshake-store.js';

export interface CreateHandshakeProofInput {
  readonly handshakeRequestId: string;
  readonly handshakeDecisionId: string;
  readonly localTrustDomainId: string;
  readonly externalAgentId: string;
  readonly passportPresentationId: string;
  readonly authorityPresentationId?: string;
  readonly approvalProofId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly decisionType: HandshakeDecisionType;
  readonly accepted: boolean;
  readonly evidenceHashes: readonly string[];
}

/**
 * Creates and verifies deterministic HandshakeProofs -- the durable,
 * hash-chained record of what a HandshakeDecision actually decided and why.
 * Mirrors ApprovalProofService's shape/behavior.
 */
export class HandshakeProofService {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
  ) {}

  createProof(input: CreateHandshakeProofInput): HandshakeProof {
    const previousHash = this.store.getLastProof()?.proofHash;
    const proofHash = createDigest({
      handshakeRequestId: input.handshakeRequestId,
      handshakeDecisionId: input.handshakeDecisionId,
      localTrustDomainId: input.localTrustDomainId,
      externalAgentId: input.externalAgentId,
      passportPresentationId: input.passportPresentationId,
      authorityPresentationId: input.authorityPresentationId,
      approvalProofId: input.approvalProofId,
      visaId: input.visaId,
      ingressGrantId: input.ingressGrantId,
      decisionType: input.decisionType,
      accepted: input.accepted,
      evidenceHashes: input.evidenceHashes,
      previousHash,
    });

    const proof: HandshakeProof = {
      id: this.ctx.ids.nextId('handshake-proof'),
      handshakeRequestId: input.handshakeRequestId,
      handshakeDecisionId: input.handshakeDecisionId,
      localTrustDomainId: input.localTrustDomainId,
      externalAgentId: input.externalAgentId,
      passportPresentationId: input.passportPresentationId,
      decisionType: input.decisionType,
      accepted: input.accepted,
      evidenceHashes: input.evidenceHashes,
      proofHash,
      createdAt: this.ctx.clock.now(),
      ...(input.authorityPresentationId !== undefined ? { authorityPresentationId: input.authorityPresentationId } : {}),
      ...(input.approvalProofId !== undefined ? { approvalProofId: input.approvalProofId } : {}),
      ...(input.visaId !== undefined ? { visaId: input.visaId } : {}),
      ...(input.ingressGrantId !== undefined ? { ingressGrantId: input.ingressGrantId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };

    return this.store.putHandshakeProof(proof);
  }

  getProof(handshakeProofId: string): HandshakeProof | undefined {
    return this.store.getHandshakeProof(handshakeProofId);
  }

  getProofByDecisionId(handshakeDecisionId: string): HandshakeProof | undefined {
    return this.store.getHandshakeProofByDecisionId(handshakeDecisionId);
  }

  /** Recomputes a stored proof's hash from its own fields and checks it against what was persisted -- a tamper check, not a temporal validity check. */
  verifyProofIntegrity(handshakeProofId: string): boolean {
    const proof = this.store.getHandshakeProof(handshakeProofId);
    if (!proof) {
      throw new HandshakeProofNotFoundError(handshakeProofId);
    }
    const recomputed = createDigest({
      handshakeRequestId: proof.handshakeRequestId,
      handshakeDecisionId: proof.handshakeDecisionId,
      localTrustDomainId: proof.localTrustDomainId,
      externalAgentId: proof.externalAgentId,
      passportPresentationId: proof.passportPresentationId,
      authorityPresentationId: proof.authorityPresentationId,
      approvalProofId: proof.approvalProofId,
      visaId: proof.visaId,
      ingressGrantId: proof.ingressGrantId,
      decisionType: proof.decisionType,
      accepted: proof.accepted,
      evidenceHashes: proof.evidenceHashes,
      previousHash: proof.previousHash,
    });
    return recomputed === proof.proofHash;
  }
}
