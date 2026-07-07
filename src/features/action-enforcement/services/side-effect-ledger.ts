import type { ExecutionIntent } from '../domain/execution-intent.js';
import type { SideEffectDescriptor } from '../domain/side-effect.js';
import type { EnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import type { EnforcementLedger } from './enforcement-ledger.js';
import type { EnforcementStore } from './enforcement-store.js';

export interface PlanSideEffectInput {
  readonly enforcementRequestId: string;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly intent: ExecutionIntent;
  readonly targetSystem?: string;
  readonly targetResource?: string;
}

/**
 * Tracks the lifecycle of the side effect(s) a real execute() callback would
 * cause: planned at request time, then blocked/executed/failed/skipped
 * depending on what enforcement (and, if allowed, the callback itself)
 * decided. Blocked and dry-run requests must never reach 'executed'.
 */
export class SideEffectLedger {
  constructor(
    private readonly ctx: EnforcementRuntimeContext,
    private readonly store: EnforcementStore,
    private readonly ledger: EnforcementLedger,
  ) {}

  planSideEffect(input: PlanSideEffectInput): SideEffectDescriptor {
    const descriptor: SideEffectDescriptor = {
      id: this.ctx.ids.nextId('side-effect'),
      enforcementRequestId: input.enforcementRequestId,
      type: input.intent.sideEffectType,
      status: 'planned',
      plannedAt: this.ctx.clock.now(),
      ...(input.targetSystem !== undefined ? { targetSystem: input.targetSystem } : {}),
      ...(input.targetResource !== undefined ? { targetResource: input.targetResource } : {}),
      ...(input.intent.description !== undefined ? { description: input.intent.description } : {}),
    };
    this.store.saveSideEffect(descriptor);
    this.ledger.recordEvent({
      type: 'side_effect_planned',
      trustDomainId: input.trustDomainId,
      enforcementRequestId: input.enforcementRequestId,
      actorId: input.actorId,
      payload: { sideEffectId: descriptor.id, sideEffectType: descriptor.type },
    });
    return descriptor;
  }

  markBlocked(sideEffectId: string, trustDomainId: string, actorId?: string): SideEffectDescriptor | undefined {
    const updated = this.store.updateSideEffectStatus(sideEffectId, 'blocked');
    if (!updated) {
      return undefined;
    }
    this.ledger.recordEvent({
      type: 'side_effect_blocked',
      trustDomainId,
      enforcementRequestId: updated.enforcementRequestId,
      ...(actorId !== undefined ? { actorId } : {}),
      payload: { sideEffectId },
    });
    return updated;
  }

  markExecuted(sideEffectId: string, trustDomainId: string, actorId?: string): SideEffectDescriptor | undefined {
    const updated = this.store.updateSideEffectStatus(sideEffectId, 'executed', { executedAt: this.ctx.clock.now() });
    if (!updated) {
      return undefined;
    }
    this.ledger.recordEvent({
      type: 'side_effect_executed',
      trustDomainId,
      enforcementRequestId: updated.enforcementRequestId,
      ...(actorId !== undefined ? { actorId } : {}),
      payload: { sideEffectId },
    });
    return updated;
  }

  markFailed(sideEffectId: string): SideEffectDescriptor | undefined {
    return this.store.updateSideEffectStatus(sideEffectId, 'failed', { failedAt: this.ctx.clock.now() });
  }

  markSkipped(sideEffectId: string): SideEffectDescriptor | undefined {
    return this.store.updateSideEffectStatus(sideEffectId, 'skipped');
  }

  getTrailByRequest(enforcementRequestId: string): readonly SideEffectDescriptor[] {
    return this.store.getSideEffectsByRequest(enforcementRequestId);
  }
}
