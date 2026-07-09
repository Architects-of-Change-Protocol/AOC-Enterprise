import { findPMFreakAction } from '../pmfreak-agent-passport/index.js';
import { demoPMFreakProjectGovernanceScenarios } from '../pmfreak-project-governance-scenarios/index.js';
import type { PMFreakProjectGovernanceScenarioContext, PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import type { PMFreakDemoAttemptedActionCard } from './pmfreak-demo-control-plane-view-types.js';

const CONTEXT_FLAG_LABELS: ReadonlyArray<readonly [keyof PMFreakProjectGovernanceScenarioContext, string]> = [
  ['billingSensitive', 'billing_sensitive'],
  ['contractSensitive', 'contract_sensitive'],
  ['legalSensitive', 'legal_sensitive'],
  ['customerFacing', 'customer_facing'],
  ['externalCommunication', 'external_communication'],
  ['projectClosureSensitive', 'project_closure_sensitive'],
  ['scheduleSensitive', 'schedule_sensitive'],
  ['customerCommitment', 'customer_commitment'],
];

/**
 * Static scenarioId -> declared context lookup, built once from the
 * Project Governance Scenario Pack's own `demoPMFreakProjectGovernanceScenarios`
 * export. This reads each scenario's own declared context flags -- it never
 * infers or re-derives sensitivity from a decision or category.
 */
const SCENARIO_CONTEXT_BY_ID = new Map<string, PMFreakProjectGovernanceScenarioContext>(
  demoPMFreakProjectGovernanceScenarios.map((scenario) => [scenario.scenarioId, scenario.context]),
);

function deriveContextFlags(scenarioId: string): readonly string[] {
  const context = SCENARIO_CONTEXT_BY_ID.get(scenarioId);
  if (context === undefined) return [];
  return CONTEXT_FLAG_LABELS.filter(([key]) => context[key] === true).map(([, label]) => label);
}

function humanizeActionId(actionId: string): string {
  const segment = actionId.split('.').pop() ?? actionId;
  return segment
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const SAFE_DESCRIPTION = 'The agent attempted a demo project-governance action. AOC evaluated passport, capability, scope, evidence and approvals before returning a decision.';

/**
 * Builds a claim-safe attempted action card from a scenario run result.
 * Never re-derives the action's authorization, evidence, or approval
 * status -- only presents the attempt's identity, category, and declared
 * context flags.
 */
export function createPMFreakDemoAttemptedActionCard(result: PMFreakProjectGovernanceScenarioRunResult): PMFreakDemoAttemptedActionCard {
  const action = findPMFreakAction(result.actionId);

  const card: PMFreakDemoAttemptedActionCard = {
    actionAttemptId: result.actionAttemptId,
    actionId: result.actionId,
    actionLabel: action?.title ?? humanizeActionId(result.actionId),
    projectId: result.projectId,
    workspaceId: result.workspaceId,
    ...(result.customerId !== undefined ? { customerId: result.customerId } : {}),
    scenarioCategory: result.category,
    contextFlags: deriveContextFlags(result.scenarioId),
    safeDescription: SAFE_DESCRIPTION,
  };

  assertNoPMFreakDemoControlPlaneOverclaim(card);
  return card;
}
