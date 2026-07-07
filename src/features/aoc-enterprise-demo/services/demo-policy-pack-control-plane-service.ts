import { buildPolicyPackViewModel } from '../../aoc-control-plane/services/control-plane-policy-pack-read-model-service.js';
import { toEnforcementDecisionRow, toEnforcementProofRow, toEnforcementRequestRow } from '../../aoc-control-plane/services/control-plane-read-model-service.js';
import type { DemoPolicyPackControlPlaneSnapshot, DemoPolicyPackWalkthroughAnchor } from '../domain/demo-policy-pack.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { EnterpriseDemoWorld } from '../fixtures/enterprise-demo-world.fixture.js';
import type { ScenarioExecutionResult } from '../scenarios/scenario-runtime-types.js';

/**
 * Builds a policy-pack-focused Control Plane snapshot for a scenario run.
 * Every row it surfaces is a direct pass-through of `aoc-control-plane`'s
 * own `buildPolicyPackViewModel` (fed with the real `PolicyPackRuntime` this
 * scenario's world used, plus the real `EnforcementRequest`/
 * `EnforcementDecision`/`EnforcementProof` objects the scenario's own
 * `ScenarioExecutionResult` produced) -- this service never evaluates a
 * policy condition, never maps an `EnforcementDecision` onto a Control Plane
 * row itself, and never fabricates a pack, rule, decision or proof.
 */
export class DemoPolicyPackControlPlaneService {
  buildSnapshot(scenario: DemoScenario, world: EnterpriseDemoWorld, result: ScenarioExecutionResult, now: () => string): DemoPolicyPackControlPlaneSnapshot {
    const requests = result.enforcementOutcomes.map((outcome) => toEnforcementRequestRow(outcome.request));
    const decisions = result.enforcementOutcomes.map((outcome) => toEnforcementDecisionRow(outcome.decision));
    const proofs = result.enforcementOutcomes
      .map((outcome) => outcome.proof)
      .filter((proof): proof is NonNullable<typeof proof> => proof !== undefined)
      .map(toEnforcementProofRow);

    const viewModel = buildPolicyPackViewModel({
      policyPackRuntime: world.fixture.policyPackRuntime,
      enforcementRequests: requests,
      enforcementDecisions: decisions,
      enforcementProofs: proofs,
    });

    const finalOutcome = result.enforcementOutcomes[result.enforcementOutcomes.length - 1];
    const highlightedDecisionId = finalOutcome?.decision.policyDecisionId;
    const highlightedProofId = finalOutcome?.decision.policyProofId;
    const highlightedRuleIds = finalOutcome?.decision.policyMatchedRuleIds ?? [];
    const highlightedVersionIds = finalOutcome?.decision.policyPackVersionIds ?? [];
    const highlightedPackIds = [...new Set(viewModel.rules.filter((rule) => highlightedRuleIds.includes(rule.id)).map((rule) => rule.policyPackId))];
    const link = viewModel.enforcementLinks.find((candidate) => candidate.enforcementDecisionId === finalOutcome?.decision.id);
    const highlightedEnforcementLinkId = link?.id;

    const highlightedPack = viewModel.packs.find((pack) => highlightedPackIds.includes(pack.id));
    const demoOnly = highlightedPack?.demoOnly ?? true;
    const legalCompleteness = highlightedPack?.legalCompleteness ?? 'not_legal_advice';

    const policyProofChainComplete = highlightedDecisionId !== undefined && highlightedProofId !== undefined && highlightedEnforcementLinkId !== undefined;

    return {
      id: `policy-pack-control-plane-snapshot-${scenario.id}`,
      scenarioId: scenario.id,
      generatedAt: now(),
      highlightedPackIds,
      highlightedVersionIds,
      highlightedRuleIds,
      ...(highlightedDecisionId !== undefined ? { highlightedDecisionId } : {}),
      ...(highlightedProofId !== undefined ? { highlightedProofId } : {}),
      ...(highlightedEnforcementLinkId !== undefined ? { highlightedEnforcementLinkId } : {}),
      policyProofChainComplete,
      demoOnly,
      legalCompleteness,
      walkthroughAnchors: this.buildWalkthroughAnchors(scenario, highlightedPackIds, highlightedDecisionId, highlightedProofId, highlightedEnforcementLinkId),
      viewModel,
    };
  }

  private buildWalkthroughAnchors(
    scenario: DemoScenario,
    highlightedPackIds: readonly string[],
    highlightedDecisionId: string | undefined,
    highlightedProofId: string | undefined,
    highlightedEnforcementLinkId: string | undefined,
  ): readonly DemoPolicyPackWalkthroughAnchor[] {
    const anchors: DemoPolicyPackWalkthroughAnchor[] = [
      {
        id: `anchor-${scenario.id}-policy-packs`,
        panel: 'policy_packs',
        ...(highlightedPackIds[0] !== undefined ? { targetId: highlightedPackIds[0] } : {}),
        narration: 'Open Policy Packs to see the pack, rule and decision this scenario matched.',
      },
      {
        id: `anchor-${scenario.id}-enforcement`,
        panel: 'enforcement',
        ...(highlightedEnforcementLinkId !== undefined ? { targetId: highlightedEnforcementLinkId } : {}),
        narration: 'Open Enforcement to see the enforcement decision this policy evaluation informed.',
      },
      {
        id: `anchor-${scenario.id}-proofs`,
        panel: 'proofs',
        ...(highlightedProofId !== undefined ? { targetId: highlightedProofId } : {}),
        narration: 'Open Proofs / Audit to inspect the policy proof and the enforcement proof it fed into.',
      },
      {
        id: `anchor-${scenario.id}-overview`,
        panel: 'overview',
        narration: 'The Overview health/open-items summary reflects any policy-blocked decisions from this run.',
      },
    ];
    if (highlightedDecisionId !== undefined) {
      anchors.push({
        id: `anchor-${scenario.id}-policy-decision`,
        panel: 'policy_packs',
        targetId: highlightedDecisionId,
        narration: `Inspect policy decision ${highlightedDecisionId} for the matched rule(s), obligations, evidence and approval requirements.`,
      });
    }
    return anchors;
  }
}

export function createDemoPolicyPackControlPlaneService(): DemoPolicyPackControlPlaneService {
  return new DemoPolicyPackControlPlaneService();
}
