import { createDigest } from '../domain/enforcement-proof.js';
import type { EnforcementProof } from '../domain/enforcement-proof.js';
import type { EnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import type { EnforcementStore } from './enforcement-store.js';

export interface CreateEnforcementProofInput {
  readonly enforcementRequestId: string;
  readonly enforcementDecisionId: string;
  readonly executionResultId?: string;

  readonly trustDomainId: string;
  readonly actorId: string;
  readonly principalActorId?: string;

  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;

  readonly allowedToExecute: boolean;
  readonly executed: boolean;

  readonly recognitionDecisionId?: string;
  readonly authorityProofId?: string;
  readonly approvalProofId?: string;
  readonly handshakeProofId?: string;

  readonly policyDecisionId?: string;
  readonly policyProofId?: string;
  readonly policyPackVersionIds?: readonly string[];
  readonly policyMatchedRuleIds?: readonly string[];

  readonly sideEffectIds: readonly string[];

  readonly idempotencyKey?: string;
}

/**
 * Creates deterministic, hash-chained EnforcementProofs. Mirrors
 * AuthorityProofService: the proof hash is a pure function of the decision,
 * execution result and upstream proof references, so identical inputs always
 * produce an identical proofHash, and every change to decision/result/side
 * effects changes it.
 */
export class EnforcementProofService {
  constructor(
    private readonly ctx: EnforcementRuntimeContext,
    private readonly store: EnforcementStore,
  ) {}

  createProof(input: CreateEnforcementProofInput): EnforcementProof {
    const previousHash = this.store.getLatestProof()?.proofHash;
    const proofHash = createDigest({
      enforcementRequestId: input.enforcementRequestId,
      enforcementDecisionId: input.enforcementDecisionId,
      executionResultId: input.executionResultId,
      trustDomainId: input.trustDomainId,
      actorId: input.actorId,
      principalActorId: input.principalActorId,
      action: input.action,
      capability: input.capability,
      resourceScope: input.resourceScope,
      allowedToExecute: input.allowedToExecute,
      executed: input.executed,
      recognitionDecisionId: input.recognitionDecisionId,
      authorityProofId: input.authorityProofId,
      approvalProofId: input.approvalProofId,
      handshakeProofId: input.handshakeProofId,
      policyDecisionId: input.policyDecisionId,
      policyProofId: input.policyProofId,
      policyPackVersionIds: input.policyPackVersionIds,
      policyMatchedRuleIds: input.policyMatchedRuleIds,
      sideEffectIds: input.sideEffectIds,
      idempotencyKey: input.idempotencyKey,
      previousHash,
    });

    const proof: EnforcementProof = {
      id: this.ctx.ids.nextId('enforcement-proof'),
      enforcementRequestId: input.enforcementRequestId,
      enforcementDecisionId: input.enforcementDecisionId,
      trustDomainId: input.trustDomainId,
      actorId: input.actorId,
      action: input.action,
      resourceScope: input.resourceScope,
      allowedToExecute: input.allowedToExecute,
      executed: input.executed,
      sideEffectIds: input.sideEffectIds,
      proofHash,
      createdAt: this.ctx.clock.now(),
      ...(input.executionResultId !== undefined ? { executionResultId: input.executionResultId } : {}),
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.recognitionDecisionId !== undefined ? { recognitionDecisionId: input.recognitionDecisionId } : {}),
      ...(input.authorityProofId !== undefined ? { authorityProofId: input.authorityProofId } : {}),
      ...(input.approvalProofId !== undefined ? { approvalProofId: input.approvalProofId } : {}),
      ...(input.handshakeProofId !== undefined ? { handshakeProofId: input.handshakeProofId } : {}),
      ...(input.policyDecisionId !== undefined ? { policyDecisionId: input.policyDecisionId } : {}),
      ...(input.policyProofId !== undefined ? { policyProofId: input.policyProofId } : {}),
      ...(input.policyPackVersionIds !== undefined ? { policyPackVersionIds: input.policyPackVersionIds } : {}),
      ...(input.policyMatchedRuleIds !== undefined ? { policyMatchedRuleIds: input.policyMatchedRuleIds } : {}),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };

    return this.store.saveProof(proof);
  }

  getProofByDecisionId(enforcementDecisionId: string): EnforcementProof | undefined {
    return this.store.getProofByDecision(enforcementDecisionId);
  }

  getProofsByRequest(enforcementRequestId: string): readonly EnforcementProof[] {
    return this.store.getProofsByRequest(enforcementRequestId);
  }

  /** Deterministically re-derives the proofHash from the proof's own recorded fields and compares it. */
  verifyProof(proof: EnforcementProof): boolean {
    const recomputedHash = createDigest({
      enforcementRequestId: proof.enforcementRequestId,
      enforcementDecisionId: proof.enforcementDecisionId,
      executionResultId: proof.executionResultId,
      trustDomainId: proof.trustDomainId,
      actorId: proof.actorId,
      principalActorId: proof.principalActorId,
      action: proof.action,
      capability: proof.capability,
      resourceScope: proof.resourceScope,
      allowedToExecute: proof.allowedToExecute,
      executed: proof.executed,
      recognitionDecisionId: proof.recognitionDecisionId,
      authorityProofId: proof.authorityProofId,
      approvalProofId: proof.approvalProofId,
      handshakeProofId: proof.handshakeProofId,
      policyDecisionId: proof.policyDecisionId,
      policyProofId: proof.policyProofId,
      policyPackVersionIds: proof.policyPackVersionIds,
      policyMatchedRuleIds: proof.policyMatchedRuleIds,
      sideEffectIds: proof.sideEffectIds,
      idempotencyKey: proof.idempotencyKey,
      previousHash: proof.previousHash,
    });
    return recomputedHash === proof.proofHash;
  }
}
