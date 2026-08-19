import { approveSendClientFollowUp, buildSendClientFollowUpGuardInput } from '../../action-enforcement/fixtures/approval-required-action.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { SEND_CLIENT_FOLLOW_UP } from '../fixtures/enterprise-demo-actions.fixture.js';
import { PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'idempotency-duplicate-suppressed';
const ACTION_REQUEST_ID = 'action-request-demo-idempotency';
const IDEMPOTENCY_KEY = 'idempotency-key-demo-follow-up';

export const IDEMPOTENCY_DUPLICATE_SUPPRESSED_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Duplicate Side Effect Suppressed by Idempotency',
  shortTitle: 'Idempotency Duplicate Suppressed',
  category: 'enforcement',
  summary:
    'The approved client follow-up is executed once with an idempotency key. The identical request and key are submitted again, and the duplicate is suppressed.',
  enterpriseMessage: 'Soberanía prevents duplicate side effects from retries, agent loops or webhook duplication.',
  buyerPain: 'Enterprises fear a retried webhook or a looping agent sending the same client email twice.',
  aocValue: 'A presented idempotency key ties repeated submissions to the same prior result -- the real executor never runs twice.',
  personas: [PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: SEND_CLIENT_FOLLOW_UP,
  capability: 'project_closure.client_communication',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'high',
  expectedOutcome: 'duplicate_suppressed',
  tags: ['enforcement', 'idempotency', 'duplicate'],
  steps: [
    {
      id: 'approval-decision',
      kind: 'approval',
      title: 'Victor approves the follow-up',
      description: 'Victor approves the send_client_follow_up request, producing a real ApprovalProof.',
      operatorNarration: 'Approval must exist before either enforcement call can succeed.',
      expectedEventSource: 'approval',
    },
    {
      id: 'enforcement-first-execution',
      kind: 'enforcement',
      title: 'First submission executes',
      description: 'The approved request is submitted with an idempotency key; enforcement allows it and the executor runs once.',
      operatorNarration: 'This is the real, first execution.',
      expectedState: 'execute_allowed',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'enforcement-duplicate-suppressed',
      kind: 'enforcement',
      title: 'Second submission is suppressed',
      description: 'The identical request and idempotency key are submitted again; enforcement returns duplicate_suppressed and the executor does not run.',
      operatorNarration: 'Same key, same prior success -- the real side effect happens only once.',
      expectedState: 'duplicate_suppressed',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the suppressed duplicate',
      description: 'The Enforcement panel shows both enforcement requests: one executed, one duplicate-suppressed, sharing the same idempotency key.',
      operatorNarration: 'The idempotency key is visible on both request rows.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-first-executed',
      type: 'enforcement_decision',
      title: 'First submission executed',
      description: 'The first enforcement decision must be execute_allowed and its result executed.',
      expected: 'first decision.type === "execute_allowed"',
    },
    {
      id: 'assert-second-duplicate-suppressed',
      type: 'enforcement_decision',
      title: 'Second submission is duplicate_suppressed',
      description: 'The second enforcement decision must be duplicate_suppressed.',
      expected: 'second decision.type === "duplicate_suppressed"',
    },
    {
      id: 'assert-executor-ran-once-total',
      type: 'executor_safety',
      title: 'Executor ran exactly once across both submissions',
      description: 'The real executor callback must run exactly once total, not once per submission.',
      expected: 'first execution 1 run, second execution 0 runs',
    },
    {
      id: 'assert-idempotency-key-visible',
      type: 'enforcement_decision',
      title: 'Idempotency key is visible on both requests',
      description: 'Both enforcement requests must carry the same idempotency key.',
      expected: 'both requests carry idempotencyKey',
    },
  ],
};

export const executeIdempotencyDuplicateSuppressedScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [approvalStep, firstStep, secondStep, controlPlaneStep] = IDEMPOTENCY_DUPLICATE_SUPPRESSED_SCENARIO.steps;

  const pendingStartedAt = ctx.now();
  const pending = await world.fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID }), () => 'unused');
  const approvalProofId = approveSendClientFollowUp(world.fixture, pending.decision.recognitionDecisionId!, ACTION_REQUEST_ID);
  const pendingCompletedAt = ctx.now();

  steps.push(
    completeStep(
      SCENARIO_ID,
      approvalStep!,
      'passed',
      pendingStartedAt,
      pendingCompletedAt,
      `Victor approved the request. Approval proof: ${approvalProofId}.`,
      [world.fixture.world.victor.id],
      [approvalProofId],
    ),
  );

  let firstExecutorRuns = 0;
  const firstStartedAt = ctx.now();
  const first = await world.fixture.aocGuard.enforce(
    buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID, approvalProofId, idempotencyKey: IDEMPOTENCY_KEY }),
    () => {
      firstExecutorRuns += 1;
      return 'sent';
    },
  );
  const firstCompletedAt = ctx.now();

  steps.push(
    completeStep(
      SCENARIO_ID,
      firstStep!,
      first.decision.type === 'execute_allowed' ? 'passed' : 'failed',
      firstStartedAt,
      firstCompletedAt,
      `First submission decision: ${first.decision.type}. Executor ran ${firstExecutorRuns} time(s).`,
      [first.request.id],
      first.proof !== undefined ? [first.proof.id] : [],
    ),
  );

  let secondExecutorRuns = 0;
  const secondStartedAt = ctx.now();
  const second = await world.fixture.aocGuard.enforce(
    buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID, approvalProofId, idempotencyKey: IDEMPOTENCY_KEY }),
    () => {
      secondExecutorRuns += 1;
      return 'sent-again';
    },
  );
  const secondCompletedAt = ctx.now();

  steps.push(
    completeStep(
      SCENARIO_ID,
      secondStep!,
      second.decision.type === 'duplicate_suppressed' ? 'passed' : 'failed',
      secondStartedAt,
      secondCompletedAt,
      `Second submission decision: ${second.decision.type}. Executor ran ${secondExecutorRuns} time(s).`,
      [second.request.id],
      second.proof !== undefined ? [second.proof.id] : [],
    ),
  );

  steps.push(
    completeStep(
      SCENARIO_ID,
      controlPlaneStep!,
      'passed',
      secondCompletedAt,
      secondCompletedAt,
      `Enforcement panel shows both requests sharing idempotency key ${IDEMPOTENCY_KEY}.`,
      [first.request.id, second.request.id],
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, second, secondExecutorRuns > 0),
    steps,
    enforcementOutcomes: [first, second],
  };
  return result;
};

export const evaluateIdempotencyDuplicateSuppressedAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const first = result.enforcementOutcomes[0]!;
  const second = result.enforcementOutcomes[1]!;
  const firstExecuted = first.decision.type === 'execute_allowed' && first.result.executed;
  const secondSuppressed = second.decision.type === 'duplicate_suppressed';
  const executorSafe = first.result.executed && !second.result.executed;
  const bothCarryKey = first.request.idempotencyKey !== undefined && second.request.idempotencyKey !== undefined && first.request.idempotencyKey === second.request.idempotencyKey;

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      firstExecuted,
      first.decision.type,
      firstExecuted ? 'FIRST_EXECUTED' : 'FIRST_NOT_EXECUTED',
      `First enforcement decision reason: ${first.decision.reason}`,
    ),
    assertionResult(
      SCENARIO_ID,
      defs[1]!.id,
      defs[1]!.type,
      defs[1]!.expected,
      secondSuppressed,
      second.decision.type,
      secondSuppressed ? 'DUPLICATE_SUPPRESSED' : 'DUPLICATE_NOT_SUPPRESSED',
      `Second enforcement decision reason: ${second.decision.reason}`,
    ),
    assertionResult(
      SCENARIO_ID,
      defs[2]!.id,
      'executor_safety',
      defs[2]!.expected,
      executorSafe,
      `first executed=${first.result.executed}, second executed=${second.result.executed}`,
      executorSafe ? 'EXECUTOR_SAFETY_CONFIRMED' : 'EXECUTOR_SAFETY_VIOLATION',
      executorSafe ? 'The real executor ran on the first submission only.' : 'The executor ran an unexpected number of times across submissions.',
    ),
    assertionResult(
      SCENARIO_ID,
      defs[3]!.id,
      defs[3]!.type,
      defs[3]!.expected,
      bothCarryKey,
      `first=${first.request.idempotencyKey ?? 'none'}, second=${second.request.idempotencyKey ?? 'none'}`,
      bothCarryKey ? 'IDEMPOTENCY_KEY_VISIBLE' : 'IDEMPOTENCY_KEY_MISSING',
      bothCarryKey ? 'Both requests carry the same idempotency key.' : 'The requests do not share an idempotency key.',
    ),
  ];
};
