import { createDigest } from '../domain/policy-pack-proof.js';
import type { PolicyPackProof } from '../domain/policy-pack-proof.js';
import type { PolicyEvaluationInput, PolicyRuleEvaluationResult } from '../domain/policy-pack-evaluation.js';
import type { PolicyPackDecision } from '../domain/policy-pack-decision.js';
import type { PolicyPackRuntimeContext } from '../runtime/policy-pack-runtime-context.js';
import type { PolicyPackStore } from './policy-pack-store.js';

export interface CreatePolicyPackProofInput {
  readonly evaluationId: string;
  readonly input: PolicyEvaluationInput;
  readonly ruleResults: readonly PolicyRuleEvaluationResult[];
  readonly decision: PolicyPackDecision;
  readonly policyPackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
}

/**
 * Creates deterministic, hash-chained PolicyPackProofs. inputHash,
 * ruleResultsHash and decisionHash are each pure functions of their own
 * slice of the evaluation so a caller (or an auditor) can tell exactly
 * which part of the evaluation changed between two proofs; proofHash
 * chains all three together with the previous proof, mirroring
 * EnforcementProofService/ApprovalProofService.
 */
export class PolicyPackProofService {
  constructor(
    private readonly ctx: PolicyPackRuntimeContext,
    private readonly store: PolicyPackStore,
  ) {}

  createProof(input: CreatePolicyPackProofInput): PolicyPackProof {
    const inputHash = createDigest(input.input);
    const ruleResultsHash = createDigest(input.ruleResults);
    const decisionHash = createDigest(input.decision);
    const previousHash = this.store.getLatestProof()?.proofHash;

    const proofHash = createDigest({
      inputHash,
      ruleResultsHash,
      decisionHash,
      policyPackVersionIds: input.policyPackVersionIds,
      matchedRuleIds: input.matchedRuleIds,
      previousHash,
    });

    const proof: PolicyPackProof = {
      id: this.ctx.ids.nextId('policy-pack-proof'),
      evaluationId: input.evaluationId,
      decisionId: input.decision.id,
      trustDomainId: input.input.trustDomainId,
      actorId: input.input.actorId,
      action: input.input.action,
      resourceScope: input.input.resourceScope,
      policyPackVersionIds: input.policyPackVersionIds,
      matchedRuleIds: input.matchedRuleIds,
      inputHash,
      ruleResultsHash,
      decisionHash,
      proofHash,
      createdAt: this.ctx.clock.now(),
      ...(input.input.capability !== undefined ? { capability: input.input.capability } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };

    return this.store.saveProof(proof);
  }

  getProofByDecisionId(decisionId: string): PolicyPackProof | undefined {
    return this.store.getProofByDecision(decisionId);
  }

  getProofByEvaluationId(evaluationId: string): PolicyPackProof | undefined {
    return this.store.getProofByEvaluation(evaluationId);
  }

  /** Deterministically re-derives the proofHash from the proof's own recorded fields and compares it. */
  verifyProof(proof: PolicyPackProof): boolean {
    const recomputedHash = createDigest({
      inputHash: proof.inputHash,
      ruleResultsHash: proof.ruleResultsHash,
      decisionHash: proof.decisionHash,
      policyPackVersionIds: proof.policyPackVersionIds,
      matchedRuleIds: proof.matchedRuleIds,
      previousHash: proof.previousHash,
    });
    return recomputedHash === proof.proofHash;
  }
}
