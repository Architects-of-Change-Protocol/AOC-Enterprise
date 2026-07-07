import type { EnforcementMode, EnforcementRequest } from '../domain/enforcement-request.js';
import type { EnforcementTarget } from '../domain/enforcement-target.js';
import type { ExecutionIntent } from '../domain/execution-intent.js';
import type { EnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import type { EnforcementLedger } from './enforcement-ledger.js';
import type { EnforcementStore } from './enforcement-store.js';
import type { SideEffectLedger } from './side-effect-ledger.js';

export interface CreateEnforcementRequestInput {
  readonly mode: EnforcementMode;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly principalActorId?: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly target: EnforcementTarget;
  readonly intent: ExecutionIntent;
  readonly idempotencyKey?: string;
  readonly expiresAt?: string;
  readonly actionRequestId?: string;

  /** Caller-presented references to a prior approval or external-agent handshake, forwarded to Recognition Runtime during preflight. */
  readonly approvalProofId?: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeProofId?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class EnforcementRequestService {
  constructor(
    private readonly ctx: EnforcementRuntimeContext,
    private readonly store: EnforcementStore,
    private readonly ledger: EnforcementLedger,
    private readonly sideEffectLedger: SideEffectLedger,
  ) {}

  createEnforcementRequest(input: CreateEnforcementRequestInput): EnforcementRequest {
    const id = this.ctx.ids.nextId('enforcement-request');
    const submittedAt = this.ctx.clock.now();

    const request: EnforcementRequest = {
      id,
      mode: input.mode,
      status: 'submitted',
      trustDomainId: input.trustDomainId,
      actorId: input.actorId,
      action: input.action,
      resourceScope: input.resourceScope,
      target: input.target,
      intent: input.intent,
      sideEffects: [],
      submittedAt,
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.actionRequestId !== undefined ? { actionRequestId: input.actionRequestId } : {}),
      ...(input.approvalProofId !== undefined ? { approvalProofId: input.approvalProofId } : {}),
      ...(input.approvalRequestId !== undefined ? { approvalRequestId: input.approvalRequestId } : {}),
      ...(input.approvalDecisionId !== undefined ? { approvalDecisionId: input.approvalDecisionId } : {}),
      ...(input.visaId !== undefined ? { visaId: input.visaId } : {}),
      ...(input.ingressGrantId !== undefined ? { ingressGrantId: input.ingressGrantId } : {}),
      ...(input.handshakeProofId !== undefined ? { handshakeProofId: input.handshakeProofId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    this.store.saveRequest(request);

    const sideEffect = this.sideEffectLedger.planSideEffect({
      enforcementRequestId: id,
      trustDomainId: input.trustDomainId,
      actorId: input.actorId,
      intent: input.intent,
    });
    const withSideEffect = this.store.replaceRequestSideEffects(id, [sideEffect]) ?? request;

    this.ledger.recordEvent({
      type: 'enforcement_requested',
      trustDomainId: input.trustDomainId,
      enforcementRequestId: id,
      actorId: input.actorId,
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      payload: { action: input.action, resourceScope: input.resourceScope, mode: input.mode },
    });

    return withSideEffect;
  }

  getEnforcementRequest(enforcementRequestId: string): EnforcementRequest | undefined {
    return this.store.getRequest(enforcementRequestId);
  }

  expireEnforcementRequest(enforcementRequestId: string): EnforcementRequest | undefined {
    return this.store.updateRequestStatus(enforcementRequestId, 'blocked');
  }

  cancelEnforcementRequest(enforcementRequestId: string): EnforcementRequest | undefined {
    return this.store.updateRequestStatus(enforcementRequestId, 'cancelled');
  }
}
