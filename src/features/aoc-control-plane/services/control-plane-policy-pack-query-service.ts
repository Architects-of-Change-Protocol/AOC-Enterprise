import type { PolicyPackControlPlaneFilter } from '../domain/policy-pack-control-plane-filter.js';
import type {
  PolicyDecisionRow,
  PolicyEvaluationRow,
  PolicyEventRow,
  PolicyPackControlPlaneViewModel,
  PolicyPackRow,
  PolicyPackVersionRow,
  PolicyProofRow,
  PolicyRuleRow,
} from '../domain/policy-pack-view-model.js';

function byId<T extends { readonly id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function includesSearch(haystack: readonly (string | undefined)[], needle: string): boolean {
  const lowerNeedle = needle.toLowerCase();
  return haystack.some((value) => value !== undefined && value.toLowerCase().includes(lowerNeedle));
}

function buildVersionPackIndex(versions: readonly PolicyPackVersionRow[]): ReadonlyMap<string, string> {
  return new Map(versions.map((version) => [version.id, version.policyPackId]));
}

function versionMatchesPack(versionId: string, packId: string, versionPackIndex: ReadonlyMap<string, string>): boolean {
  return versionPackIndex.get(versionId) === packId;
}

function filterPacks(packs: readonly PolicyPackRow[], filter: PolicyPackControlPlaneFilter): PolicyPackRow[] {
  return byId(packs).filter((pack) => {
    if (filter.packId !== undefined && pack.id !== filter.packId) return false;
    if (filter.domain !== undefined && pack.domain !== filter.domain) return false;
    if (filter.demoOnly !== undefined && pack.demoOnly !== filter.demoOnly) return false;
    if (filter.legalCompleteness !== undefined && pack.legalCompleteness !== filter.legalCompleteness) return false;
    if (filter.search !== undefined && filter.search.length > 0 && !includesSearch([pack.name, pack.id, pack.description], filter.search)) return false;
    return true;
  });
}

function filterVersions(versions: readonly PolicyPackVersionRow[], filter: PolicyPackControlPlaneFilter): PolicyPackVersionRow[] {
  return byId(versions).filter((version) => {
    if (filter.packId !== undefined && version.policyPackId !== filter.packId) return false;
    if (filter.versionId !== undefined && version.id !== filter.versionId) return false;
    if (filter.domain !== undefined && !version.domains.includes(filter.domain)) return false;
    if (filter.jurisdiction !== undefined && !version.jurisdictions.includes(filter.jurisdiction)) return false;
    if (filter.country !== undefined && !version.countries.includes(filter.country)) return false;
    if (filter.demoOnly !== undefined && version.demoOnly !== filter.demoOnly) return false;
    if (filter.legalCompleteness !== undefined && version.legalCompleteness !== filter.legalCompleteness) return false;
    if (filter.search !== undefined && filter.search.length > 0 && !includesSearch([version.policyPackName, version.version], filter.search)) return false;
    return true;
  });
}

function filterRules(rules: readonly PolicyRuleRow[], filter: PolicyPackControlPlaneFilter): PolicyRuleRow[] {
  return byId(rules).filter((rule) => {
    if (filter.packId !== undefined && rule.policyPackId !== filter.packId) return false;
    if (filter.versionId !== undefined && rule.policyPackVersionId !== filter.versionId) return false;
    if (filter.ruleId !== undefined && rule.id !== filter.ruleId) return false;
    if (filter.search !== undefined && filter.search.length > 0 && !includesSearch([rule.name, rule.reasonCode, rule.description], filter.search)) return false;
    return true;
  });
}

function filterEvaluations(evaluations: readonly PolicyEvaluationRow[], filter: PolicyPackControlPlaneFilter, versionPackIndex: ReadonlyMap<string, string>): PolicyEvaluationRow[] {
  return byId(evaluations).filter((evaluation) => {
    if (filter.packId !== undefined && !evaluation.applicablePackVersionIds.some((versionId) => versionMatchesPack(versionId, filter.packId!, versionPackIndex))) return false;
    if (filter.versionId !== undefined && !evaluation.applicablePackVersionIds.includes(filter.versionId)) return false;
    if (filter.ruleId !== undefined && !evaluation.matchedRuleIds.includes(filter.ruleId)) return false;
    if (filter.decisionType !== undefined && evaluation.decisionType !== filter.decisionType) return false;
    if (filter.action !== undefined && evaluation.action !== filter.action) return false;
    if (filter.actorId !== undefined && evaluation.actorId !== filter.actorId) return false;
    if (filter.resourceScope !== undefined && evaluation.resourceScope !== filter.resourceScope) return false;
    if (filter.jurisdiction !== undefined && evaluation.jurisdiction !== filter.jurisdiction) return false;
    if (filter.country !== undefined && evaluation.country !== filter.country) return false;
    if (filter.domain !== undefined && evaluation.domain !== filter.domain) return false;
    if (filter.allowed !== undefined && evaluation.allowed !== filter.allowed) return false;
    if (filter.search !== undefined && filter.search.length > 0 && !includesSearch([evaluation.action, evaluation.resourceScope, evaluation.policyProofHash], filter.search)) return false;
    return true;
  });
}

function filterDecisions(decisions: readonly PolicyDecisionRow[], filter: PolicyPackControlPlaneFilter, versionPackIndex: ReadonlyMap<string, string>): PolicyDecisionRow[] {
  return byId(decisions).filter((decision) => {
    if (filter.packId !== undefined && !decision.applicablePackVersionIds.some((versionId) => versionMatchesPack(versionId, filter.packId!, versionPackIndex))) return false;
    if (filter.versionId !== undefined && !decision.applicablePackVersionIds.includes(filter.versionId)) return false;
    if (filter.ruleId !== undefined && !decision.matchedRuleIds.includes(filter.ruleId)) return false;
    if (filter.decisionType !== undefined && decision.type !== filter.decisionType) return false;
    if (filter.action !== undefined && decision.action !== filter.action) return false;
    if (filter.actorId !== undefined && decision.actorId !== filter.actorId) return false;
    if (filter.resourceScope !== undefined && decision.resourceScope !== filter.resourceScope) return false;
    if (filter.allowed !== undefined && decision.allowed !== filter.allowed) return false;
    if (filter.search !== undefined && filter.search.length > 0 && !includesSearch([decision.reasonCode, decision.reason, decision.action, decision.resourceScope], filter.search)) return false;
    return true;
  });
}

function filterProofs(proofs: readonly PolicyProofRow[], filter: PolicyPackControlPlaneFilter): PolicyProofRow[] {
  return byId(proofs).filter((proof) => {
    if (filter.versionId !== undefined && !proof.policyPackVersionIds.includes(filter.versionId)) return false;
    if (filter.ruleId !== undefined && !proof.matchedRuleIds.includes(filter.ruleId)) return false;
    if (filter.action !== undefined && proof.action !== filter.action) return false;
    if (filter.actorId !== undefined && proof.actorId !== filter.actorId) return false;
    if (filter.resourceScope !== undefined && proof.resourceScope !== filter.resourceScope) return false;
    if (filter.search !== undefined && filter.search.length > 0 && !includesSearch([proof.proofHash, proof.action, proof.resourceScope], filter.search)) return false;
    return true;
  });
}

function filterEvents(events: readonly PolicyEventRow[], filter: PolicyPackControlPlaneFilter): PolicyEventRow[] {
  return byId(events).filter((event) => {
    if (filter.packId !== undefined && event.policyPackId !== filter.packId) return false;
    if (filter.versionId !== undefined && event.policyPackVersionId !== filter.versionId) return false;
    if (filter.search !== undefined && filter.search.length > 0 && !includesSearch([event.eventHash, event.summary, event.type], filter.search)) return false;
    return true;
  });
}

/**
 * Filters every collection in a PolicyPackControlPlaneViewModel by the same
 * PolicyPackControlPlaneFilter, independently per collection (a pack-name
 * search matches packs; the same search also matches evaluations/decisions/
 * proofs/events through their own searchable fields). Applies no policy
 * evaluation -- every predicate is a plain field comparison over rows the
 * read-model service already produced. `enforcementLinks` and `metrics` pass
 * through unfiltered since they summarize the whole view model, not a
 * filtered slice of it.
 */
export function queryPolicyPackViewModel(viewModel: PolicyPackControlPlaneViewModel, filter: PolicyPackControlPlaneFilter): PolicyPackControlPlaneViewModel {
  const versionPackIndex = buildVersionPackIndex(viewModel.versions);
  return {
    packs: filterPacks(viewModel.packs, filter),
    versions: filterVersions(viewModel.versions, filter),
    rules: filterRules(viewModel.rules, filter),
    evaluations: filterEvaluations(viewModel.evaluations, filter, versionPackIndex),
    decisions: filterDecisions(viewModel.decisions, filter, versionPackIndex),
    proofs: filterProofs(viewModel.proofs, filter),
    events: filterEvents(viewModel.events, filter),
    enforcementLinks: viewModel.enforcementLinks,
    metrics: viewModel.metrics,
  };
}
