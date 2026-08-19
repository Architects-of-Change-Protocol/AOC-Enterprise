import { buildSendClientFollowUpGuardInput } from '../../action-enforcement/fixtures/approval-required-action.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { SEND_CLIENT_FOLLOW_UP } from '../fixtures/enterprise-demo-actions.fixture.js';
import { PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'approval-required-block';
const ACTION_REQUEST_ID = 'action-request-demo-approval-required-block';

export const APPROVAL_REQUIRED_BLOCK_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Agent Blocked Because Human Approval Is Missing',
  shortTitle: 'Approval Required',
  category: 'approval',
  summary: 'PMFreak Closure Agent attempts to send a client-facing follow-up without approval from Victor.',
  enterpriseMessage: 'Soberanía prevents autonomous agents from taking externally visible actions without required human approval.',
  buyerPain: 'Enterprises fear an autonomous agent emailing a client without a human ever reviewing the message.',
  aocValue: "Recognition Runtime itself requires human approval for this capability, and enforcement blocks execution until it exists.",
  personas: [PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: SEND_CLIENT_FOLLOW_UP,
  capability: 'project_closure.client_communication',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'high',
  expectedOutcome: 'approval_required',
  tags: ['approval', 'enforcement', 'blocked'],
  steps: [
    {
      id: 'setup-world',
      kind: 'setup',
      title: 'Establish the Datasys Agent Republic',
      description: 'PMFreak holds a communication capability token that requires approval from Victor before send_client_follow_up may execute.',
      operatorNarration: 'This capability token was issued with an approval requirement attached -- not invented for this demo.',
    },
    {
      id: 'recognition-check',
      kind: 'recognition',
      title: 'Recognition Runtime requires human approval',
      description: 'Recognition Runtime evaluates the request and returns require_human_approval because the capability token demands it.',
      operatorNarration: 'Recognition does not deny outright -- it defers to a human.',
      expectedState: 'require_human_approval',
      expectedEventSource: 'recognition',
    },
    {
      id: 'approval-request-created',
      kind: 'approval',
      title: 'A real approval request is created',
      description: "Approval Runtime creates a pending approval request for Recognition Runtime's require_human_approval decision.",
      operatorNarration: 'This is a genuine ApprovalRequest, visible in the Approvals panel, not a placeholder.',
      expectedState: 'pending',
      expectedEventSource: 'approval',
    },
    {
      id: 'enforcement-block',
      kind: 'enforcement',
      title: 'Action Enforcement blocks execution',
      description: 'AocGuard enforces the request; the decision is approval_required and the real executor callback never runs.',
      operatorNarration: 'The executor is never invoked -- this is the safety guarantee, not a UI restriction.',
      expectedState: 'approval_required',
      expectedEventSource: 'enforcement',
      metadata: { onlyIfExecuted: false },
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the blocked request',
      description: 'The Approvals panel shows a pending approval request; the Enforcement panel shows the blocked decision.',
      operatorNarration: 'Two panels tell the same story from two angles: pending approval, blocked execution.',
    },
    {
      id: 'operator-explanation',
      kind: 'operator_explanation',
      title: 'Explain the block',
      description: 'Summarize why the action was blocked and what would unlock it.',
      operatorNarration: 'The next scenario shows exactly how this unlocks once Victor approves.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-approval-request-exists',
      type: 'approval_state',
      title: 'Approval request exists',
      description: 'Recognition Runtime or the enforcement decision must reference a pending approval.',
      expected: 'outcome.status === "approval_required"',
    },
    {
      id: 'assert-enforcement-approval-required',
      type: 'enforcement_decision',
      title: 'Enforcement requires approval',
      description: 'The enforcement decision type must be approval_required.',
      expected: 'decision.type === "approval_required"',
    },
    {
      id: 'assert-executor-did-not-run',
      type: 'executor_safety',
      title: 'Executor did not run',
      description: 'The real executor callback must never run while approval is pending.',
      expected: 'exactly 0 executed enforcement outcomes',
    },
    {
      id: 'assert-side-effects-blocked',
      type: 'side_effect_state',
      title: 'Side effects blocked',
      description: 'No side effect may be marked executed for this request.',
      expected: 'sideEffectsExecuted === false',
    },
  ],
};

export const executeApprovalRequiredBlockScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [setupStep, recognitionStep, approvalRequestStep, enforcementStep, controlPlaneStep, explanationStep] =
    APPROVAL_REQUIRED_BLOCK_SCENARIO.steps;

  steps.push(
    completeStep(
      SCENARIO_ID,
      setupStep!,
      'passed',
      ctx.now(),
      ctx.now(),
      "PMFreak's communication capability token requires approval from Victor before send_client_follow_up may execute.",
      [world.fixture.world.pmfreak.id, world.fixture.world.victor.id],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const pending = await world.fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID }), () => {
    executorRuns += 1;
    return 'sent';
  });
  const completedAt = ctx.now();

  const recognitionPassed = pending.decision.type === 'approval_required' && pending.decision.recognitionDecisionId !== undefined;
  steps.push(
    completeStep(
      SCENARIO_ID,
      recognitionStep!,
      recognitionPassed ? 'passed' : 'failed',
      startedAt,
      completedAt,
      'Recognition Runtime deferred this request to human approval.',
      [world.fixture.world.pmfreak.id],
      pending.decision.recognitionDecisionId !== undefined ? [pending.decision.recognitionDecisionId] : [],
    ),
  );

  let approvalRequestId: string | undefined;
  if (pending.decision.recognitionDecisionId !== undefined) {
    const reference = world.fixture.recognitionRuntime.createApprovalRequestForDecision({
      recognitionDecisionId: pending.decision.recognitionDecisionId,
      actionRequestId: ACTION_REQUEST_ID,
      trustDomainId: world.trustDomainId,
      requestedByActorId: world.fixture.world.pmfreak.id,
      targetActorId: world.fixture.world.pmfreak.id,
      principalActorId: world.fixture.world.victor.id,
      action: pending.request.action,
      resourceScope: pending.request.resourceScope,
      riskLevel: 'high',
    });
    approvalRequestId = reference?.approvalRequestId;
  }
  steps.push(
    completeStep(
      SCENARIO_ID,
      approvalRequestStep!,
      approvalRequestId !== undefined ? 'passed' : 'failed',
      completedAt,
      completedAt,
      approvalRequestId !== undefined
        ? `Approval request ${approvalRequestId} is pending Victor's decision.`
        : 'Approval Runtime did not create a pending approval request.',
      [world.fixture.world.victor.id],
      approvalRequestId !== undefined ? [approvalRequestId] : [],
    ),
  );

  const enforcementPassed = pending.decision.type === 'approval_required' && !pending.decision.allowedToExecute;
  steps.push(
    completeStep(
      SCENARIO_ID,
      enforcementStep!,
      enforcementPassed ? 'passed' : 'failed',
      startedAt,
      completedAt,
      `Enforcement decision: ${pending.decision.type}. Executor ran ${executorRuns} time(s).`,
      [pending.request.id],
    ),
  );

  steps.push(
    completeStep(
      SCENARIO_ID,
      controlPlaneStep!,
      'passed',
      completedAt,
      completedAt,
      'Approvals panel shows the pending request; Enforcement panel shows the blocked decision.',
      approvalRequestId !== undefined ? [approvalRequestId] : [],
    ),
  );
  steps.push(
    completeStep(
      SCENARIO_ID,
      explanationStep!,
      'passed',
      completedAt,
      completedAt,
      'Operator walkthrough explains that Victor must approve before this action can execute.',
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, pending, executorRuns > 0),
    steps,
    enforcementOutcomes: [pending],
  };
  return result;
};

export const evaluateApprovalRequiredBlockAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const outcome = result.outcome;
  const executedCount = result.enforcementOutcomes.filter((o) => o.result.executed).length;

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      outcome.status === 'approval_required',
      outcome.status,
      outcome.status === 'approval_required' ? 'APPROVAL_PENDING' : 'APPROVAL_STATE_UNEXPECTED',
      `Outcome status was "${outcome.status}".`,
    ),
    assertionResult(
      SCENARIO_ID,
      defs[1]!.id,
      defs[1]!.type,
      defs[1]!.expected,
      outcome.status === 'approval_required',
      outcome.status,
      outcome.status === 'approval_required' ? 'ENFORCEMENT_APPROVAL_REQUIRED' : 'ENFORCEMENT_DECISION_UNEXPECTED',
      `Enforcement decision reason: ${outcome.reason}`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[2]!.id, defs[2]!.expected, 0, executedCount),
    assertionResult(
      SCENARIO_ID,
      defs[3]!.id,
      defs[3]!.type,
      defs[3]!.expected,
      !outcome.sideEffectsExecuted,
      String(outcome.sideEffectsExecuted),
      !outcome.sideEffectsExecuted ? 'SIDE_EFFECT_BLOCKED' : 'SIDE_EFFECT_EXECUTED_UNEXPECTEDLY',
      !outcome.sideEffectsExecuted ? 'No side effect executed while approval was pending.' : 'A side effect executed despite pending approval.',
    ),
  ];
};
