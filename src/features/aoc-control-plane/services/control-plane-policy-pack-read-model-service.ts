import type { PolicyPackRuntime } from '../../domain-policy-pack-runtime/services/policy-pack-runtime.js';
import { buildPolicyPackControlPlaneViewModel as buildDomainPolicyPackViewModel } from '../../domain-policy-pack-runtime/integrations/control-plane-policy-pack-adapter.js';
import type { EnforcementDecisionRow, EnforcementProofRow, EnforcementRequestRow } from '../domain/control-plane-view-model.js';
import type { PolicyDecisionRow, PolicyEnforcementLinkRow, PolicyPackControlPlaneViewModel } from '../domain/policy-pack-view-model.js';
import { EMPTY_POLICY_PACK_VIEW_MODEL } from '../domain/policy-pack-view-model.js';
import { computePolicyPackMetrics } from './control-plane-policy-pack-metrics-service.js';

export interface BuildPolicyPackViewModelInput {
  /** Absent when no Domain Policy Pack Runtime is wired into this Control Plane deployment -- every pack/version/rule/evaluation/decision/proof/event array is then empty, never fabricated. */
  readonly policyPackRuntime?: PolicyPackRuntime;
  readonly enforcementRequests: readonly EnforcementRequestRow[];
  readonly enforcementDecisions: readonly EnforcementDecisionRow[];
  readonly enforcementProofs: readonly EnforcementProofRow[];
}

/**
 * An EnforcementDecision carries policy references only when Action
 * Enforcement's preflight actually consulted a policy pack integration --
 * see EnforcementDecision.policyDecisionId in
 * action-enforcement/domain/enforcement-decision.ts. A decision only counts
 * as *blocked by policy* when the enforcement decision's own reasonCode is
 * exactly the policy decision's reasonCode -- i.e. the policy pack outcome
 * is what stopped execution, not some other Soberanía layer (recognition,
 * authority, approval, evidence, external standing, adapter, idempotency)
 * that happened to run after a policy pack warning/allow.
 */
function isBlockedByPolicy(decision: EnforcementDecisionRow): boolean {
  return !decision.allowedToExecute && decision.policyReasonCode !== undefined && decision.reasonCode === decision.policyReasonCode;
}

function comparePolicyEnforcementLinks(a: PolicyEnforcementLinkRow, b: PolicyEnforcementLinkRow): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Builds PolicyEnforcementLinkRows strictly from fields Action Enforcement's
 * own EnforcementDecision/EnforcementProof rows already carry. Never
 * re-evaluates policy, never infers a link that neither runtime recorded.
 */
export function buildPolicyEnforcementLinks(
  enforcementRequests: readonly EnforcementRequestRow[],
  enforcementDecisions: readonly EnforcementDecisionRow[],
  enforcementProofs: readonly EnforcementProofRow[],
  policyDecisionsById: ReadonlyMap<string, PolicyDecisionRow> = new Map(),
): PolicyEnforcementLinkRow[] {
  const requestById = new Map(enforcementRequests.map((request) => [request.id, request]));
  const proofByDecisionId = new Map(enforcementProofs.map((proof) => [proof.enforcementDecisionId, proof]));

  const links: PolicyEnforcementLinkRow[] = [];
  for (const decision of enforcementDecisions) {
    if (decision.policyDecisionId === undefined && decision.policyProofId === undefined) continue;

    const request = requestById.get(decision.enforcementRequestId);
    const proof = proofByDecisionId.get(decision.id);
    const policyDecision = decision.policyDecisionId !== undefined ? policyDecisionsById.get(decision.policyDecisionId) : undefined;

    links.push({
      id: `policy-enforcement-link-${decision.id}`,
      enforcementRequestId: decision.enforcementRequestId,
      enforcementDecisionId: decision.id,
      policyPackVersionIds: decision.policyPackVersionIds ?? [],
      matchedRuleIds: decision.policyMatchedRuleIds ?? [],
      action: request?.action ?? '',
      actorId: request?.actorId ?? '',
      resourceScope: request?.resourceScope ?? '',
      enforcementDecisionType: decision.type,
      blockedByPolicy: isBlockedByPolicy(decision),
      ...(proof !== undefined ? { enforcementProofId: proof.id } : {}),
      ...(decision.policyDecisionId !== undefined ? { policyDecisionId: decision.policyDecisionId } : {}),
      ...(decision.policyProofId !== undefined ? { policyProofId: decision.policyProofId } : {}),
      ...(policyDecision !== undefined ? { policyDecisionType: policyDecision.type } : {}),
      ...(decision.policyReasonCode !== undefined ? { reasonCode: decision.policyReasonCode } : {}),
      ...(decision.policyReason !== undefined ? { reason: decision.policyReason } : {}),
    });
  }
  return links.sort(comparePolicyEnforcementLinks);
}

/**
 * Assembles the PolicyPackControlPlaneViewModel from Domain Policy Pack
 * Runtime's own control-plane adapter (never re-implemented here) plus
 * Action Enforcement's read-model rows. Every pack/version/rule/evaluation/
 * decision/proof/event row is a direct passthrough of what the adapter
 * already computed from the runtime's store/ledger -- this function performs
 * no policy evaluation and infers no legal-compliance conclusion.
 */
export function buildPolicyPackViewModel(input: BuildPolicyPackViewModelInput): PolicyPackControlPlaneViewModel {
  if (input.policyPackRuntime === undefined) {
    const enforcementLinks = buildPolicyEnforcementLinks(input.enforcementRequests, input.enforcementDecisions, input.enforcementProofs);
    const base = { ...EMPTY_POLICY_PACK_VIEW_MODEL, enforcementLinks };
    return { ...base, metrics: computePolicyPackMetrics(base) };
  }

  const adapterViewModel = buildDomainPolicyPackViewModel(input.policyPackRuntime);
  const policyDecisionsById = new Map(adapterViewModel.policyDecisions.map((decision) => [decision.id, decision]));
  const enforcementLinks = buildPolicyEnforcementLinks(input.enforcementRequests, input.enforcementDecisions, input.enforcementProofs, policyDecisionsById);

  const base = {
    packs: adapterViewModel.policyPacks,
    versions: adapterViewModel.policyPackVersions,
    rules: adapterViewModel.policyRules,
    evaluations: adapterViewModel.policyEvaluations,
    decisions: adapterViewModel.policyDecisions,
    proofs: adapterViewModel.policyProofs,
    events: adapterViewModel.policyEvents,
    enforcementLinks,
  };
  return { ...base, metrics: computePolicyPackMetrics(base) };
}
