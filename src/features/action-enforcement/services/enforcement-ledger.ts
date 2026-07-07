import { createDigest } from '../domain/enforcement-proof.js';
import type { EnforcementEvent, EnforcementEventType } from '../domain/enforcement-event.js';
import type { EnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import type { EnforcementEventFilter, EnforcementStore } from './enforcement-store.js';

export interface RecordEnforcementEventInput {
  readonly type: EnforcementEventType;
  readonly trustDomainId: string;
  readonly enforcementRequestId?: string;
  readonly enforcementDecisionId?: string;
  readonly executionResultId?: string;
  readonly enforcementProofId?: string;
  readonly violationId?: string;
  readonly actorId?: string;
  readonly principalActorId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Records deterministic, hash-chained EnforcementEvents. Mirrors
 * AuthorityLineageLedger/EvidenceLedger: this service owns the hashing rule,
 * EnforcementStore owns persistence and querying.
 */
export class EnforcementLedger {
  constructor(
    private readonly ctx: EnforcementRuntimeContext,
    private readonly store: EnforcementStore,
  ) {}

  recordEvent(input: RecordEnforcementEventInput): EnforcementEvent {
    const timestamp = this.ctx.clock.now();
    const previousHash = this.store.getLatestEvent()?.eventHash;
    const eventHash = createDigest({
      type: input.type,
      trustDomainId: input.trustDomainId,
      enforcementRequestId: input.enforcementRequestId,
      enforcementDecisionId: input.enforcementDecisionId,
      executionResultId: input.executionResultId,
      enforcementProofId: input.enforcementProofId,
      violationId: input.violationId,
      actorId: input.actorId,
      principalActorId: input.principalActorId,
      timestamp,
      payload: input.payload,
      previousHash,
    });

    const event: EnforcementEvent = {
      id: this.ctx.ids.nextId('enforcement-event'),
      type: input.type,
      trustDomainId: input.trustDomainId,
      timestamp,
      payload: input.payload,
      eventHash,
      ...(input.enforcementRequestId !== undefined ? { enforcementRequestId: input.enforcementRequestId } : {}),
      ...(input.enforcementDecisionId !== undefined ? { enforcementDecisionId: input.enforcementDecisionId } : {}),
      ...(input.executionResultId !== undefined ? { executionResultId: input.executionResultId } : {}),
      ...(input.enforcementProofId !== undefined ? { enforcementProofId: input.enforcementProofId } : {}),
      ...(input.violationId !== undefined ? { violationId: input.violationId } : {}),
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };

    return this.store.saveEvent(event);
  }

  getTrailByRequest(enforcementRequestId: string): readonly EnforcementEvent[] {
    return this.store.getEvents({ enforcementRequestId });
  }

  getEventsByTrustDomain(trustDomainId: string): readonly EnforcementEvent[] {
    return this.store.getEvents({ trustDomainId });
  }

  getEventsByActor(actorId: string): readonly EnforcementEvent[] {
    return this.store.getEvents({ actorId });
  }

  getEventsByDecision(enforcementDecisionId: string): readonly EnforcementEvent[] {
    return this.store.getEvents({ enforcementDecisionId });
  }

  getEventsByProof(enforcementProofId: string): readonly EnforcementEvent[] {
    return this.store.getEvents({ enforcementProofId });
  }

  getEvents(filter?: EnforcementEventFilter): readonly EnforcementEvent[] {
    return this.store.getEvents(filter);
  }
}
