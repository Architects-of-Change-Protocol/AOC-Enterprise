import { createDigest } from '../domain/handshake-proof.js';
import type { HandshakeEvent, HandshakeEventType } from '../domain/handshake-event.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import type { HandshakeStore } from './handshake-store.js';

export interface RecordHandshakeEventInput {
  readonly type: HandshakeEventType;
  readonly localTrustDomainId: string;
  readonly externalAgentId?: string;
  readonly externalIssuerId?: string;
  readonly handshakeRequestId?: string;
  readonly handshakeSessionId?: string;
  readonly handshakeDecisionId?: string;
  readonly handshakeProofId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface HandshakeEventTrailFilter {
  readonly localTrustDomainId?: string;
  readonly handshakeRequestId?: string;
  readonly externalAgentId?: string;
  readonly visaId?: string;
  readonly handshakeDecisionId?: string;
  readonly handshakeProofId?: string;
}

/**
 * Records deterministic, hash-chained HandshakeEvents. Events themselves are
 * persisted through HandshakeStore (rather than a private array) so
 * HandshakeStore's query methods stay the single source of truth for the
 * event trail, per the External Agent Handshake spec.
 */
export class HandshakeLedger {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
  ) {}

  recordEvent(input: RecordHandshakeEventInput): HandshakeEvent {
    const timestamp = this.ctx.clock.now();
    const previousHash = this.store.getLastEvent()?.eventHash;
    const eventHash = createDigest({
      type: input.type,
      localTrustDomainId: input.localTrustDomainId,
      externalAgentId: input.externalAgentId,
      externalIssuerId: input.externalIssuerId,
      handshakeRequestId: input.handshakeRequestId,
      handshakeSessionId: input.handshakeSessionId,
      handshakeDecisionId: input.handshakeDecisionId,
      handshakeProofId: input.handshakeProofId,
      visaId: input.visaId,
      ingressGrantId: input.ingressGrantId,
      timestamp,
      payload: input.payload,
      previousHash,
    });

    const event: HandshakeEvent = {
      id: this.ctx.ids.nextId('handshake-event'),
      type: input.type,
      localTrustDomainId: input.localTrustDomainId,
      timestamp,
      payload: input.payload,
      eventHash,
      ...(input.externalAgentId !== undefined ? { externalAgentId: input.externalAgentId } : {}),
      ...(input.externalIssuerId !== undefined ? { externalIssuerId: input.externalIssuerId } : {}),
      ...(input.handshakeRequestId !== undefined ? { handshakeRequestId: input.handshakeRequestId } : {}),
      ...(input.handshakeSessionId !== undefined ? { handshakeSessionId: input.handshakeSessionId } : {}),
      ...(input.handshakeDecisionId !== undefined ? { handshakeDecisionId: input.handshakeDecisionId } : {}),
      ...(input.handshakeProofId !== undefined ? { handshakeProofId: input.handshakeProofId } : {}),
      ...(input.visaId !== undefined ? { visaId: input.visaId } : {}),
      ...(input.ingressGrantId !== undefined ? { ingressGrantId: input.ingressGrantId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };
    this.store.putEvent(event);
    return event;
  }

  getEventTrail(filter?: HandshakeEventTrailFilter): readonly HandshakeEvent[] {
    const all = this.store.getAllEvents();
    if (!filter) {
      return all;
    }
    return all.filter(
      (event) =>
        (filter.localTrustDomainId === undefined || event.localTrustDomainId === filter.localTrustDomainId) &&
        (filter.handshakeRequestId === undefined || event.handshakeRequestId === filter.handshakeRequestId) &&
        (filter.externalAgentId === undefined || event.externalAgentId === filter.externalAgentId) &&
        (filter.visaId === undefined || event.visaId === filter.visaId) &&
        (filter.handshakeDecisionId === undefined || event.handshakeDecisionId === filter.handshakeDecisionId) &&
        (filter.handshakeProofId === undefined || event.handshakeProofId === filter.handshakeProofId),
    );
  }

  getTrailByRequestId(handshakeRequestId: string): readonly HandshakeEvent[] {
    return this.getEventTrail({ handshakeRequestId });
  }

  getTrailByExternalAgentId(externalAgentId: string): readonly HandshakeEvent[] {
    return this.getEventTrail({ externalAgentId });
  }

  getTrailByVisaId(visaId: string): readonly HandshakeEvent[] {
    return this.getEventTrail({ visaId });
  }
}
