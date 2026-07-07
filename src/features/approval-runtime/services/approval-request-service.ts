import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalRequestStatus } from '../domain/approval-status.js';
import type { ApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { InvalidApprovalStatusTransitionError } from '../runtime/approval-runtime-errors.js';
import type { ApprovalLedger } from './approval-ledger.js';
import type { ApprovalStore } from './approval-store.js';

export type CreateApprovalRequestInput = Omit<ApprovalRequest, 'id' | 'status' | 'createdAt' | 'expiresAt'> & {
  readonly id?: string;
  readonly expiresAt?: string;
};

const MS_PER_MINUTE = 60_000;

export class ApprovalRequestService {
  constructor(
    private readonly ctx: ApprovalRuntimeContext,
    private readonly store: ApprovalStore,
    private readonly ledger: ApprovalLedger,
  ) {}

  createApprovalRequest(input: CreateApprovalRequestInput): ApprovalRequest {
    const createdAt = this.ctx.clock.now();
    const expiresAt = input.expiresAt ?? this.computeExpiresAt(createdAt, input.requirement.expiresInMinutes);

    const request: ApprovalRequest = {
      ...input,
      id: input.id ?? this.ctx.ids.nextId('approval-request'),
      status: 'pending',
      createdAt,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    };
    this.store.putRequest(request);

    this.ledger.recordEvent({
      type: 'approval_requested',
      trustDomainId: request.trustDomainId,
      approvalRequestId: request.id,
      actionRequestId: request.actionRequestId,
      requestedByActorId: request.requestedByActorId,
      payload: { action: request.action, resourceScope: request.resourceScope, riskLevel: request.riskLevel },
    });

    return request;
  }

  getApprovalRequest(approvalRequestId: string): ApprovalRequest | undefined {
    return this.store.getRequest(approvalRequestId);
  }

  listPendingApprovalRequests(): readonly ApprovalRequest[] {
    return this.store.getPendingRequests();
  }

  markApproved(approvalRequestId: string): ApprovalRequest {
    return this.transition(approvalRequestId, 'approved');
  }

  markRejected(approvalRequestId: string): ApprovalRequest {
    return this.transition(approvalRequestId, 'rejected');
  }

  markExpired(approvalRequestId: string): ApprovalRequest {
    return this.transition(approvalRequestId, 'expired');
  }

  markRevoked(approvalRequestId: string): ApprovalRequest {
    return this.transition(approvalRequestId, 'revoked');
  }

  cancelApprovalRequest(approvalRequestId: string): ApprovalRequest {
    return this.transition(approvalRequestId, 'cancelled');
  }

  supersede(approvalRequestId: string): ApprovalRequest {
    return this.transition(approvalRequestId, 'superseded');
  }

  private transition(approvalRequestId: string, to: ApprovalRequestStatus): ApprovalRequest {
    const existing = this.store.getRequest(approvalRequestId);
    if (!existing) {
      throw new InvalidApprovalStatusTransitionError(approvalRequestId, 'unknown', to);
    }
    if (existing.status !== 'pending') {
      throw new InvalidApprovalStatusTransitionError(approvalRequestId, existing.status, to);
    }
    return this.store.updateRequestStatus(approvalRequestId, to);
  }

  private computeExpiresAt(createdAt: string, expiresInMinutes: number | undefined): string | undefined {
    if (expiresInMinutes === undefined) {
      return undefined;
    }
    return new Date(Date.parse(createdAt) + expiresInMinutes * MS_PER_MINUTE).toISOString();
  }
}
