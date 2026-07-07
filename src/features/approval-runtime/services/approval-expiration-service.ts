import type { ApprovalProof } from '../domain/approval-proof.js';
import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import type { ApprovalLedger } from './approval-ledger.js';
import type { ApprovalProofService } from './approval-proof-service.js';
import type { ApprovalRequestService } from './approval-request-service.js';
import type { ApprovalStore } from './approval-store.js';

/** Detects and enforces expiration for approval requests and proofs, using only the injected clock. */
export class ApprovalExpirationService {
  constructor(
    private readonly ctx: ApprovalRuntimeContext,
    private readonly store: ApprovalStore,
    private readonly requestService: ApprovalRequestService,
    private readonly proofService: ApprovalProofService,
    private readonly ledger: ApprovalLedger,
  ) {}

  isRequestExpired(request: ApprovalRequest): boolean {
    return request.expiresAt !== undefined && Date.parse(this.ctx.clock.now()) >= Date.parse(request.expiresAt);
  }

  isProofExpired(proof: ApprovalProof): boolean {
    return proof.expiresAt !== undefined && Date.parse(this.ctx.clock.now()) >= Date.parse(proof.expiresAt);
  }

  detectExpiredRequests(): readonly ApprovalRequest[] {
    return this.store.getPendingRequests().filter((request) => this.isRequestExpired(request));
  }

  /** Marks every pending, past-expiry request as expired and records approval_expired events. */
  expirePendingRequests(): readonly ApprovalRequest[] {
    return this.detectExpiredRequests().map((request) => this.expireRequest(request));
  }

  expireRequestIfNeeded(approvalRequestId: string): ApprovalRequest | undefined {
    const request = this.store.getRequest(approvalRequestId);
    if (!request || request.status !== 'pending' || !this.isRequestExpired(request)) {
      return request;
    }
    return this.expireRequest(request);
  }

  expireProofIfNeeded(approvalProofId: string): ApprovalProof | undefined {
    const proof = this.store.getProof(approvalProofId);
    if (!proof || proof.status !== 'valid' || !this.isProofExpired(proof)) {
      return proof;
    }
    const expired = this.proofService.expireApprovalProof(approvalProofId);
    this.ledger.recordEvent({
      type: 'approval_expired',
      trustDomainId: expired.trustDomainId,
      approvalRequestId: expired.approvalRequestId,
      approvalDecisionId: expired.approvalDecisionId,
      approvalProofId: expired.id,
      payload: { expiresAt: expired.expiresAt },
    });
    return expired;
  }

  private expireRequest(request: ApprovalRequest): ApprovalRequest {
    const expired = this.requestService.markExpired(request.id);
    this.ledger.recordEvent({
      type: 'approval_expired',
      trustDomainId: expired.trustDomainId,
      approvalRequestId: expired.id,
      actionRequestId: expired.actionRequestId,
      payload: { expiresAt: expired.expiresAt },
    });
    return expired;
  }
}
