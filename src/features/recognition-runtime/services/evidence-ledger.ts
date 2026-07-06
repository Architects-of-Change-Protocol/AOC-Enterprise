import { createDigest } from '../domain/proof.js';
import type { AuditEvent, AuditEventType } from '../domain/audit-event.js';
import type { RuntimeContext } from '../runtime/runtime-context.js';

export interface RecordAuditEventInput {
  readonly eventType: AuditEventType;
  readonly actorId: string;
  readonly trustDomainId: string;
  readonly requestId?: string;
  readonly decisionId?: string;
  readonly passportId?: string;
  readonly capabilityTokenId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface AuditTrailFilter {
  readonly actorId?: string;
  readonly trustDomainId?: string;
  readonly requestId?: string;
}

export interface ActionProofExport {
  readonly requestId: string;
  readonly events: readonly AuditEvent[];
  readonly rootHash?: string;
  readonly exportedAt: string;
}

export class EvidenceLedger {
  private readonly events: AuditEvent[] = [];

  constructor(private readonly ctx: RuntimeContext) {}

  recordAuditEvent(input: RecordAuditEventInput): AuditEvent {
    const timestamp = this.ctx.clock.now();
    const previousHash = this.events.at(-1)?.eventHash;
    const eventHash = createDigest({
      eventType: input.eventType,
      actorId: input.actorId,
      trustDomainId: input.trustDomainId,
      requestId: input.requestId,
      decisionId: input.decisionId,
      passportId: input.passportId,
      capabilityTokenId: input.capabilityTokenId,
      timestamp,
      payload: input.payload,
      previousHash,
    });
    const event: AuditEvent = {
      id: this.ctx.idGenerator.next('audit-event'),
      eventType: input.eventType,
      actorId: input.actorId,
      trustDomainId: input.trustDomainId,
      timestamp,
      payload: input.payload,
      eventHash,
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
      ...(input.passportId !== undefined ? { passportId: input.passportId } : {}),
      ...(input.capabilityTokenId !== undefined ? { capabilityTokenId: input.capabilityTokenId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };
    this.events.push(event);
    return event;
  }

  getAuditTrail(filter?: AuditTrailFilter): readonly AuditEvent[] {
    if (!filter) {
      return [...this.events];
    }
    return this.events.filter(
      (event) =>
        (filter.actorId === undefined || event.actorId === filter.actorId) &&
        (filter.trustDomainId === undefined || event.trustDomainId === filter.trustDomainId) &&
        (filter.requestId === undefined || event.requestId === filter.requestId),
    );
  }

  exportActionProof(requestId: string): ActionProofExport | undefined {
    const events = this.getAuditTrail({ requestId });
    if (events.length === 0) {
      return undefined;
    }
    const rootHash = events.at(-1)?.eventHash;
    return {
      requestId,
      events,
      exportedAt: this.ctx.clock.now(),
      ...(rootHash !== undefined ? { rootHash } : {}),
    };
  }
}
