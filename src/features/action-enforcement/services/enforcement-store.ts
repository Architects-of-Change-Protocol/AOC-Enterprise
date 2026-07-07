import type { EnforcementAdapter } from '../domain/enforcement-adapter.js';
import type { EnforcementDecision } from '../domain/enforcement-decision.js';
import type { EnforcementEvent } from '../domain/enforcement-event.js';
import type { EnforcementProof } from '../domain/enforcement-proof.js';
import type { EnforcementRequest, EnforcementRequestStatus } from '../domain/enforcement-request.js';
import type { EnforcementViolation } from '../domain/enforcement-violation.js';
import type { ExecutionResult } from '../domain/execution-result.js';
import type { SideEffectDescriptor, SideEffectStatus } from '../domain/side-effect.js';

export interface EnforcementEventFilter {
  readonly enforcementRequestId?: string;
  readonly enforcementDecisionId?: string;
  readonly enforcementProofId?: string;
  readonly trustDomainId?: string;
  readonly actorId?: string;
}

/**
 * Single source of truth for every enforcement record. Higher-level services
 * (EnforcementLedger, EnforcementProofService, IdempotencyService) read the
 * latest persisted record here to compute deterministic hash chains, then
 * write their result back through this store -- the store never computes
 * hashes or business rules itself.
 */
export class EnforcementStore {
  private readonly requests = new Map<string, EnforcementRequest>();
  private readonly decisions = new Map<string, EnforcementDecision>();
  private readonly results = new Map<string, ExecutionResult>();
  private readonly sideEffects = new Map<string, SideEffectDescriptor>();
  private readonly proofs = new Map<string, EnforcementProof>();
  private readonly events: EnforcementEvent[] = [];
  private readonly adapters = new Map<string, EnforcementAdapter>();
  private readonly violations = new Map<string, EnforcementViolation>();

  saveRequest(request: EnforcementRequest): EnforcementRequest {
    this.requests.set(request.id, request);
    return request;
  }

  getRequest(enforcementRequestId: string): EnforcementRequest | undefined {
    return this.requests.get(enforcementRequestId);
  }

  updateRequestStatus(enforcementRequestId: string, status: EnforcementRequestStatus): EnforcementRequest | undefined {
    const existing = this.requests.get(enforcementRequestId);
    if (!existing) {
      return undefined;
    }
    const updated: EnforcementRequest = { ...existing, status };
    this.requests.set(enforcementRequestId, updated);
    return updated;
  }

  replaceRequestSideEffects(enforcementRequestId: string, sideEffects: readonly SideEffectDescriptor[]): EnforcementRequest | undefined {
    const existing = this.requests.get(enforcementRequestId);
    if (!existing) {
      return undefined;
    }
    const updated: EnforcementRequest = { ...existing, sideEffects };
    this.requests.set(enforcementRequestId, updated);
    return updated;
  }

  getRequestsByActor(actorId: string): readonly EnforcementRequest[] {
    return [...this.requests.values()].filter((request) => request.actorId === actorId);
  }

  getRequestsByTrustDomain(trustDomainId: string): readonly EnforcementRequest[] {
    return [...this.requests.values()].filter((request) => request.trustDomainId === trustDomainId);
  }

  getRequestsByAction(action: string): readonly EnforcementRequest[] {
    return [...this.requests.values()].filter((request) => request.action === action);
  }

  saveDecision(decision: EnforcementDecision): EnforcementDecision {
    this.decisions.set(decision.id, decision);
    return decision;
  }

  getDecision(enforcementDecisionId: string): EnforcementDecision | undefined {
    return this.decisions.get(enforcementDecisionId);
  }

  getDecisionsByRequest(enforcementRequestId: string): readonly EnforcementDecision[] {
    return [...this.decisions.values()].filter((decision) => decision.enforcementRequestId === enforcementRequestId);
  }

  saveResult(result: ExecutionResult): ExecutionResult {
    this.results.set(result.id, result);
    return result;
  }

  getResult(executionResultId: string): ExecutionResult | undefined {
    return this.results.get(executionResultId);
  }

  getResultsByRequest(enforcementRequestId: string): readonly ExecutionResult[] {
    return [...this.results.values()].filter((result) => result.enforcementRequestId === enforcementRequestId);
  }

  saveSideEffect(sideEffect: SideEffectDescriptor): SideEffectDescriptor {
    this.sideEffects.set(sideEffect.id, sideEffect);
    return sideEffect;
  }

  getSideEffect(sideEffectId: string): SideEffectDescriptor | undefined {
    return this.sideEffects.get(sideEffectId);
  }

  getSideEffectsByRequest(enforcementRequestId: string): readonly SideEffectDescriptor[] {
    return [...this.sideEffects.values()].filter((sideEffect) => sideEffect.enforcementRequestId === enforcementRequestId);
  }

  updateSideEffectStatus(
    sideEffectId: string,
    status: SideEffectStatus,
    timestamps: { readonly executedAt?: string; readonly failedAt?: string } = {},
  ): SideEffectDescriptor | undefined {
    const existing = this.sideEffects.get(sideEffectId);
    if (!existing) {
      return undefined;
    }
    const updated: SideEffectDescriptor = {
      ...existing,
      status,
      ...(timestamps.executedAt !== undefined ? { executedAt: timestamps.executedAt } : {}),
      ...(timestamps.failedAt !== undefined ? { failedAt: timestamps.failedAt } : {}),
    };
    this.sideEffects.set(sideEffectId, updated);
    return updated;
  }

  saveProof(proof: EnforcementProof): EnforcementProof {
    this.proofs.set(proof.id, proof);
    return proof;
  }

  getProof(enforcementProofId: string): EnforcementProof | undefined {
    return this.proofs.get(enforcementProofId);
  }

  getProofByDecision(enforcementDecisionId: string): EnforcementProof | undefined {
    return [...this.proofs.values()].find((proof) => proof.enforcementDecisionId === enforcementDecisionId);
  }

  getProofsByRequest(enforcementRequestId: string): readonly EnforcementProof[] {
    return [...this.proofs.values()].filter((proof) => proof.enforcementRequestId === enforcementRequestId);
  }

  getLatestProof(): EnforcementProof | undefined {
    return this.proofs.size === 0 ? undefined : [...this.proofs.values()].at(-1);
  }

  saveEvent(event: EnforcementEvent): EnforcementEvent {
    this.events.push(event);
    return event;
  }

  getEvent(enforcementEventId: string): EnforcementEvent | undefined {
    return this.events.find((event) => event.id === enforcementEventId);
  }

  getLatestEvent(): EnforcementEvent | undefined {
    return this.events.at(-1);
  }

  getEvents(filter?: EnforcementEventFilter): readonly EnforcementEvent[] {
    if (!filter) {
      return [...this.events];
    }
    return this.events.filter(
      (event) =>
        (filter.enforcementRequestId === undefined || event.enforcementRequestId === filter.enforcementRequestId) &&
        (filter.enforcementDecisionId === undefined || event.enforcementDecisionId === filter.enforcementDecisionId) &&
        (filter.enforcementProofId === undefined || event.enforcementProofId === filter.enforcementProofId) &&
        (filter.trustDomainId === undefined || event.trustDomainId === filter.trustDomainId) &&
        (filter.actorId === undefined || event.actorId === filter.actorId),
    );
  }

  saveAdapter(adapter: EnforcementAdapter): EnforcementAdapter {
    this.adapters.set(adapter.id, adapter);
    return adapter;
  }

  getAdapter(adapterId: string): EnforcementAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  getAdaptersByType(type: EnforcementAdapter['type']): readonly EnforcementAdapter[] {
    return [...this.adapters.values()].filter((adapter) => adapter.type === type);
  }

  saveViolation(violation: EnforcementViolation): EnforcementViolation {
    this.violations.set(violation.id, violation);
    return violation;
  }

  getViolation(enforcementViolationId: string): EnforcementViolation | undefined {
    return this.violations.get(enforcementViolationId);
  }

  getViolationsByRequest(enforcementRequestId: string): readonly EnforcementViolation[] {
    return [...this.violations.values()].filter((violation) => violation.enforcementRequestId === enforcementRequestId);
  }
}
