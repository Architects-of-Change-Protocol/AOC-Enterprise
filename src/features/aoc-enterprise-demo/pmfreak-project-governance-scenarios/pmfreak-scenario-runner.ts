import { buildPMFreakAgentRuntimeActionRequest, resolvePMFreakAgentPassportAction } from '@aoc-enterprise/pmfreak-agent-passport-foundation';
import type {
  PMFreakAgentPassportResolution,
  PMFreakApprovalRequirementMirror,
  PMFreakAuthorityScope,
  PMFreakCapabilityTokenMirror,
  PMFreakEvidenceRequirementMirror,
  PMFreakProjectPhase,
  ResolvePMFreakAgentPassportActionInput,
} from '@aoc-enterprise/pmfreak-agent-passport-foundation';
import type { AgentPassport, AgentPolicyManifest, AgentRuntimeSeal } from '@aoc-enterprise/agent-governance';
import type { PMFreakRealAgentPassportFixtures } from './pmfreak-real-agent-passport-fixtures.js';
import { PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID } from './pmfreak-project-governance-scenario-constants.js';
import type {
  PMFreakDemoProjectContext,
  PMFreakProjectGovernanceScenario,
  PMFreakProjectGovernanceScenarioPassportVariant,
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
 * `resolvePMFreakAgentPassportAction` from
 * `@aoc-enterprise/pmfreak-agent-passport-foundation` (the real Agent
 * Passport Core wiring for PMFreak), and projects the resulting
 * `PMFreakAgentPassportResolution` into a scenario-shaped run result -- it
 * never re-implements passport, runtime-guard, capability, authority-scope,
 * evidence, or approval gating itself. Every `decision`, `evidenceSatisfied`,
 * `approvalsSatisfied`, `missingEvidenceIds`, and `missingApprovalIds` value
 * on the returned result is read directly from that resolution.
 *
 * When `resolvePMFreakAgentPassportAction` denies an attempt (revoked
 * passport, out-of-scope authority, prohibited action, ...), this runner
 * never softens that into a review-type decision -- the scenario decision is
 * always exactly the passport resolution's decision.
 */

export interface PMFreakScenarioRunnerDeps {
  readonly fixtures: PMFreakRealAgentPassportFixtures;
  /** Caller-supplied clock, forwarded to the resolver's dependencies. Defaults to the resolver's own wall-clock fallback when omitted. */
  readonly now?: () => string;
}

const ALL_PROJECT_PHASES: readonly PMFreakProjectPhase[] = ['initiation', 'planning', 'execution', 'monitoring', 'closure', 'billing'];

/**
 * The runtime guard's default `humanApprovalRiskTiers` (`['critical']`)
 * would force every `billing_readiness`-role action (a `critical`-risk-tier
 * role) through human approval regardless of this pack's own capability/
 * evidence/approval satisfaction. Disabling that tier-wide gate here isolates
 * the satisfaction paths this pack actually demonstrates -- a role's own
 * `humanApprovalRequiredFor` (checked earlier in the guard, and NOT
 * controlled by this option) still applies unconditionally.
 */
const GUARD_OPTIONS = { humanApprovalRiskTiers: [] } as const;

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

interface ResolvedPassportContext {
  readonly passport: AgentPassport;
  readonly policyManifest: AgentPolicyManifest;
  readonly runtimeSeal: AgentRuntimeSeal | null;
}

function resolvePassportContext(
  scenario: PMFreakProjectGovernanceScenario,
  variant: PMFreakProjectGovernanceScenarioPassportVariant,
  fixtures: PMFreakRealAgentPassportFixtures,
): ResolvedPassportContext {
  const roleEntry = fixtures.byRole[scenario.primaryRole];

  if (variant === 'active') {
    return { passport: roleEntry.passport, policyManifest: roleEntry.policyManifest, runtimeSeal: roleEntry.runtimeSeal };
  }
  if (variant === 'revoked') {
    if (scenario.primaryRole !== 'billing_readiness') throw new Error(`PMFreak Project Governance Scenario Pack: no "revoked" passport fixture for role "${scenario.primaryRole}".`);
    return { passport: fixtures.revokedBillingReadinessPassport, policyManifest: roleEntry.policyManifest, runtimeSeal: null };
  }
  if (variant === 'suspended') {
    if (scenario.primaryRole !== 'client_communication') throw new Error(`PMFreak Project Governance Scenario Pack: no "suspended" passport fixture for role "${scenario.primaryRole}".`);
    return { passport: fixtures.suspendedClientCommunicationPassport, policyManifest: roleEntry.policyManifest, runtimeSeal: null };
  }
  if (scenario.primaryRole !== 'planning') throw new Error(`PMFreak Project Governance Scenario Pack: no "expired" passport fixture for role "${scenario.primaryRole}".`);
  return { passport: fixtures.expiredPlanningPassport, policyManifest: roleEntry.policyManifest, runtimeSeal: null };
}

function buildAuthorityScope(projectContext: PMFreakDemoProjectContext, workspaceId: string, projectId: string): PMFreakAuthorityScope {
  return {
    workspaceIds: [workspaceId],
    projectIds: [projectId],
    customerIds: [],
    allowedProjectPhases: ALL_PROJECT_PHASES,
  };
}

function buildCapabilityToken(scenario: PMFreakProjectGovernanceScenario, passportId: string, requestedAt: string): PMFreakCapabilityTokenMirror {
  return {
    id: scenario.capabilityToken.id,
    passportId,
    role: scenario.primaryRole,
    capability: scenario.capabilityToken.capability,
    actions: [scenario.action.actionId],
    resourceScopes: scenario.capabilityToken.resourceScopes,
    constraints: { prohibitedActions: [] },
    delegation: { delegable: false, delegationDepth: 0, maxDelegationDepth: 0 },
    evidenceRequirements: [],
    riskLevel: scenario.capabilityToken.riskLevel,
    status: 'valid',
    issuedAt: requestedAt,
  };
}

function buildEvidenceRequirements(
  scenario: PMFreakProjectGovernanceScenario,
  passportId: string,
  collectedEvidenceIds: readonly string[],
  requestedAt: string,
): readonly PMFreakEvidenceRequirementMirror[] {
  return scenario.evidenceRequirements.map((template) => ({
    id: template.id,
    type: template.type,
    passportId,
    role: scenario.primaryRole,
    action: scenario.action.actionId,
    description: template.description,
    required: true,
    status: collectedEvidenceIds.includes(template.id) ? 'satisfied' : 'open',
    createdAt: requestedAt,
  }));
}

function buildApprovalRequirements(scenario: PMFreakProjectGovernanceScenario, passportId: string): readonly PMFreakApprovalRequirementMirror[] {
  return scenario.approvalRequirements.map((template) => ({
    id: template.id,
    type: template.type,
    passportId,
    role: scenario.primaryRole,
    action: scenario.action.actionId,
    riskLevel: template.riskLevel,
    minimumApprovals: 1,
    requiresSegregationOfDuties: false,
    evidenceRequirements: [],
  }));
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
      title: 'Action authorized by runtime guard',
      status: resolution.allowedByRuntimeGuard ? 'passed' : 'failed',
      detail: resolution.allowedByRuntimeGuard ? `Action "${resolution.actionId}" is allowed by the real runtime guard.` : `Action "${resolution.actionId}" is not allowed by the real runtime guard.`,
    },
    {
      stepId: 'capability_checked',
      title: 'Capability token checked',
      status: resolution.allowedByCapabilityToken ? 'passed' : 'failed',
      detail: resolution.allowedByCapabilityToken ? 'The capability token authorizes this action.' : 'No valid capability token authorizes this action.',
    },
    {
      stepId: 'authority_scope_checked',
      title: 'Authority scope checked',
      status: resolution.allowedByAuthorityScope ? 'passed' : 'failed',
      detail: resolution.allowedByAuthorityScope ? 'The attempt is within the authority scope evaluated for this run.' : 'The attempt is outside the authority scope evaluated for this run.',
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
    { stepId: 'decision_computed', title: 'Decision computed', status: 'passed', detail: `Decision computed by the PMFreak Agent Passport Foundation resolver: "${resolution.decision}".` },
    { stepId: 'control_plane_ready', title: 'Control Plane summary ready', status: 'passed', detail: 'A claim-safe Control Plane summary can be built from this run result.' },
    { stepId: 'export_metadata_ready', title: 'Export metadata ready', status: 'passed', detail: 'Claim-safe export metadata can be built from this run result.' },
  ];
}

function buildScenarioNotFoundTrace(scenarioId: string): readonly PMFreakProjectGovernanceScenarioTraceStep[] {
  return [
    { stepId: 'scenario_loaded', title: 'Scenario loaded', status: 'failed', detail: `No scenario found for scenarioId "${scenarioId}".` },
    { stepId: 'passport_resolved', title: 'Passport resolved', status: 'not_applicable', detail: 'Skipped: no scenario was found to resolve a passport for.' },
    { stepId: 'action_authorized', title: 'Action authorized by runtime guard', status: 'not_applicable', detail: 'Skipped: no scenario was found.' },
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
  'This scenario result reflects AOC Enterprise passport, runtime-guard, capability, authority-scope, evidence, and approval gating only, computed by the real PMFreak Agent Passport Foundation resolver. It is not legal advice, not a compliance certification, and not a guarantee of contractual, billing, or invoice validity.';

export async function runPMFreakProjectGovernanceScenario(
  input: RunPMFreakProjectGovernanceScenarioInput,
  scenarioRegistry: PMFreakProjectGovernanceScenarioRegistry,
  runnerDeps: PMFreakScenarioRunnerDeps,
): Promise<PMFreakProjectGovernanceScenarioRunResult> {
  const scenario = scenarioRegistry.findByScenarioId(input.scenarioId);

  if (scenario === undefined) {
    const actionAttemptId = `${input.scenarioId}::not-found`;

    const notFoundResolution: PMFreakAgentPassportResolution = {
      actionAttemptId,
      passportId: 'unknown',
      actionId: 'unknown',
      role: 'planning',
      passportStatus: 'revoked',
      decision: 'deny',
      allowedByRuntimeGuard: false,
      allowedByCapabilityToken: false,
      allowedByAuthorityScope: false,
      evidenceSatisfied: false,
      approvalsSatisfied: false,
      requiredEvidenceIds: [],
      missingEvidenceIds: [],
      requiredApprovalIds: [],
      missingApprovalIds: [],
      warnings: [SAFE_FRAMING_WARNING],
      errors: [`scenario_not_found: no scenario is registered for scenarioId "${input.scenarioId}".`],
    };

    return {
      scenarioId: input.scenarioId,
      scenarioTitle: 'Unknown scenario',
      category: 'billing_readiness',
      scenarioFound: false,
      actionAttemptId,
      projectId: input.overrideProjectId ?? 'unknown',
      workspaceId: input.overrideWorkspaceId ?? 'unknown',
      ...(input.overrideCustomerId !== undefined ? { customerId: input.overrideCustomerId } : {}),
      agentId: 'unknown',
      actionId: 'unknown',
      decision: 'deny',
      passportResolution: notFoundResolution,
      evidenceSatisfied: false,
      approvalsSatisfied: false,
      missingEvidenceIds: [],
      missingApprovalIds: [],
      appliedPolicyPackIds: [PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID],
      jurisdictionPackIds: [],
      scenarioTrace: buildScenarioNotFoundTrace(input.scenarioId),
      safeNarrative: 'No demo scenario is registered for this scenario id, so AOC Enterprise denies the attempt rather than guessing at intent.',
      warnings: notFoundResolution.warnings,
      errors: notFoundResolution.errors,
    };
  }

  const workspaceId = input.overrideWorkspaceId ?? scenario.projectContext.workspaceId;
  const projectId = input.overrideProjectId ?? scenario.projectContext.projectId;
  const customerId = input.overrideCustomerId ?? scenario.projectContext.customerId;
  const evidenceIds = input.overrideEvidenceIds ?? scenario.baselineEvidenceIds;
  const approvalIds = input.overrideApprovalIds ?? scenario.baselineApprovalIds;
  const requestedAt = input.requestedAt ?? runnerDeps.now?.() ?? new Date(0).toISOString();
  const variant = input.overridePassportVariant ?? 'active';

  const { passport, policyManifest, runtimeSeal } = resolvePassportContext(scenario, variant, runnerDeps.fixtures);
  const authorityScope = input.overrideAuthorityScope ?? buildAuthorityScope(scenario.projectContext, workspaceId, projectId);

  const actionAttemptId = `${scenario.scenarioId}::${passport.passportId}::${projectId}`;

  const request = buildPMFreakAgentRuntimeActionRequest({
    requestId: actionAttemptId,
    passport,
    actorId: scenario.agentId,
    requestedAction: scenario.action.actionId,
    actionCategory: scenario.action.actionCategory,
    ...(scenario.action.toolName !== undefined ? { toolName: scenario.action.toolName } : {}),
    ...(scenario.action.dataCategories !== undefined ? { dataCategories: scenario.action.dataCategories } : {}),
    requestedAt,
  });

  const resolverInput: ResolvePMFreakAgentPassportActionInput = {
    actionAttemptId,
    role: scenario.primaryRole,
    request,
    passport,
    runtimeSeal,
    policyManifest,
    guardOptions: GUARD_OPTIONS,
    authorityScope,
    workspaceId,
    projectId,
    projectPhase: scenario.projectContext.phase,
    ...(customerId !== undefined ? { customerId } : {}),
    capabilityToken: buildCapabilityToken(scenario, passport.passportId, requestedAt),
    evidenceRequirements: buildEvidenceRequirements(scenario, passport.passportId, evidenceIds, requestedAt),
    approvalRequirements: buildApprovalRequirements(scenario, passport.passportId),
    grantedApprovalRequirementIds: scenario.approvalRequirements.filter((template) => approvalIds.includes(template.id)).map((template) => template.id),
    context: scenario.context,
  };

  const resolution = await resolvePMFreakAgentPassportAction(resolverInput, { signer: runnerDeps.fixtures.signer, ...(runnerDeps.now !== undefined ? { now: runnerDeps.now } : {}) });

  const appliedPolicyPackIds = dedupe([PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID, ...scenario.projectContext.policyPackIds]);
  const jurisdictionPackIds = dedupe([...scenario.projectContext.jurisdictionPackIds]);

  return {
    scenarioId: scenario.scenarioId,
    scenarioTitle: scenario.title,
    category: scenario.category,
    scenarioFound: true,
    actionAttemptId,
    projectId,
    workspaceId,
    ...(customerId !== undefined ? { customerId } : {}),
    agentId: scenario.agentId,
    role: scenario.primaryRole,
    actionId: scenario.action.actionId,
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
