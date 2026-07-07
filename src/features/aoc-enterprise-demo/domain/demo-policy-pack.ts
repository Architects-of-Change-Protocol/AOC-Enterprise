import type { PolicyPackControlPlaneViewModel } from '../../aoc-control-plane/domain/policy-pack-view-model.js';
import type { DemoControlPlanePanel } from './demo-control-plane-snapshot.js';
import type { DemoScenario, DemoScenarioId } from './demo-scenario.js';
import type { DemoScenarioRun } from './demo-step.js';

/** One anchor an operator walkthrough tells the operator to open/inspect -- always references a panel and (when applicable) a specific row id this scenario's run actually produced. */
export interface DemoPolicyPackWalkthroughAnchor {
  readonly id: string;
  readonly panel: DemoControlPlanePanel;
  readonly targetId?: string;
  readonly narration: string;
}

/**
 * A policy-pack-focused Control Plane snapshot: which packs/rules/decision/
 * proof/enforcement-link this scenario run actually touched, plus the full
 * read-model view (`viewModel`) so components can render pack/rule/
 * evidence/approval detail without re-deriving it. Every id and every row in
 * `viewModel` is a direct projection of what `PolicyPackRuntime` and Action
 * Enforcement's own decision/proof actually recorded for this run -- nothing
 * here evaluates a policy or infers a legal conclusion.
 */
export interface DemoPolicyPackControlPlaneSnapshot {
  readonly id: string;
  readonly scenarioId: DemoScenarioId;
  readonly generatedAt: string;
  readonly highlightedPackIds: readonly string[];
  readonly highlightedVersionIds: readonly string[];
  readonly highlightedRuleIds: readonly string[];
  readonly highlightedDecisionId?: string;
  readonly highlightedProofId?: string;
  readonly highlightedEnforcementLinkId?: string;
  /** `true` only when this run produced a policy decision id, a policy proof id, and an enforcement link connecting them -- never asserted independently of those ids. */
  readonly policyProofChainComplete: boolean;
  /** Demo-only / legal-completeness metadata copied from the highlighted pack's current version; falls back to the conservative `true`/`not_legal_advice` when no pack was highlighted. */
  readonly demoOnly: boolean;
  readonly legalCompleteness: string;
  readonly walkthroughAnchors: readonly DemoPolicyPackWalkthroughAnchor[];
  readonly viewModel: PolicyPackControlPlaneViewModel;
}

export type DemoPolicyPackNarrativeAudience = 'executive' | 'technical' | 'operator' | 'investor';

export interface DemoPolicyPackNarrativeSection {
  readonly id: string;
  readonly audience: DemoPolicyPackNarrativeAudience;
  readonly title: string;
  readonly body: string;
}

/**
 * Deterministic, audience-segmented demo narration for a single policy-pack
 * scenario run. `legalDisclaimer` is always present and is never phrased as
 * a compliance guarantee -- see `services/demo-policy-pack-narrative-service.ts`.
 */
export interface DemoPolicyPackNarrative {
  readonly scenarioId: DemoScenarioId;
  readonly buyerPain: string;
  readonly aocValue: string;
  readonly controlPlaneWalkthrough: string;
  readonly legalDisclaimer: string;
  readonly sections: readonly DemoPolicyPackNarrativeSection[];
}

/** Policy metadata read straight off a run's `DemoScenarioOutcome` -- no re-derivation, just the fields already present when the scenario ran through a policy-pack-configured guard. */
export interface DemoPolicyPackScenarioMetadata {
  readonly policyDecisionId?: string;
  readonly policyProofId?: string;
  readonly policyPackVersionIds?: readonly string[];
  readonly policyMatchedRuleIds?: readonly string[];
  readonly policyReasonCode?: string;
  readonly policyReason?: string;
}

/**
 * A standard `DemoScenarioRun` (produced by `DemoScenarioRunner`) plus the
 * policy-pack-specific metadata and Control Plane snapshot
 * `DemoPolicyPackScenarioService` adds on top of it.
 */
export interface DemoPolicyPackScenarioRun extends DemoScenarioRun {
  readonly scenario: DemoScenario;
  readonly policyMetadata: DemoPolicyPackScenarioMetadata;
  readonly policyControlPlaneSnapshot: DemoPolicyPackControlPlaneSnapshot;
  readonly executorSafetyVerified: boolean;
  readonly policyReferencesVerified: boolean;
  readonly controlPlaneSnapshotVerified: boolean;
}
