import { resolvePMFreakAgentPassportAction } from '../pmfreak-agent-passport/index.js';
import type { PMFreakAgentPassportRegistry, PMFreakAgentPassportResolution, ResolvePMFreakAgentPassportActionInput } from '../pmfreak-agent-passport/index.js';
import { PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID } from './pmfreak-project-governance-scenario-constants.js';
import type {
  PMFreakProjectGovernanceScenario,
  PMFreakProjectGovernanceScenarioRegistry,
  PMFreakProjectGovernanceScenarioRunResult,
  PMFreakProjectGovernanceScenarioTraceStep,
  RunPMFreakProjectGovernanceScenarioInput,
} from './pmfreak-project-governance-scenario-types.js';

/**
 * Project Governance Scenario runner.
 *
 * This is the single place that turns a scenario id and a set of overrides
 * into a `ResolvePMFreakAgentPassportActionInput`, hands it to
 * `resolvePMFreakAgentPassportAction` from the PMFreak Agent Passport Demo
 * Pack, and projects the resulting `PMFreakAgentPassportResolution` into a
 * scenario-shaped run result -- it never re-implements passport status,
 * authority scope, capability, evidence, or approval gating itself. Every
 * `decision`, `evidenceSatisfied`, `approvalsSatisfied`,
 * `missingEvidenceIds`, and `missingApprovalIds` value on the returned
 * result is read directly from that resolution.
 *
 * When `resolvePMFreakAgentPassportAction` denies an attempt (revoked
 * passport, out-of-scope authority, restricted action, ...), this runner
 * never softens that into a review-type decision -- the scenario decision is
 * always exactly the passport resolution's decision.
 */

const CONTEXT_SENSITIVE_REVIEW_DECISIONS = new Set([
  'require_legal_review',
  'require_contract_review',
  'require_billing_review',
  'require_customer_validation',
  'require_security_review',
  'require_executive_approval',
]);

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function passportResolvedTraceStatus(resolution: PMFreakAgentPassportResolution): PMFreakProjectGovernanceScenarioTraceStep['status'] {
  if (resolution.passportStatus === 'active') return 'passed';
  if (resolution.passportStatus === 'suspended') return 'warning';
  return 'failed';
}

function approvalsCheckedTraceStatus(resolution: PMFreakAgentPassportResolution): PMFreakProjectGovernanceScenarioTraceStep['status'] {
  // Once evidence has already failed, approval satisfaction is no longer decisive on its own --
  // reported as a warning rather than a pass/fail, since the evidence gate already blocks the action.
  if (!resolution.evidenceSatisfied) return 'warning';
  return resolution.approvalsSatisfied ? 'passed' : 'failed';
}

function buildScenarioTrace(scenario: PMFreakProjectGovernanceScenario, resolution: PMFreakAgentPassportResolution): readonly PMFreakProjectGovernanceScenarioTraceStep[] {
  const contextSensitivityPassed = !CONTEXT_SENSITIVE_REVIEW_DECISIONS.has(resolution.decision);

  return [
    { stepId: 'scenario_loaded', title: 'Scenario loaded', status: 'passed', detail: `Scenario "${scenario.scenarioId}" found in the registry.` },
    {
      stepId: 'passport_resolved',
      title: 'Passport resolved',
      status: passportResolvedTraceStatus(resolution),
      detail: `Passport "${resolution.passportId}" resolved with status "${resolution.passportStatus}".`,
    },
    {
      stepId: 'action_authorized',
      title: 'Action authorized by passport',
      status: resolution.allowedByPassport ? 'passed' : 'failed',
      detail: resolution.allowedByPassport ? `Action "${resolution.actionId}" is allowed by the passport.` : `Action "${resolution.actionId}" is not allowed (or is explicitly restricted) by the passport.`,
    },
    {
      stepId: 'capability_checked',
      title: 'Capability token checked',
      status: resolution.allowedByCapability ? 'passed' : 'failed',
      detail: resolution.allowedByCapability ? 'The passport holds the required capability token.' : 'The passport does not hold the required capability token.',
    },
    {
      stepId: 'authority_scope_checked',
      title: 'Authority scope checked',
      status: resolution.allowedByAuthorityScope ? 'passed' : 'failed',
      detail: resolution.allowedByAuthorityScope ? 'The attempt is within the passport\'s workspace/project/phase/customer authority scope.' : 'The attempt is outside the passport\'s authority scope.',
    },
    {
      stepId: 'evidence_checked',
      title: 'Required evidence checked',
      status: resolution.evidenceSatisfied ? 'passed' : 'failed',
      detail: resolution.evidenceSatisfied ? 'All required evidence is present.' : `Required evidence is missing: ${resolution.missingEvidenceIds.join(', ') || 'none listed'}.`,
    },
    {
      stepId: 'approvals_checked',
      title: 'Required approvals checked',
      status: approvalsCheckedTraceStatus(resolution),
      detail: resolution.approvalsSatisfied ? 'All required approvals are present.' : `Approval is required before governed execution: ${resolution.missingApprovalIds.join(', ') || 'none listed'}.`,
    },
    {
      stepId: 'context_sensitivity_checked',
      title: 'Context sensitivity checked',
      status: contextSensitivityPassed ? 'passed' : 'failed',
      detail: contextSensitivityPassed ? 'No unresolved billing/contract/legal/customer-validation-sensitive context flag blocks this decision.' : 'A billing/contract/legal/customer-validation-sensitive context requires review before this decision can advance.',
    },
    { stepId: 'decision_computed', title: 'Decision computed', status: 'passed', detail: `Decision computed by the PMFreak Agent Passport resolver: "${resolution.decision}".` },
    { stepId: 'control_plane_ready', title: 'Control Plane summary ready', status: 'passed', detail: 'A claim-safe Control Plane summary can be built from this run result.' },
    { stepId: 'export_metadata_ready', title: 'Export metadata ready', status: 'passed', detail: 'Claim-safe export metadata can be built from this run result.' },
  ];
}

function buildScenarioNotFoundTrace(scenarioId: string): readonly PMFreakProjectGovernanceScenarioTraceStep[] {
  return [
    { stepId: 'scenario_loaded', title: 'Scenario loaded', status: 'failed', detail: `No scenario found for scenarioId "${scenarioId}".` },
    { stepId: 'passport_resolved', title: 'Passport resolved', status: 'not_applicable', detail: 'Skipped: no scenario was found to resolve a passport for.' },
    { stepId: 'action_authorized', title: 'Action authorized by passport', status: 'not_applicable', detail: 'Skipped: no scenario was found.' },
    { stepId: 'capability_checked', title: 'Capability token checked', status: 'not_applicable', detail: 'Skipped: no scenario was found.' },
    { stepId: 'authority_scope_checked', title: 'Authority scope checked', status: 'not_applicable', detail: 'Skipped: no scenario was found.' },
    { stepId: 'evidence_checked', title: 'Required evidence checked', status: 'not_applicable', detail: 'Skipped: no scenario was found.' },
    { stepId: 'approvals_checked', title: 'Required approvals checked', status: 'not_applicable', detail: 'Skipped: no scenario was found.' },
    { stepId: 'context_sensitivity_checked', title: 'Context sensitivity checked', status: 'not_applicable', detail: 'Skipped: no scenario was found.' },
    { stepId: 'decision_computed', title: 'Decision computed', status: 'passed', detail: 'Decision computed: deny (scenario not found).' },
    { stepId: 'control_plane_ready', title: 'Control Plane summary ready', status: 'passed', detail: 'A claim-safe Control Plane summary can still be built for this denied attempt.' },
    { stepId: 'export_metadata_ready', title: 'Export metadata ready', status: 'passed', detail: 'Claim-safe export metadata can still be built for this denied attempt.' },
  ];
}

const SAFE_FRAMING_WARNING =
  'This scenario result reflects AOC Enterprise passport, authority-scope, capability, evidence, and approval gating only, orchestrated by the PMFreak Agent Passport Demo Pack. It is not legal advice, not a compliance certification, and not a guarantee of contractual, billing, or invoice validity.';

export function runPMFreakProjectGovernanceScenario(
  input: RunPMFreakProjectGovernanceScenarioInput,
  scenarioRegistry: PMFreakProjectGovernanceScenarioRegistry,
  passportRegistry: PMFreakAgentPassportRegistry,
): PMFreakProjectGovernanceScenarioRunResult {
  const scenario = scenarioRegistry.findByScenarioId(input.scenarioId);

  if (scenario === undefined) {
    const agentId = input.overrideAgentId ?? 'unknown';
    const passportId = input.overridePassportId ?? 'unknown';
    const actionAttemptId = `${input.scenarioId}::not-found`;

    const notFoundResolution: PMFreakAgentPassportResolution = {
      actionAttemptId,
      agentId,
      passportId,
      actionId: 'unknown',
      passportStatus: 'revoked',
      decision: 'deny',
      allowedByPassport: false,
      allowedByCapability: false,
      allowedByAuthorityScope: false,
      evidenceSatisfied: false,
      approvalsSatisfied: false,
      missingEvidenceIds: [],
      missingApprovalIds: [],
      requiredEvidenceIds: [],
      requiredApprovalIds: [],
      appliedPolicyPackIds: [PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID],
      jurisdictionPackIds: [],
      warnings: [SAFE_FRAMING_WARNING],
      errors: [`scenario_not_found: no scenario is registered for scenarioId "${input.scenarioId}".`],
    };

    return {
      scenarioId: input.scenarioId,
      scenarioTitle: 'Unknown scenario',
      category: 'billing_readiness',
      actionAttemptId,
      projectId: input.overrideProjectId ?? 'unknown',
      workspaceId: input.overrideWorkspaceId ?? 'unknown',
      ...(input.overrideCustomerId !== undefined ? { customerId: input.overrideCustomerId } : {}),
      agentId,
      passportId,
      actionId: 'unknown',
      decision: 'deny',
      passportResolution: notFoundResolution,
      evidenceSatisfied: false,
      approvalsSatisfied: false,
      missingEvidenceIds: [],
      missingApprovalIds: [],
      appliedPolicyPackIds: notFoundResolution.appliedPolicyPackIds,
      jurisdictionPackIds: [],
      scenarioTrace: buildScenarioNotFoundTrace(input.scenarioId),
      safeNarrative: 'No demo scenario is registered for this scenario id, so AOC Enterprise denies the attempt rather than guessing at intent.',
      warnings: notFoundResolution.warnings,
      errors: notFoundResolution.errors,
    };
  }

  const agentId = input.overrideAgentId ?? scenario.primaryAgentId;
  const passportId = input.overridePassportId ?? scenario.primaryPassportId;
  const workspaceId = input.overrideWorkspaceId ?? scenario.projectContext.workspaceId;
  const projectId = input.overrideProjectId ?? scenario.projectContext.projectId;
  const customerId = input.overrideCustomerId ?? scenario.projectContext.customerId;
  const evidenceIds = input.overrideEvidenceIds ?? scenario.requiredEvidenceIds;
  const approvalIds = input.overrideApprovalIds ?? scenario.requiredApprovalIds;

  const actionAttemptId = `${scenario.scenarioId}::${passportId}::${projectId}`;

  const resolverInput: ResolvePMFreakAgentPassportActionInput = {
    actionAttemptId,
    agentId,
    passportId,
    actionId: scenario.primaryActionId,
    workspaceId,
    projectId,
    customerId,
    projectPhase: scenario.projectContext.phase,
    evidenceIds,
    approvalIds,
    ...(scenario.projectContext.jurisdictionCountryCode !== undefined ? { jurisdictionCountryCode: scenario.projectContext.jurisdictionCountryCode } : {}),
    policyPackIds: scenario.projectContext.policyPackIds,
    ...(input.requestedAt !== undefined ? { requestedAt: input.requestedAt } : {}),
    context: scenario.context,
  };

  const resolution = resolvePMFreakAgentPassportAction(resolverInput, passportRegistry);

  const appliedPolicyPackIds = dedupe([...resolution.appliedPolicyPackIds, PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID, ...scenario.projectContext.policyPackIds]);
  const jurisdictionPackIds = dedupe([...resolution.jurisdictionPackIds, ...scenario.projectContext.jurisdictionPackIds]);

  return {
    scenarioId: scenario.scenarioId,
    scenarioTitle: scenario.title,
    category: scenario.category,
    actionAttemptId,
    projectId,
    workspaceId,
    ...(customerId !== undefined ? { customerId } : {}),
    agentId,
    passportId,
    actionId: scenario.primaryActionId,
    decision: resolution.decision,
    passportResolution: resolution,
    evidenceSatisfied: resolution.evidenceSatisfied,
    approvalsSatisfied: resolution.approvalsSatisfied,
    missingEvidenceIds: resolution.missingEvidenceIds,
    missingApprovalIds: resolution.missingApprovalIds,
    appliedPolicyPackIds,
    jurisdictionPackIds,
    scenarioTrace: buildScenarioTrace(scenario, resolution),
    safeNarrative: scenario.safeNarrative,
    warnings: resolution.warnings,
    errors: resolution.errors,
  };
}
