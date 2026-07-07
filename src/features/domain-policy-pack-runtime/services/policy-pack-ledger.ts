import { createDigest } from '../domain/policy-pack-proof.js';
import type { PolicyPackEvent, PolicyPackEventType } from '../domain/policy-pack-event.js';
import type { PolicyPackRuntimeContext } from '../runtime/policy-pack-runtime-context.js';
import type { PolicyPackStore } from './policy-pack-store.js';

export interface RecordPolicyPackEventInput {
  readonly type: PolicyPackEventType;
  readonly policyPackId?: string;
  readonly policyPackVersionId?: string;
  readonly evaluationId?: string;
  readonly decisionId?: string;
  readonly proofId?: string;
  readonly trustDomainId?: string;
  readonly actorId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface PolicyPackEventFilter {
  readonly policyPackId?: string;
  readonly policyPackVersionId?: string;
  readonly evaluationId?: string;
  readonly decisionId?: string;
  readonly proofId?: string;
  readonly trustDomainId?: string;
  readonly actorId?: string;
}

/**
 * Records deterministic, hash-chained PolicyPackEvents. This service owns
 * the hashing rule, PolicyPackStore owns persistence and querying.
 */
export class PolicyPackLedger {
  constructor(
    private readonly ctx: PolicyPackRuntimeContext,
    private readonly store: PolicyPackStore,
  ) {}

  recordEvent(input: RecordPolicyPackEventInput): PolicyPackEvent {
    const timestamp = this.ctx.clock.now();
    const previousHash = this.store.getLatestEvent()?.eventHash;
    const eventHash = createDigest({
      type: input.type,
      policyPackId: input.policyPackId,
      policyPackVersionId: input.policyPackVersionId,
      evaluationId: input.evaluationId,
      decisionId: input.decisionId,
      proofId: input.proofId,
      trustDomainId: input.trustDomainId,
      actorId: input.actorId,
      timestamp,
      payload: input.payload,
      previousHash,
    });

    const event: PolicyPackEvent = {
      id: this.ctx.ids.nextId('policy-pack-event'),
      type: input.type,
      timestamp,
      payload: input.payload,
      eventHash,
      ...(input.policyPackId !== undefined ? { policyPackId: input.policyPackId } : {}),
      ...(input.policyPackVersionId !== undefined ? { policyPackVersionId: input.policyPackVersionId } : {}),
      ...(input.evaluationId !== undefined ? { evaluationId: input.evaluationId } : {}),
      ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
      ...(input.proofId !== undefined ? { proofId: input.proofId } : {}),
      ...(input.trustDomainId !== undefined ? { trustDomainId: input.trustDomainId } : {}),
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };

    return this.store.saveEvent(event);
  }

  getEvents(filter?: PolicyPackEventFilter): readonly PolicyPackEvent[] {
    const all = this.store.getEvents();
    if (!filter) {
      return all;
    }
    return all.filter(
      (event) =>
        (filter.policyPackId === undefined || event.policyPackId === filter.policyPackId) &&
        (filter.policyPackVersionId === undefined || event.policyPackVersionId === filter.policyPackVersionId) &&
        (filter.evaluationId === undefined || event.evaluationId === filter.evaluationId) &&
        (filter.decisionId === undefined || event.decisionId === filter.decisionId) &&
        (filter.proofId === undefined || event.proofId === filter.proofId) &&
        (filter.trustDomainId === undefined || event.trustDomainId === filter.trustDomainId) &&
        (filter.actorId === undefined || event.actorId === filter.actorId),
    );
  }

  getTrailByEvaluation(evaluationId: string): readonly PolicyPackEvent[] {
    return this.getEvents({ evaluationId });
  }

  getTrailByDecision(decisionId: string): readonly PolicyPackEvent[] {
    return this.getEvents({ decisionId });
  }

  getTrailByProof(proofId: string): readonly PolicyPackEvent[] {
    return this.getEvents({ proofId });
  }

  getTrailByTrustDomain(trustDomainId: string): readonly PolicyPackEvent[] {
    return this.getEvents({ trustDomainId });
  }
}
