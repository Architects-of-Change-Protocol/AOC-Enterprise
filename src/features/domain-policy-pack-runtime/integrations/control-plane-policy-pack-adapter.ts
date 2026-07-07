import type { PolicyPack } from '../domain/policy-pack.js';
import type { PolicyPackVersion } from '../domain/policy-pack-version.js';
import type { PolicyPackRule } from '../domain/policy-pack-rule.js';
import type { PolicyPackEvaluationResult } from '../domain/policy-pack-evaluation.js';
import type { PolicyPackDecision } from '../domain/policy-pack-decision.js';
import type { PolicyPackProof } from '../domain/policy-pack-proof.js';
import type { PolicyPackEvent } from '../domain/policy-pack-event.js';
import type { PolicyPackRuntime } from '../services/policy-pack-runtime.js';

export interface PolicyPackRow {
  readonly id: string;
  readonly name: string;
  readonly kind: PolicyPack['kind'];
  readonly domain: PolicyPack['domain'];
  readonly status: PolicyPack['status'];
  readonly currentVersionId: string;
  readonly versionCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PolicyPackVersionRow {
  readonly id: string;
  readonly policyPackId: string;
  readonly version: string;
  readonly status: PolicyPackVersion['status'];
  readonly ruleCount: number;
  readonly demoOnly: boolean;
  readonly legalCompleteness: PolicyPackVersion['legalCompleteness'];
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PolicyRuleRow {
  readonly id: string;
  readonly policyPackVersionId: string;
  readonly name: string;
  readonly status: PolicyPackRule['status'];
  readonly severity: PolicyPackRule['severity'];
  readonly effectType: PolicyPackRule['effect']['type'];
  readonly priority: number;
}

export interface PolicyEvaluationRow {
  readonly id: string;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly decisionId: string;
  readonly proofId?: string;
  readonly ruleResultCount: number;
  readonly matchedRuleCount: number;
}

export interface PolicyDecisionRow {
  readonly id: string;
  readonly inputId: string;
  readonly type: PolicyPackDecision['type'];
  readonly allowed: boolean;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly riskLevel: PolicyPackDecision['riskLevel'];
  readonly effectiveRiskLevel: PolicyPackDecision['effectiveRiskLevel'];
  readonly applicablePackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly reasonCode: string;
  readonly reason: string;
  readonly decidedAt: string;
  readonly proofId?: string;
}

export interface PolicyProofRow {
  readonly id: string;
  readonly evaluationId: string;
  readonly decisionId: string;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly policyPackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly proofHash: string;
  readonly previousHash?: string;
  readonly createdAt: string;
}

export interface PolicyEventRow {
  readonly id: string;
  readonly type: PolicyPackEvent['type'];
  readonly policyPackId?: string;
  readonly policyPackVersionId?: string;
  readonly evaluationId?: string;
  readonly decisionId?: string;
  readonly proofId?: string;
  readonly trustDomainId?: string;
  readonly actorId?: string;
  readonly timestamp: string;
  readonly eventHash: string;
  readonly previousHash?: string;
}

export interface PolicyPackControlPlaneViewModel {
  readonly policyPacks: readonly PolicyPackRow[];
  readonly policyPackVersions: readonly PolicyPackVersionRow[];
  readonly policyRules: readonly PolicyRuleRow[];
  readonly policyEvaluations: readonly PolicyEvaluationRow[];
  readonly policyDecisions: readonly PolicyDecisionRow[];
  readonly policyProofs: readonly PolicyProofRow[];
  readonly policyEvents: readonly PolicyEventRow[];
}

export function toPolicyPackRow(pack: PolicyPack): PolicyPackRow {
  return {
    id: pack.id,
    name: pack.name,
    kind: pack.kind,
    domain: pack.domain,
    status: pack.status,
    currentVersionId: pack.currentVersionId,
    versionCount: pack.versions.length,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
  };
}

export function toPolicyPackVersionRow(version: PolicyPackVersion): PolicyPackVersionRow {
  return {
    id: version.id,
    policyPackId: version.policyPackId,
    version: version.version,
    status: version.status,
    ruleCount: version.rules.length,
    demoOnly: version.demoOnly,
    legalCompleteness: version.legalCompleteness,
    effectiveFrom: version.effectiveFrom,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    ...(version.effectiveUntil !== undefined ? { effectiveUntil: version.effectiveUntil } : {}),
  };
}

export function toPolicyRuleRow(rule: PolicyPackRule): PolicyRuleRow {
  return {
    id: rule.id,
    policyPackVersionId: rule.policyPackVersionId,
    name: rule.name,
    status: rule.status,
    severity: rule.severity,
    effectType: rule.effect.type,
    priority: rule.priority,
  };
}

export function toPolicyEvaluationRow(evaluation: PolicyPackEvaluationResult): PolicyEvaluationRow {
  return {
    id: evaluation.id,
    trustDomainId: evaluation.input.trustDomainId,
    actorId: evaluation.input.actorId,
    action: evaluation.input.action,
    resourceScope: evaluation.input.resourceScope,
    decisionId: evaluation.decision.id,
    ruleResultCount: evaluation.ruleResults.length,
    matchedRuleCount: evaluation.ruleResults.filter((result) => result.matched).length,
    ...(evaluation.proof !== undefined ? { proofId: evaluation.proof.id } : {}),
  };
}

export function toPolicyDecisionRow(decision: PolicyPackDecision): PolicyDecisionRow {
  return {
    id: decision.id,
    inputId: decision.inputId,
    type: decision.type,
    allowed: decision.allowed,
    trustDomainId: decision.trustDomainId,
    actorId: decision.actorId,
    action: decision.action,
    resourceScope: decision.resourceScope,
    riskLevel: decision.riskLevel,
    effectiveRiskLevel: decision.effectiveRiskLevel,
    applicablePackVersionIds: decision.applicablePackVersionIds,
    matchedRuleIds: decision.matchedRuleIds,
    reasonCode: decision.reasonCode,
    reason: decision.reason,
    decidedAt: decision.decidedAt,
    ...(decision.proofId !== undefined ? { proofId: decision.proofId } : {}),
  };
}

export function toPolicyProofRow(proof: PolicyPackProof): PolicyProofRow {
  return {
    id: proof.id,
    evaluationId: proof.evaluationId,
    decisionId: proof.decisionId,
    trustDomainId: proof.trustDomainId,
    actorId: proof.actorId,
    action: proof.action,
    resourceScope: proof.resourceScope,
    policyPackVersionIds: proof.policyPackVersionIds,
    matchedRuleIds: proof.matchedRuleIds,
    proofHash: proof.proofHash,
    createdAt: proof.createdAt,
    ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
  };
}

export function toPolicyEventRow(event: PolicyPackEvent): PolicyEventRow {
  return {
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    eventHash: event.eventHash,
    ...(event.policyPackId !== undefined ? { policyPackId: event.policyPackId } : {}),
    ...(event.policyPackVersionId !== undefined ? { policyPackVersionId: event.policyPackVersionId } : {}),
    ...(event.evaluationId !== undefined ? { evaluationId: event.evaluationId } : {}),
    ...(event.decisionId !== undefined ? { decisionId: event.decisionId } : {}),
    ...(event.proofId !== undefined ? { proofId: event.proofId } : {}),
    ...(event.trustDomainId !== undefined ? { trustDomainId: event.trustDomainId } : {}),
    ...(event.actorId !== undefined ? { actorId: event.actorId } : {}),
    ...(event.previousHash !== undefined ? { previousHash: event.previousHash } : {}),
  };
}

/**
 * Builds a read-model-only snapshot of a PolicyPackRuntime for Control
 * Plane display. This function only maps already-recorded runtime state --
 * it never evaluates policy, never mutates the runtime, and never
 * synthesizes a decision/proof/event that the runtime did not itself
 * produce.
 */
export function buildPolicyPackControlPlaneViewModel(runtime: PolicyPackRuntime): PolicyPackControlPlaneViewModel {
  const packs = runtime.store.listPacks();
  const versions = runtime.store.listVersions();
  const rules = versions.flatMap((version) => version.rules);
  const evaluations = runtime.store.listEvaluations();
  const decisions = runtime.store.listDecisions();
  const proofs = evaluations.map((evaluation) => evaluation.proof).filter((proof): proof is NonNullable<typeof proof> => proof !== undefined);
  const events = runtime.ledger.getEvents();

  return {
    policyPacks: packs.map(toPolicyPackRow),
    policyPackVersions: versions.map(toPolicyPackVersionRow),
    policyRules: rules.map(toPolicyRuleRow),
    policyEvaluations: evaluations.map(toPolicyEvaluationRow),
    policyDecisions: decisions.map(toPolicyDecisionRow),
    policyProofs: proofs.map(toPolicyProofRow),
    policyEvents: events.map(toPolicyEventRow),
  };
}
