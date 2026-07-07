import type { PolicyPack } from '../domain/policy-pack.js';
import type { PolicyPackVersion } from '../domain/policy-pack-version.js';
import type { PolicyPackRule } from '../domain/policy-pack-rule.js';
import type { PolicyPackScope } from '../domain/policy-pack-scope.js';
import type { PolicyPackEvaluationResult } from '../domain/policy-pack-evaluation.js';
import type { PolicyPackDecision } from '../domain/policy-pack-decision.js';
import type { PolicyPackProof } from '../domain/policy-pack-proof.js';
import type { PolicyPackEvent } from '../domain/policy-pack-event.js';
import type { PolicyObligation } from '../domain/policy-pack-obligation.js';
import type { PolicyEvidenceRequirement } from '../domain/policy-pack-evidence.js';
import type { PolicyApprovalRequirement } from '../domain/policy-pack-approval.js';
import type { PolicyPackRuntime } from '../services/policy-pack-runtime.js';

export interface PolicyPackRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: PolicyPack['kind'];
  readonly domain: PolicyPack['domain'];
  readonly status: PolicyPack['status'];
  readonly currentVersionId: string;
  readonly versionCount: number;
  /** Number of this pack's versions currently in `active` status -- not necessarily 1, since multiple versions can be active across different scopes. */
  readonly activeVersionCount: number;
  /** Demo-only / legal-completeness metadata copied from the pack's current version, since a PolicyPack itself carries no legal-completeness metadata of its own. Falls back to the conservative `true`/`not_legal_advice` when the current version cannot be resolved, so the UI never silently under-reports a demo pack as production-ready. */
  readonly demoOnly: boolean;
  readonly legalCompleteness: PolicyPackVersion['legalCompleteness'];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PolicyPackVersionRow {
  readonly id: string;
  readonly policyPackId: string;
  readonly policyPackName: string;
  readonly version: string;
  readonly status: PolicyPackVersion['status'];
  readonly ruleCount: number;
  readonly sourceCount: number;
  readonly demoOnly: boolean;
  readonly legalCompleteness: PolicyPackVersion['legalCompleteness'];
  readonly scopeSummary: string;
  readonly jurisdictions: readonly string[];
  readonly countries: readonly string[];
  readonly domains: readonly string[];
  readonly actions: readonly string[];
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PolicyRuleRow {
  readonly id: string;
  readonly policyPackId: string;
  readonly policyPackVersionId: string;
  readonly policyPackName: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly status: PolicyPackRule['status'];
  readonly severity: PolicyPackRule['severity'];
  readonly effectType: PolicyPackRule['effect']['type'];
  readonly reasonCode: string;
  readonly priority: number;
  readonly sourceIds: readonly string[];
  readonly obligationCount: number;
  readonly evidenceRequirementCount: number;
  readonly approvalRequirementCount: number;
}

export interface PolicyObligationRow {
  readonly id: string;
  readonly type: PolicyObligation['type'];
  readonly description: string;
  readonly required: boolean;
  readonly sourceRuleId?: string;
}

export interface PolicyEvidenceRequirementRow {
  readonly id: string;
  readonly type: PolicyEvidenceRequirement['type'];
  readonly description: string;
  readonly required: boolean;
  readonly sourceRuleId?: string;
}

export interface PolicyApprovalRequirementRow {
  readonly id: string;
  readonly type: PolicyApprovalRequirement['type'];
  readonly description: string;
  readonly required: boolean;
  readonly minimumApprovals: number;
  readonly requiresSegregationOfDuties: boolean;
  readonly requiredAuthorityCapability?: string;
  readonly sourceRuleId?: string;
}

export interface PolicyEvaluationRow {
  readonly id: string;
  readonly inputId: string;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly domain?: string;
  readonly jurisdiction?: string;
  readonly country?: string;
  readonly riskLevel: PolicyPackDecision['riskLevel'];
  readonly effectiveRiskLevel: PolicyPackDecision['effectiveRiskLevel'];
  readonly decisionId: string;
  readonly decisionType: PolicyPackDecision['type'];
  readonly allowed: boolean;
  readonly applicablePackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly ruleResultCount: number;
  readonly matchedRuleCount: number;
  readonly proofId?: string;
  readonly policyProofHash?: string;
  readonly evaluatedAt: string;
}

export interface PolicyDecisionRow {
  readonly id: string;
  readonly inputId: string;
  readonly type: PolicyPackDecision['type'];
  readonly allowed: boolean;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly riskLevel: PolicyPackDecision['riskLevel'];
  readonly effectiveRiskLevel: PolicyPackDecision['effectiveRiskLevel'];
  readonly applicablePackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly obligationIds: readonly string[];
  readonly evidenceRequirementIds: readonly string[];
  readonly approvalRequirementIds: readonly string[];
  readonly obligations: readonly PolicyObligationRow[];
  readonly evidenceRequirements: readonly PolicyEvidenceRequirementRow[];
  readonly approvalRequirements: readonly PolicyApprovalRequirementRow[];
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
  readonly capability?: string;
  readonly resourceScope: string;
  readonly policyPackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly inputHash: string;
  readonly ruleResultsHash: string;
  readonly decisionHash: string;
  readonly proofHash: string;
  readonly previousHash?: string;
  readonly createdAt: string;
}

export interface PolicyEventRow {
  readonly id: string;
  readonly type: PolicyPackEvent['type'];
  readonly summary: string;
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

function titleCase(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function summarizeScope(scope: PolicyPackScope): string {
  const parts: string[] = [];
  if (scope.domains !== undefined && scope.domains.length > 0) parts.push(`domains: ${scope.domains.join(', ')}`);
  if (scope.jurisdictions !== undefined && scope.jurisdictions.length > 0) parts.push(`jurisdictions: ${scope.jurisdictions.join(', ')}`);
  if (scope.countries !== undefined && scope.countries.length > 0) parts.push(`countries: ${scope.countries.join(', ')}`);
  if (scope.actions !== undefined && scope.actions.length > 0) parts.push(`actions: ${scope.actions.join(', ')}`);
  if (scope.industries !== undefined && scope.industries.length > 0) parts.push(`industries: ${scope.industries.join(', ')}`);
  if (scope.customerIds !== undefined && scope.customerIds.length > 0) parts.push(`customers: ${scope.customerIds.join(', ')}`);
  return parts.length > 0 ? parts.join(' | ') : 'unscoped';
}

export function toPolicyPackRow(pack: PolicyPack): PolicyPackRow {
  const currentVersion = pack.versions.find((version) => version.id === pack.currentVersionId);
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    kind: pack.kind,
    domain: pack.domain,
    status: pack.status,
    currentVersionId: pack.currentVersionId,
    versionCount: pack.versions.length,
    activeVersionCount: pack.versions.filter((version) => version.status === 'active').length,
    demoOnly: currentVersion?.demoOnly ?? true,
    legalCompleteness: currentVersion?.legalCompleteness ?? 'not_legal_advice',
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
  };
}

export function toPolicyPackVersionRow(version: PolicyPackVersion, policyPackName: string): PolicyPackVersionRow {
  return {
    id: version.id,
    policyPackId: version.policyPackId,
    policyPackName,
    version: version.version,
    status: version.status,
    ruleCount: version.rules.length,
    sourceCount: version.sources.length,
    demoOnly: version.demoOnly,
    legalCompleteness: version.legalCompleteness,
    scopeSummary: summarizeScope(version.scope),
    jurisdictions: version.scope.jurisdictions ?? [],
    countries: version.scope.countries ?? [],
    domains: version.scope.domains ?? [],
    actions: version.scope.actions ?? [],
    effectiveFrom: version.effectiveFrom,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    ...(version.effectiveUntil !== undefined ? { effectiveUntil: version.effectiveUntil } : {}),
  };
}

export function toPolicyRuleRow(rule: PolicyPackRule, policyPackId: string, policyPackName: string, version: string): PolicyRuleRow {
  return {
    id: rule.id,
    policyPackId,
    policyPackVersionId: rule.policyPackVersionId,
    policyPackName,
    version,
    name: rule.name,
    description: rule.description,
    status: rule.status,
    severity: rule.severity,
    effectType: rule.effect.type,
    reasonCode: rule.effect.reasonCode,
    priority: rule.priority,
    sourceIds: rule.sourceIds,
    obligationCount: rule.obligations.length,
    evidenceRequirementCount: rule.evidenceRequirements.length,
    approvalRequirementCount: rule.approvalRequirements.length,
  };
}

export function toPolicyObligationRow(obligation: PolicyObligation): PolicyObligationRow {
  return {
    id: obligation.id,
    type: obligation.type,
    description: obligation.description,
    required: obligation.required,
  };
}

export function toPolicyEvidenceRequirementRow(requirement: PolicyEvidenceRequirement): PolicyEvidenceRequirementRow {
  return {
    id: requirement.id,
    type: requirement.type,
    description: requirement.description,
    required: requirement.required,
    ...(requirement.sourceRuleId !== undefined ? { sourceRuleId: requirement.sourceRuleId } : {}),
  };
}

export function toPolicyApprovalRequirementRow(requirement: PolicyApprovalRequirement): PolicyApprovalRequirementRow {
  return {
    id: requirement.id,
    type: requirement.type,
    description: requirement.description,
    required: requirement.required,
    minimumApprovals: requirement.minimumApprovals,
    requiresSegregationOfDuties: requirement.requiresSegregationOfDuties,
    ...(requirement.requiredAuthorityCapability !== undefined ? { requiredAuthorityCapability: requirement.requiredAuthorityCapability } : {}),
    ...(requirement.sourceRuleId !== undefined ? { sourceRuleId: requirement.sourceRuleId } : {}),
  };
}

export function toPolicyEvaluationRow(evaluation: PolicyPackEvaluationResult): PolicyEvaluationRow {
  return {
    id: evaluation.id,
    inputId: evaluation.input.id,
    trustDomainId: evaluation.input.trustDomainId,
    actorId: evaluation.input.actorId,
    action: evaluation.input.action,
    resourceScope: evaluation.input.resourceScope,
    riskLevel: evaluation.decision.riskLevel,
    effectiveRiskLevel: evaluation.decision.effectiveRiskLevel,
    decisionId: evaluation.decision.id,
    decisionType: evaluation.decision.type,
    allowed: evaluation.decision.allowed,
    applicablePackVersionIds: evaluation.decision.applicablePackVersionIds,
    matchedRuleIds: evaluation.decision.matchedRuleIds,
    ruleResultCount: evaluation.ruleResults.length,
    matchedRuleCount: evaluation.ruleResults.filter((result) => result.matched).length,
    evaluatedAt: evaluation.decision.decidedAt,
    ...(evaluation.input.capability !== undefined ? { capability: evaluation.input.capability } : {}),
    ...(evaluation.input.domain !== undefined ? { domain: evaluation.input.domain } : {}),
    ...(evaluation.input.jurisdiction !== undefined ? { jurisdiction: evaluation.input.jurisdiction } : {}),
    ...(evaluation.input.country !== undefined ? { country: evaluation.input.country } : {}),
    ...(evaluation.proof !== undefined ? { proofId: evaluation.proof.id, policyProofHash: evaluation.proof.proofHash } : {}),
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
    obligationIds: decision.obligations.map((obligation) => obligation.id),
    evidenceRequirementIds: decision.evidenceRequirements.map((requirement) => requirement.id),
    approvalRequirementIds: decision.approvalRequirements.map((requirement) => requirement.id),
    obligations: decision.obligations.map(toPolicyObligationRow),
    evidenceRequirements: decision.evidenceRequirements.map(toPolicyEvidenceRequirementRow),
    approvalRequirements: decision.approvalRequirements.map(toPolicyApprovalRequirementRow),
    reasonCode: decision.reasonCode,
    reason: decision.reason,
    decidedAt: decision.decidedAt,
    ...(decision.capability !== undefined ? { capability: decision.capability } : {}),
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
    inputHash: proof.inputHash,
    ruleResultsHash: proof.ruleResultsHash,
    decisionHash: proof.decisionHash,
    proofHash: proof.proofHash,
    createdAt: proof.createdAt,
    ...(proof.capability !== undefined ? { capability: proof.capability } : {}),
    ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
  };
}

export function toPolicyEventRow(event: PolicyPackEvent): PolicyEventRow {
  const contextParts: string[] = [];
  if (event.policyPackId !== undefined) contextParts.push(`pack ${event.policyPackId}`);
  if (event.policyPackVersionId !== undefined) contextParts.push(`version ${event.policyPackVersionId}`);
  if (event.decisionId !== undefined) contextParts.push(`decision ${event.decisionId}`);
  if (event.proofId !== undefined) contextParts.push(`proof ${event.proofId}`);
  const summary = contextParts.length > 0 ? `${titleCase(event.type)} (${contextParts.join(', ')})` : titleCase(event.type);

  return {
    id: event.id,
    type: event.type,
    summary,
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
  const packNameById = new Map(packs.map((pack) => [pack.id, pack.name]));
  const versions = runtime.store.listVersions();
  const rules = versions.flatMap((version) =>
    version.rules.map((rule) => toPolicyRuleRow(rule, version.policyPackId, packNameById.get(version.policyPackId) ?? version.policyPackId, version.version)),
  );
  const evaluations = runtime.store.listEvaluations();
  const decisions = runtime.store.listDecisions();
  const proofs = evaluations.map((evaluation) => evaluation.proof).filter((proof): proof is NonNullable<typeof proof> => proof !== undefined);
  const events = runtime.ledger.getEvents();

  return {
    policyPacks: packs.map(toPolicyPackRow),
    policyPackVersions: versions.map((version) => toPolicyPackVersionRow(version, packNameById.get(version.policyPackId) ?? version.policyPackId)),
    policyRules: rules,
    policyEvaluations: evaluations.map(toPolicyEvaluationRow),
    policyDecisions: decisions.map(toPolicyDecisionRow),
    policyProofs: proofs.map(toPolicyProofRow),
    policyEvents: events.map(toPolicyEventRow),
  };
}
