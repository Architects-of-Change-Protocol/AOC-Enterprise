import { createDigest } from '../domain/approval-proof.js';
import type { ApprovalProof } from '../domain/approval-proof.js';
import type { ApprovalEvidenceArtifact } from '../domain/approval-evidence.js';
import type { ApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { ApprovalProofNotFoundError } from '../runtime/approval-runtime-errors.js';
import type { ApprovalStore } from './approval-store.js';

export interface CreateApprovalProofInput {
  readonly approvalRequestId: string;
  readonly approvalDecisionId: string;
  readonly trustDomainId: string;
  readonly actionRequestId: string;
  readonly requestedByActorId: string;
  readonly approverActorId: string;
  readonly principalActorId?: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly approved: boolean;
  readonly evidence: readonly ApprovalEvidenceArtifact[];
  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;
  readonly expiresAt?: string;
}

export interface ApprovalProofVerification {
  readonly valid: boolean;
  readonly proof?: ApprovalProof;
  readonly reasonCode: string;
  readonly reason: string;
}

export class ApprovalProofService {
  private readonly proofs: ApprovalProof[] = [];

  constructor(
    private readonly ctx: ApprovalRuntimeContext,
    private readonly store: ApprovalStore,
  ) {}

  createProof(input: CreateApprovalProofInput): ApprovalProof {
    const evidenceHashes = input.evidence.map((evidence) => createDigest(evidence));
    const previousHash = this.proofs.at(-1)?.proofHash;
    const proofHash = createDigest({
      approvalRequestId: input.approvalRequestId,
      approvalDecisionId: input.approvalDecisionId,
      trustDomainId: input.trustDomainId,
      actionRequestId: input.actionRequestId,
      requestedByActorId: input.requestedByActorId,
      approverActorId: input.approverActorId,
      principalActorId: input.principalActorId,
      action: input.action,
      resourceScope: input.resourceScope,
      approved: input.approved,
      evidenceHashes,
      authorityDecisionId: input.authorityDecisionId,
      authorityProofId: input.authorityProofId,
      previousHash,
    });

    const proof: ApprovalProof = {
      id: this.ctx.ids.nextId('approval-proof'),
      approvalRequestId: input.approvalRequestId,
      approvalDecisionId: input.approvalDecisionId,
      trustDomainId: input.trustDomainId,
      actionRequestId: input.actionRequestId,
      requestedByActorId: input.requestedByActorId,
      approverActorId: input.approverActorId,
      action: input.action,
      resourceScope: input.resourceScope,
      approved: input.approved,
      status: 'valid',
      evidenceHashes,
      proofHash,
      createdAt: this.ctx.clock.now(),
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      ...(input.authorityDecisionId !== undefined ? { authorityDecisionId: input.authorityDecisionId } : {}),
      ...(input.authorityProofId !== undefined ? { authorityProofId: input.authorityProofId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    };

    this.proofs.push(proof);
    this.store.putProof(proof);
    return proof;
  }

  getProofByDecisionId(approvalDecisionId: string): ApprovalProof | undefined {
    return this.store.getProofByDecisionId(approvalDecisionId);
  }

  getProof(approvalProofId: string): ApprovalProof | undefined {
    return this.store.getProof(approvalProofId);
  }

  getAllProofs(): readonly ApprovalProof[] {
    return [...this.proofs];
  }

  /** Checks a proof's effective validity at `now`, without mutating stored status (that is ApprovalExpirationService's job). */
  verifyApprovalProof(approvalProofId: string, now: string): ApprovalProofVerification {
    const proof = this.store.getProof(approvalProofId);
    if (!proof) {
      return { valid: false, reasonCode: 'APPROVAL_PROOF_NOT_FOUND', reason: `Approval proof ${approvalProofId} was not found.` };
    }
    if (proof.status === 'revoked') {
      return { valid: false, proof, reasonCode: 'APPROVAL_REVOKED', reason: `Approval proof ${approvalProofId} was revoked.` };
    }
    if (proof.expiresAt !== undefined && Date.parse(now) >= Date.parse(proof.expiresAt)) {
      return { valid: false, proof, reasonCode: 'APPROVAL_EXPIRED', reason: `Approval proof ${approvalProofId} expired at ${proof.expiresAt}.` };
    }
    if (proof.status !== 'valid' || !proof.approved) {
      return { valid: false, proof, reasonCode: 'APPROVAL_INVALID', reason: `Approval proof ${approvalProofId} does not represent a valid approval.` };
    }
    return { valid: true, proof, reasonCode: 'APPROVAL_VALID', reason: `Approval proof ${approvalProofId} is valid.` };
  }

  revokeApprovalProof(approvalProofId: string, revokedByActorId: string, reason: string): ApprovalProof {
    const existing = this.store.getProof(approvalProofId);
    if (!existing) {
      throw new ApprovalProofNotFoundError(approvalProofId);
    }
    return this.store.updateProofStatus(approvalProofId, 'revoked', {
      revokedAt: this.ctx.clock.now(),
      revokedByActorId,
      revocationReason: reason,
    });
  }

  expireApprovalProof(approvalProofId: string): ApprovalProof {
    const existing = this.store.getProof(approvalProofId);
    if (!existing) {
      throw new ApprovalProofNotFoundError(approvalProofId);
    }
    return this.store.updateProofStatus(approvalProofId, 'expired');
  }
}
