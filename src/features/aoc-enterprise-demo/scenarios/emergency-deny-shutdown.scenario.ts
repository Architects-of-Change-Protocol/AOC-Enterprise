import { buildDraftClosureEmailGuardInput } from '../../action-enforcement/fixtures/allowed-action.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { DRAFT_CLOSURE_EMAIL } from '../fixtures/enterprise-demo-actions.fixture.js';
import { PMFREAK_PERSONA_ID, AOC_OPERATOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'emergency-deny-shutdown';

export const EMERGENCY_DENY_SHUTDOWN_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Emergency Deny Blocks All Execution',
  shortTitle: 'Emergency Deny Shutdown',
  category: 'enforcement',
  summary: 'Emergency deny mode is activated, then PMFreak attempts the same draft-closure-email action that would otherwise be allowed.',
  enterpriseMessage: 'AOC provides an enterprise kill switch for autonomous execution.',
  buyerPain: 'Enterprises need one lever that stops every autonomous action immediately during an incident, not a per-agent shutdown.',
  aocValue: 'Action Enforcement checks a single emergency-deny flag before every other policy, so it overrides even an otherwise fully valid request.',
  personas: [PMFREAK_PERSONA_ID, AOC_OPERATOR_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: DRAFT_CLOSURE_EMAIL,
  capability: 'project_closure.drafting',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'medium',
  expectedOutcome: 'emergency_denied',
  tags: ['enforcement', 'emergency', 'kill_switch', 'blocked'],
  steps: [
    {
      id: 'activate-emergency-deny',
      kind: 'setup',
      title: 'Activate emergency deny',
      description: 'An operator activates emergency deny on Action Enforcement.',
      operatorNarration: 'This is a single runtime flag flip -- deliberately blunt and immediate.',
    },
    {
      id: 'enforcement-emergency-denied',
      kind: 'enforcement',
      title: 'Action Enforcement denies the otherwise-valid request',
      description: 'PMFreak submits the same draft-closure-email request that succeeded in the internal-agent-allowed scenario; enforcement now returns emergency_denied.',
      operatorNarration: 'Identity, authority and scope are all still valid -- the emergency flag alone stops execution.',
      expectedState: 'emergency_denied',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the emergency state',
      description: 'The Control Plane health indicator shows emergency deny active, and the Enforcement panel shows the denied decision.',
      operatorNarration: 'Emergency status is visible at a glance, not buried in a single request.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-emergency-denied',
      type: 'enforcement_decision',
      title: 'Enforcement decision is emergency_denied',
      description: 'The enforcement decision type must be emergency_denied.',
      expected: 'decision.type === "emergency_denied"',
    },
    {
      id: 'assert-executor-did-not-run',
      type: 'executor_safety',
      title: 'Executor did not run',
      description: 'The real executor callback must never run while emergency deny is active.',
      expected: 'exactly 0 executed enforcement outcomes',
    },
    {
      id: 'assert-emergency-status-visible',
      type: 'control_plane_row',
      title: 'Emergency status is visible',
      description: 'The runtime must report emergency deny as active after activation.',
      expected: 'enforcementRuntime.isEmergencyDenyActive() === true',
    },
  ],
};

export const executeEmergencyDenyShutdownScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [activateStep, enforcementStep, controlPlaneStep] = EMERGENCY_DENY_SHUTDOWN_SCENARIO.steps;

  const activateStartedAt = ctx.now();
  world.fixture.enforcementRuntime.setEmergencyDeny(true);
  const emergencyActive = world.fixture.enforcementRuntime.isEmergencyDenyActive();
  const activateCompletedAt = ctx.now();

  steps.push(
    completeStep(
      SCENARIO_ID,
      activateStep!,
      emergencyActive ? 'passed' : 'failed',
      activateStartedAt,
      activateCompletedAt,
      `Emergency deny active: ${emergencyActive}.`,
      [world.trustDomainId],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.aocGuard.enforce(buildDraftClosureEmailGuardInput(), () => {
    executorRuns += 1;
    return 'draft saved';
  });
  const completedAt = ctx.now();

  const emergencyDenied = outcome.decision.type === 'emergency_denied';
  steps.push(
    completeStep(
      SCENARIO_ID,
      enforcementStep!,
      emergencyDenied ? 'passed' : 'failed',
      startedAt,
      completedAt,
      `Enforcement decision: ${outcome.decision.type}. Executor ran ${executorRuns} time(s).`,
      [outcome.request.id],
    ),
  );

  steps.push(
    completeStep(
      SCENARIO_ID,
      controlPlaneStep!,
      'passed',
      completedAt,
      completedAt,
      `Control Plane health reflects emergency deny active: ${world.fixture.enforcementRuntime.isEmergencyDenyActive()}.`,
      [outcome.request.id],
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluateEmergencyDenyShutdownAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const finalOutcome = result.enforcementOutcomes[result.enforcementOutcomes.length - 1]!;
  const executedCount = result.enforcementOutcomes.filter((o) => o.result.executed).length;
  const emergencyDenied = finalOutcome.decision.type === 'emergency_denied';
  const emergencyStatusStep = result.steps.find((step) => step.stepId === 'activate-emergency-deny');

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      emergencyDenied,
      finalOutcome.decision.type,
      emergencyDenied ? 'EMERGENCY_DENIED' : 'EMERGENCY_DECISION_UNEXPECTED',
      `Enforcement decision reason: ${finalOutcome.decision.reason}`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[1]!.id, defs[1]!.expected, 0, executedCount),
    assertionResult(
      SCENARIO_ID,
      defs[2]!.id,
      defs[2]!.type,
      defs[2]!.expected,
      emergencyStatusStep?.status === 'passed',
      emergencyStatusStep?.summary ?? 'emergency activation step missing',
      emergencyStatusStep?.status === 'passed' ? 'EMERGENCY_STATUS_VISIBLE' : 'EMERGENCY_STATUS_NOT_CONFIRMED',
      'The runtime confirmed emergency deny was active before the request was submitted.',
    ),
  ];
};
