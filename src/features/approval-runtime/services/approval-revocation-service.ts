import type { ApprovalProof } from '../domain/approval-proof.js';
import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalLedger } from './approval-ledger.js';
import type { ApprovalProofService } from './approval-proof-service.js';
import type { ApprovalRequestService } from './approval-request-service.js';

/**
 * Revokes approval requests and proofs. Revocation blocks future use while
 * preserving the historical event trail -- the ledger already recorded
 * approval_requested / approval_approved / approval_proof_created before a
 * revocation happens, and those records are never removed.
 */
export class ApprovalRevocationService {
  constructor(
    private readonly requestService: ApprovalRequestService,
    private readonly proofService: ApprovalProofService,
    private readonly ledger: ApprovalLedger,
  ) {}

  revokeApprovalRequest(approvalRequestId: string, revokedByActorId: string, reason: string): ApprovalRequest {
    const revoked = this.requestService.markRevoked(approvalRequestId);
    this.ledger.recordEvent({
      type: 'approval_revoked',
      trustDomainId: revoked.trustDomainId,
      approvalRequestId: revoked.id,
      actionRequestId: revoked.actionRequestId,
      payload: { reason, revokedByActorId },
    });
    return revoked;
  }

  revokeApprovalProof(approvalProofId: string, revokedByActorId: string, reason: string): ApprovalProof {
    const revoked = this.proofService.revokeApprovalProof(approvalProofId, revokedByActorId, reason);
    this.ledger.recordEvent({
      type: 'approval_revoked',
      trustDomainId: revoked.trustDomainId,
      approvalRequestId: revoked.approvalRequestId,
      approvalDecisionId: revoked.approvalDecisionId,
      approvalProofId: revoked.id,
      payload: { reason, revokedByActorId },
    });
    return revoked;
  }
}
