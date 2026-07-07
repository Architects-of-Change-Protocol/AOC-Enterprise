import { createDigest } from '../domain/approval-proof.js';
import type { ApprovalEvent, ApprovalEventType } from '../domain/approval-event.js';
import type { ApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';

export interface RecordApprovalEventInput {
  readonly type: ApprovalEventType;
  readonly trustDomainId: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;
  readonly actionRequestId?: string;
  readonly actorId?: string;
  readonly approverActorId?: string;
  readonly requestedByActorId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ApprovalEventTrailFilter {
  readonly trustDomainId?: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;
}

export class ApprovalLedger {
  private readonly events: ApprovalEvent[] = [];

  constructor(private readonly ctx: ApprovalRuntimeContext) {}

  recordEvent(input: RecordApprovalEventInput): ApprovalEvent {
    const timestamp = this.ctx.clock.now();
    const previousHash = this.events.at(-1)?.eventHash;
    const eventHash = createDigest({
      type: input.type,
      trustDomainId: input.trustDomainId,
      approvalRequestId: input.approvalRequestId,
      approvalDecisionId: input.approvalDecisionId,
      approvalProofId: input.approvalProofId,
      actionRequestId: input.actionRequestId,
      actorId: input.actorId,
      approverActorId: input.approverActorId,
      requestedByActorId: input.requestedByActorId,
      timestamp,
      payload: input.payload,
      previousHash,
    });

    const event: ApprovalEvent = {
      id: this.ctx.ids.nextId('approval-event'),
      type: input.type,
      trustDomainId: input.trustDomainId,
      timestamp,
      payload: input.payload,
      eventHash,
      ...(input.approvalRequestId !== undefined ? { approvalRequestId: input.approvalRequestId } : {}),
      ...(input.approvalDecisionId !== undefined ? { approvalDecisionId: input.approvalDecisionId } : {}),
      ...(input.approvalProofId !== undefined ? { approvalProofId: input.approvalProofId } : {}),
      ...(input.actionRequestId !== undefined ? { actionRequestId: input.actionRequestId } : {}),
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.approverActorId !== undefined ? { approverActorId: input.approverActorId } : {}),
      ...(input.requestedByActorId !== undefined ? { requestedByActorId: input.requestedByActorId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };
    this.events.push(event);
    return event;
  }

  getEventTrail(filter?: ApprovalEventTrailFilter): readonly ApprovalEvent[] {
    if (!filter) {
      return [...this.events];
    }
    return this.events.filter(
      (event) =>
        (filter.trustDomainId === undefined || event.trustDomainId === filter.trustDomainId) &&
        (filter.approvalRequestId === undefined || event.approvalRequestId === filter.approvalRequestId) &&
        (filter.approvalDecisionId === undefined || event.approvalDecisionId === filter.approvalDecisionId) &&
        (filter.approvalProofId === undefined || event.approvalProofId === filter.approvalProofId),
    );
  }

  getTrailByRequestId(approvalRequestId: string): readonly ApprovalEvent[] {
    return this.getEventTrail({ approvalRequestId });
  }
}
