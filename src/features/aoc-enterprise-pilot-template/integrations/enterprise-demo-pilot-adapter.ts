import type { DemoScenario, DemoScenarioId } from '../../aoc-enterprise-demo/domain/demo-scenario.js';
import type { DemoScenarioRun } from '../../aoc-enterprise-demo/domain/demo-step.js';
import type { DemoScenarioRegistry, DemoScenarioRunner } from '../../aoc-enterprise-demo/services/index.js';
import type { PilotScenarioExpectedOutcome } from '../domain/pilot-scenario.js';

/**
 * Maps a real Enterprise Demo scenario definition into the small summary a
 * pilot binding needs. Never invents a scenario -- `demoScenario` must come
 * from a real `DemoScenarioRegistry` lookup.
 */
export interface DemoScenarioBindingSummary {
  readonly demoScenarioId: DemoScenarioId;
  readonly title: string;
  readonly category: DemoScenario['category'];
  readonly expectedOutcome: DemoScenario['expectedOutcome'];
  readonly tags: readonly string[];
}

/**
 * Proof references pulled from a real, executed `DemoScenarioOutcome` --
 * populated only for the fields that outcome actually carried.
 */
export interface DemoScenarioRunProofReferences {
  readonly recognitionDecisionId?: string;
  readonly authorityProofId?: string;
  readonly approvalProofId?: string;
  readonly handshakeProofId?: string;
  readonly policyDecisionId?: string;
  readonly policyProofId?: string;
  readonly enforcementDecisionId?: string;
  readonly executionResultId?: string;
}

/**
 * A pilot expectation ("blocked", "approval_required", ...) is deliberately
 * coarser-grained than `DemoScenarioOutcomeStatus` -- this table is the only
 * place that reconciles the two vocabularies, so pilots never claim an
 * outcome the demo scenario didn't actually produce.
 */
const OUTCOME_COMPATIBILITY: Readonly<Record<PilotScenarioExpectedOutcome, readonly string[]>> = {
  passed: ['executed', 'blocked', 'approval_required', 'evidence_required', 'duplicate_suppressed', 'dry_run_allowed', 'emergency_denied'],
  blocked: ['blocked', 'emergency_denied'],
  approval_required: ['approval_required'],
  evidence_required: ['evidence_required'],
  executed: ['executed', 'dry_run_allowed'],
  warning_allowed: ['executed'],
};

export function lookupDemoScenario(registry: DemoScenarioRegistry, demoScenarioId: string): DemoScenario | undefined {
  return registry.listScenarios().find((scenario) => scenario.id === demoScenarioId);
}

export function summarizeDemoScenario(scenario: DemoScenario): DemoScenarioBindingSummary {
  return {
    demoScenarioId: scenario.id,
    title: scenario.title,
    category: scenario.category,
    expectedOutcome: scenario.expectedOutcome,
    tags: scenario.tags,
  };
}

export function extractDemoRunProofReferences(run: DemoScenarioRun): DemoScenarioRunProofReferences {
  const outcome = run.outcome;
  if (outcome === undefined) {
    return {};
  }
  return {
    ...(outcome.recognitionDecisionId !== undefined ? { recognitionDecisionId: outcome.recognitionDecisionId } : {}),
    ...(outcome.authorityProofId !== undefined ? { authorityProofId: outcome.authorityProofId } : {}),
    ...(outcome.approvalProofId !== undefined ? { approvalProofId: outcome.approvalProofId } : {}),
    ...(outcome.handshakeProofId !== undefined ? { handshakeProofId: outcome.handshakeProofId } : {}),
    ...(outcome.policyDecisionId !== undefined ? { policyDecisionId: outcome.policyDecisionId } : {}),
    ...(outcome.policyProofId !== undefined ? { policyProofId: outcome.policyProofId } : {}),
    ...(outcome.enforcementDecisionId !== undefined ? { enforcementDecisionId: outcome.enforcementDecisionId } : {}),
    ...(outcome.executionResultId !== undefined ? { executionResultId: outcome.executionResultId } : {}),
  };
}

export function pilotOutcomeMatchesDemoStatus(pilotExpectedOutcome: PilotScenarioExpectedOutcome, demoStatus: string): boolean {
  return OUTCOME_COMPATIBILITY[pilotExpectedOutcome].includes(demoStatus);
}

/** Runs a real Enterprise Demo scenario end to end. Never fabricates a run. */
export async function runBoundDemoScenario(runner: DemoScenarioRunner, demoScenarioId: DemoScenarioId): Promise<DemoScenarioRun> {
  return runner.runScenario(demoScenarioId);
}
