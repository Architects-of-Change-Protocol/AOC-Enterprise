import { createDigest } from '../domain/authority-proof.js';
import type { AuthorityEvent, AuthorityEventType } from '../domain/authority-event.js';
import type { AuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';

export interface RecordAuthorityEventInput {
  readonly type: AuthorityEventType;
  readonly trustDomainId: string;
  readonly actorId?: string;
  readonly issuerActorId?: string;
  readonly subjectActorId?: string;
  readonly delegatorActorId?: string;
  readonly delegateActorId?: string;
  readonly authorityGrantId?: string;
  readonly delegationGrantId?: string;
  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface AuthorityEventTrailFilter {
  readonly actorId?: string;
  readonly trustDomainId?: string;
  readonly authorityDecisionId?: string;
  readonly authorityGrantId?: string;
  readonly delegationGrantId?: string;
}

export class AuthorityLineageLedger {
  private readonly events: AuthorityEvent[] = [];

  constructor(private readonly ctx: AuthorityRuntimeContext) {}

  recordEvent(input: RecordAuthorityEventInput): AuthorityEvent {
    const timestamp = this.ctx.clock.now();
    const previousHash = this.events.at(-1)?.eventHash;
    const eventHash = createDigest({
      type: input.type,
      trustDomainId: input.trustDomainId,
      actorId: input.actorId,
      issuerActorId: input.issuerActorId,
      subjectActorId: input.subjectActorId,
      delegatorActorId: input.delegatorActorId,
      delegateActorId: input.delegateActorId,
      authorityGrantId: input.authorityGrantId,
      delegationGrantId: input.delegationGrantId,
      authorityDecisionId: input.authorityDecisionId,
      authorityProofId: input.authorityProofId,
      timestamp,
      payload: input.payload,
      previousHash,
    });

    const event: AuthorityEvent = {
      id: this.ctx.ids.nextId('authority-event'),
      type: input.type,
      trustDomainId: input.trustDomainId,
      timestamp,
      payload: input.payload,
      eventHash,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.issuerActorId !== undefined ? { issuerActorId: input.issuerActorId } : {}),
      ...(input.subjectActorId !== undefined ? { subjectActorId: input.subjectActorId } : {}),
      ...(input.delegatorActorId !== undefined ? { delegatorActorId: input.delegatorActorId } : {}),
      ...(input.delegateActorId !== undefined ? { delegateActorId: input.delegateActorId } : {}),
      ...(input.authorityGrantId !== undefined ? { authorityGrantId: input.authorityGrantId } : {}),
      ...(input.delegationGrantId !== undefined ? { delegationGrantId: input.delegationGrantId } : {}),
      ...(input.authorityDecisionId !== undefined ? { authorityDecisionId: input.authorityDecisionId } : {}),
      ...(input.authorityProofId !== undefined ? { authorityProofId: input.authorityProofId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };
    this.events.push(event);
    return event;
  }

  getEventTrail(filter?: AuthorityEventTrailFilter): readonly AuthorityEvent[] {
    if (!filter) {
      return [...this.events];
    }
    return this.events.filter(
      (event) =>
        (filter.actorId === undefined || event.actorId === filter.actorId) &&
        (filter.trustDomainId === undefined || event.trustDomainId === filter.trustDomainId) &&
        (filter.authorityDecisionId === undefined || event.authorityDecisionId === filter.authorityDecisionId) &&
        (filter.authorityGrantId === undefined || event.authorityGrantId === filter.authorityGrantId) &&
        (filter.delegationGrantId === undefined || event.delegationGrantId === filter.delegationGrantId),
    );
  }
}
