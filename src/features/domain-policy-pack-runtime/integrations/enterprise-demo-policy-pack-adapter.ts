import type { PolicyPackEvaluationResult } from '../domain/policy-pack-evaluation.js';
import type { PolicyPackDecisionType } from '../domain/policy-pack-decision.js';

export interface PolicyPackDemoScenarioMetadata {
  readonly evaluationId: string;
  readonly decisionId: string;
  readonly policyPackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly decisionType: PolicyPackDecisionType;
  readonly allowed: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly obligationCount: number;
  readonly evidenceRequirementCount: number;
  readonly approvalRequirementCount: number;
  readonly proofId?: string;
  readonly proofHash?: string;
}

export interface PolicyPackProofChainReference {
  readonly proofId: string;
  readonly evaluationId: string;
  readonly decisionId: string;
  readonly proofHash: string;
  readonly previousHash?: string;
}

export interface PolicyPackDemoExportSnippet {
  readonly scenarioNote: string;
  readonly json: string;
}

/**
 * Derives demo-facing scenario metadata directly from a real
 * PolicyPackEvaluationResult. Every field is read off the evaluation the
 * runtime actually produced -- this function never invents a decision type,
 * rule match, or proof reference the runtime did not itself record.
 */
export function buildPolicyPackDemoScenarioMetadata(evaluation: PolicyPackEvaluationResult): PolicyPackDemoScenarioMetadata {
  const { decision, proof } = evaluation;
  return {
    evaluationId: evaluation.id,
    decisionId: decision.id,
    policyPackVersionIds: decision.applicablePackVersionIds,
    matchedRuleIds: decision.matchedRuleIds,
    decisionType: decision.type,
    allowed: decision.allowed,
    reasonCode: decision.reasonCode,
    reason: decision.reason,
    obligationCount: decision.obligations.length,
    evidenceRequirementCount: decision.evidenceRequirements.length,
    approvalRequirementCount: decision.approvalRequirements.length,
    ...(proof !== undefined ? { proofId: proof.id, proofHash: proof.proofHash } : {}),
  };
}

/** Returns undefined when the evaluation produced no proof (should not happen for a completed evaluation, but this adapter never fabricates one). */
export function buildPolicyPackProofChainReference(evaluation: PolicyPackEvaluationResult): PolicyPackProofChainReference | undefined {
  const { proof } = evaluation;
  if (!proof) {
    return undefined;
  }
  return {
    proofId: proof.id,
    evaluationId: proof.evaluationId,
    decisionId: proof.decisionId,
    proofHash: proof.proofHash,
    ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
  };
}

/**
 * Builds a deterministic, embeddable export snippet for an enterprise demo
 * bundle. The JSON payload is exactly the scenario metadata this function
 * already derived from the real evaluation -- nothing added, nothing
 * summarized away.
 */
export function buildPolicyPackDemoExportSnippet(evaluation: PolicyPackEvaluationResult): PolicyPackDemoExportSnippet {
  const metadata = buildPolicyPackDemoScenarioMetadata(evaluation);
  return {
    scenarioNote: `Domain Policy Pack Runtime decision ${metadata.decisionType} (${metadata.reasonCode}) for action on evaluation ${metadata.evaluationId}, backed by proof ${metadata.proofId ?? 'none'}.`,
    json: JSON.stringify(metadata),
  };
}
