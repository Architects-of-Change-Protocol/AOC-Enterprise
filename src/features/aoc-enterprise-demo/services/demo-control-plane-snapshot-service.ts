import { buildTimeline } from '../../aoc-control-plane/services/control-plane-timeline-service.js';
import type { DemoControlPlanePanel, DemoControlPlaneSnapshot, DemoHighlightedControlPlaneRow } from '../domain/demo-control-plane-snapshot.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { EnterpriseDemoWorld } from '../fixtures/enterprise-demo-world.fixture.js';
import type { DemoProofChain } from '../domain/demo-proof-chain.js';
import type { ScenarioExecutionResult } from '../scenarios/scenario-runtime-types.js';

function relevantIdsFromResult(result: ScenarioExecutionResult): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const outcome of result.enforcementOutcomes) {
    ids.add(outcome.decision.id);
    ids.add(outcome.request.id);
    if (outcome.proof !== undefined) ids.add(outcome.proof.id);
    if (outcome.decision.recognitionDecisionId !== undefined) ids.add(outcome.decision.recognitionDecisionId);
    if (outcome.decision.authorityDecisionId !== undefined) ids.add(outcome.decision.authorityDecisionId);
    if (outcome.decision.authorityProofId !== undefined) ids.add(outcome.decision.authorityProofId);
    if (outcome.decision.approvalRequestId !== undefined) ids.add(outcome.decision.approvalRequestId);
    if (outcome.decision.approvalDecisionId !== undefined) ids.add(outcome.decision.approvalDecisionId);
    if (outcome.decision.approvalProofId !== undefined) ids.add(outcome.decision.approvalProofId);
    if (outcome.decision.handshakeDecisionId !== undefined) ids.add(outcome.decision.handshakeDecisionId);
    if (outcome.decision.handshakeProofId !== undefined) ids.add(outcome.decision.handshakeProofId);
    if (outcome.decision.visaId !== undefined) ids.add(outcome.decision.visaId);
    if (outcome.decision.ingressGrantId !== undefined) ids.add(outcome.decision.ingressGrantId);
    if (outcome.decision.policyDecisionId !== undefined) ids.add(outcome.decision.policyDecisionId);
    if (outcome.decision.policyProofId !== undefined) ids.add(outcome.decision.policyProofId);
  }
  return ids;
}

function buildHighlightedRows(scenario: DemoScenario, world: EnterpriseDemoWorld, result: ScenarioExecutionResult): readonly DemoHighlightedControlPlaneRow[] {
  const finalOutcome = result.enforcementOutcomes[result.enforcementOutcomes.length - 1];
  if (finalOutcome === undefined) return [];

  const rows: DemoHighlightedControlPlaneRow[] = [
    {
      id: `row-enforcement-${finalOutcome.request.id}`,
      panel: 'enforcement',
      rowId: finalOutcome.request.id,
      reason: `Enforcement request for "${scenario.title}".`,
    },
  ];

  if (finalOutcome.decision.recognitionDecisionId !== undefined) {
    rows.push({
      id: `row-recognition-${finalOutcome.decision.recognitionDecisionId}`,
      panel: 'recognition',
      rowId: finalOutcome.decision.recognitionDecisionId,
      reason: 'Recognition decision evaluated for this scenario.',
    });
  }
  if (finalOutcome.decision.authorityProofId !== undefined) {
    rows.push({
      id: `row-authority-${finalOutcome.decision.authorityProofId}`,
      panel: 'authority',
      rowId: finalOutcome.decision.authorityProofId,
      reason: 'Authority proof evaluated for this scenario.',
    });
  }
  if (finalOutcome.decision.approvalRequestId !== undefined) {
    rows.push({
      id: `row-approval-${finalOutcome.decision.approvalRequestId}`,
      panel: 'approvals',
      rowId: finalOutcome.decision.approvalRequestId,
      reason: 'Approval request associated with this scenario.',
    });
  } else {
    // The decision object returned by a `require_human_approval` preflight predates an approval
    // request a scenario subsequently creates for it, so it can never reference one back. Fall back
    // to the real Approval Runtime store for this trust domain's most recently created request.
    const requests = world.fixture.approvalRuntime.store.getRequestsByTrustDomain(world.trustDomainId);
    const mostRecent = [...requests].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
    if (mostRecent !== undefined) {
      rows.push({
        id: `row-approval-${mostRecent.id}`,
        panel: 'approvals',
        rowId: mostRecent.id,
        reason: 'Approval request associated with this scenario.',
      });
    }
  }
  if (finalOutcome.decision.visaId !== undefined) {
    rows.push({
      id: `row-external-agents-${finalOutcome.decision.visaId}`,
      panel: 'external_agents',
      rowId: finalOutcome.decision.visaId,
      reason: 'Agent visa associated with this scenario.',
    });
  }
  if (finalOutcome.proof !== undefined) {
    rows.push({
      id: `row-proofs-${finalOutcome.proof.id}`,
      panel: 'proofs',
      rowId: finalOutcome.proof.id,
      reason: 'Enforcement proof produced by this scenario.',
    });
  }
  if (finalOutcome.decision.policyDecisionId !== undefined) {
    rows.push({
      id: `row-policy-packs-${finalOutcome.decision.policyDecisionId}`,
      panel: 'policy_packs',
      rowId: finalOutcome.decision.policyDecisionId,
      reason: 'Domain Policy Pack Runtime decision consulted during enforcement preflight for this scenario.',
    });
  }

  return rows;
}

function visiblePanelsFor(rows: readonly DemoHighlightedControlPlaneRow[]): readonly DemoControlPlanePanel[] {
  const panels = new Set<DemoControlPlanePanel>(['overview']);
  for (const row of rows) panels.add(row.panel);
  panels.add('proofs');
  return [...panels];
}

function overviewMetricIdsFor(scenario: DemoScenario): readonly string[] {
  const ids = new Set<string>(['metric-recognition-decisions', 'metric-enforcement-decisions']);
  if (scenario.category === 'approval') ids.add('metric-open-approvals');
  if (scenario.category === 'external_agents') ids.add('metric-external-agent-standing');
  if (scenario.tags.includes('emergency')) ids.add('metric-emergency-deny-status');
  if (scenario.tags.includes('idempotency')) ids.add('metric-duplicate-suppressions');
  return [...ids];
}

/**
 * Builds a scenario-scoped DemoControlPlaneSnapshot: which Control Plane
 * panels and rows an operator should look at, and which timeline entries are
 * relevant. It never recomputes a governance decision -- the timeline itself
 * is produced by aoc-control-plane's own `buildTimeline`, fed with the real
 * event trails this scenario's world actually recorded.
 */
export class DemoControlPlaneSnapshotService {
  buildSnapshot(
    scenario: DemoScenario,
    world: EnterpriseDemoWorld,
    result: ScenarioExecutionResult,
    proofChain: DemoProofChain,
    now: () => string,
  ): DemoControlPlaneSnapshot {
    const trustDomainId = world.trustDomainId;
    const timeline = buildTimeline({
      recognitionEvents: world.fixture.recognitionRuntime.getAuditTrail({ trustDomainId }),
      authorityEvents: world.fixture.authorityRuntime.getAuthorityEvents({ trustDomainId }),
      approvalEvents: world.fixture.approvalRuntime.getApprovalTrail({ trustDomainId }),
      handshakeEvents: world.fixture.handshakeRuntime.getHandshakeTrail({ localTrustDomainId: trustDomainId }),
      enforcementEvents: world.fixture.enforcementRuntime.store.getEvents({ trustDomainId }),
    });

    const relevantIds = relevantIdsFromResult(result);
    const relevantTimeline = timeline.filter(
      (item) =>
        relevantIds.has(item.id) ||
        (item.relatedDecisionId !== undefined && relevantIds.has(item.relatedDecisionId)) ||
        (item.relatedProofId !== undefined && relevantIds.has(item.relatedProofId)),
    );
    const timelineItemIds = (relevantTimeline.length > 0 ? relevantTimeline : timeline.slice(0, 5)).map((item) => item.id);

    const highlightedRows = buildHighlightedRows(scenario, world, result);

    return {
      id: `control-plane-snapshot-${scenario.id}`,
      scenarioId: scenario.id,
      trustDomainId,
      generatedAt: now(),
      overviewMetricIds: overviewMetricIdsFor(scenario),
      visiblePanelIds: visiblePanelsFor(highlightedRows),
      highlightedRows,
      timelineItemIds,
      proofChainIds: [proofChain.id],
    };
  }
}

export function createDemoControlPlaneSnapshotService(): DemoControlPlaneSnapshotService {
  return new DemoControlPlaneSnapshotService();
}
