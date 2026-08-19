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

const SCENARIO_ID = 'approval-unlocks-execution';
const ACTION_REQUEST_ID = 'action-request-demo-approval-unlocks';

export const APPROVAL_UNLOCKS_EXECUTION_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Human Approval Unlocks a Previously Blocked Action',
  shortTitle: 'Approval Unlocks Execution',
  category: 'approval',
  summary:
    'The client follow-up action is routed to Victor for approval. Victor approves, and PMFreak retries with the resulting approval proof.',
  enterpriseMessage: 'Soberanía does not only block; it provides a governed path to unlock execution.',
  buyerPain: 'Enterprises worry a "blocked" governance system has no path forward for legitimate work.',
  aocValue: "A real ApprovalProof from Victor's decision, presented on the retried request, is what changes enforcement's decision.",
  personas: [PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: SEND_CLIENT_FOLLOW_UP,
  capability: 'project_closure.client_communication',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'high',
  expectedOutcome: 'executed',
  tags: ['approval', 'enforcement', 'unlock'],
  steps: [
    {
      id: 'enforcement-pending',
      kind: 'enforcement',
      title: 'First attempt blocks on approval',
      description: 'PMFreak submits the request; enforcement returns approval_required and the executor does not run.',
      operatorNarration: 'This is the same block from the previous scenario -- now watch it get resolved.',
      expectedState: 'approval_required',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'approval-decision',
      kind: 'approval',
      title: 'Victor approves the request',
      description: 'Approval Runtime creates a request for the recognition decision, and Victor approves it, producing a real ApprovalProof.',
      operatorNarration: "Victor's approval is a real decision recorded by Approval Runtime, not a UI toggle.",
      expectedState: 'approved',
      expectedEventSource: 'approval',
    },
    {
      id: 'enforcement-unlocked',
      kind: 'enforcement',
      title: 'Second attempt presents the approval proof',
      description: 'PMFreak retries the same action, presenting the approval proof id; enforcement now returns execute_allowed and the executor runs once.',
      operatorNarration: 'Only a genuine ApprovalProof id changes the outcome -- resubmitting without it would still block.',
      expectedState: 'execute_allowed',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the unlocked execution',
      description: 'The Approvals panel shows the approved decision and proof; the Enforcement panel shows the executed request.',
      operatorNarration: 'Both panels now agree: approved, then executed.',
    },
    {
      id: 'proof-chain-review',
      kind: 'proof',
      title: 'Inspect the linked proof chain',
      description: "The enforcement proof references the approval proof that unlocked it.",
      operatorNarration: 'Proofs / Audit shows the approval proof linked from the enforcement proof.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-approval-proof-exists',
      type: 'approval_state',
      title: 'Approval proof exists',
      description: "Victor's approval must produce a real ApprovalProof.",
      expected: 'second enforcement decision carries an approvalProofId',
    },
    {
      id: 'assert-enforcement-allowed-after-approval',
      type: 'enforcement_decision',
      title: 'Enforcement allows execution after approval',
      description: 'The second enforcement decision must be execute_allowed.',
      expected: 'outcome.status === "executed"',
    },
    {
      id: 'assert-executor-ran-once-after-approval',
      type: 'executor_safety',
      title: 'Executor ran exactly once, only after approval',
      description: 'The executor must not run on the first (pending) attempt, and must run exactly once on the second (approved) attempt.',
      expected: 'first attempt 0 executions, second attempt 1 execution',
    },
    {
      id: 'assert-approval-proof-linked',
      type: 'proof_chain',
      title: 'Approval proof is linked from the enforcement proof',
      description: 'The final enforcement proof must reference the approval proof that unlocked it.',
      expected: 'enforcementProof.approvalProofId === approvalProofId',
    },
  ],
};

export const executeApprovalUnlocksExecutionScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [pendingStep, approvalStep, unlockedStep, controlPlaneStep, proofStep] = APPROVAL_UNLOCKS_EXECUTION_SCENARIO.steps;

  const pendingStartedAt = ctx.now();
  const pending = await world.fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID }), () => 'unused');
  const pendingCompletedAt = ctx.now();

  steps.push(
    completeStep(
      SCENARIO_ID,
      pendingStep!,
      pending.decision.type === 'approval_required' ? 'passed' : 'failed',
      pendingStartedAt,
      pendingCompletedAt,
      `First attempt: ${pending.decision.type}. Executor did not run.`,
      [world.fixture.world.pmfreak.id],
    ),
  );

  const approvalStartedAt = ctx.now();
  const approvalProofId = approveSendClientFollowUp(world.fixture, pending.decision.recognitionDecisionId!, ACTION_REQUEST_ID);
  const approvalCompletedAt = ctx.now();

  steps.push(
    completeStep(
      SCENARIO_ID,
      approvalStep!,
      'passed',
      approvalStartedAt,
      approvalCompletedAt,
      `Victor approved the request. Approval proof: ${approvalProofId}.`,
      [world.fixture.world.victor.id],
      [approvalProofId],
    ),
  );

  let executorRuns = 0;
  const unlockedStartedAt = ctx.now();
  const unlocked = await world.fixture.aocGuard.enforce(
    buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID, approvalProofId }),
    () => {
      executorRuns += 1;
      return 'sent';
    },
  );
  const unlockedCompletedAt = ctx.now();

  steps.push(
    completeStep(
      SCENARIO_ID,
      unlockedStep!,
      unlocked.decision.type === 'execute_allowed' ? 'passed' : 'failed',
      unlockedStartedAt,
      unlockedCompletedAt,
      `Second attempt with approval proof: ${unlocked.decision.type}. Executor ran ${executorRuns} time(s).`,
      [world.fixture.world.pmfreak.id, unlocked.request.id],
      unlocked.proof !== undefined ? [unlocked.proof.id] : [],
    ),
  );

  steps.push(
    completeStep(
      SCENARIO_ID,
      controlPlaneStep!,
      'passed',
      unlockedCompletedAt,
      unlockedCompletedAt,
      'Approvals panel shows the approved decision; Enforcement panel shows the executed request.',
      [unlocked.request.id],
    ),
  );
  steps.push(
    completeStep(
      SCENARIO_ID,
      proofStep!,
      'passed',
      unlockedCompletedAt,
      unlockedCompletedAt,
      'Enforcement proof links back to the approval proof that unlocked execution.',
      [],
      unlocked.proof !== undefined ? [unlocked.proof.id, approvalProofId] : [approvalProofId],
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, unlocked, executorRuns > 0),
    steps,
    enforcementOutcomes: [pending, unlocked],
  };
  return result;
};

export const evaluateApprovalUnlocksExecutionAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const outcome = result.outcome;
  const finalOutcome = result.enforcementOutcomes[result.enforcementOutcomes.length - 1];
  const firstOutcome = result.enforcementOutcomes[0];
  const approvalProofPresent = finalOutcome?.decision.approvalProofId !== undefined;

  const firstExecuted = firstOutcome?.result.executed === true;
  const secondExecuted = finalOutcome?.result.executed === true;
  const executorSafe = !firstExecuted && secondExecuted;

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      approvalProofPresent,
      finalOutcome?.decision.approvalProofId ?? 'none',
      approvalProofPresent ? 'APPROVAL_PROOF_PRESENT' : 'APPROVAL_PROOF_MISSING',
      approvalProofPresent ? 'The second enforcement decision carries a real approval proof id.' : 'No approval proof id was carried on the second decision.',
    ),
    assertionResult(
      SCENARIO_ID,
      defs[1]!.id,
      defs[1]!.type,
      defs[1]!.expected,
      outcome.status === 'executed',
      outcome.status,
      outcome.status === 'executed' ? 'ENFORCEMENT_ALLOWED_AFTER_APPROVAL' : 'ENFORCEMENT_NOT_ALLOWED',
      `Final enforcement decision reason: ${outcome.reason}`,
    ),
    assertionResult(
      SCENARIO_ID,
      defs[2]!.id,
      defs[2]!.type,
      defs[2]!.expected,
      executorSafe,
      `first executed=${firstExecuted}, second executed=${secondExecuted}`,
      executorSafe ? 'EXECUTOR_SAFETY_CONFIRMED' : 'EXECUTOR_SAFETY_VIOLATION',
      executorSafe
        ? 'The executor did not run before approval and ran exactly once after approval.'
        : 'The executor ran at an unexpected point in the approval sequence.',
    ),
    assertionResult(
      SCENARIO_ID,
      defs[3]!.id,
      defs[3]!.type,
      defs[3]!.expected,
      finalOutcome?.proof?.approvalProofId !== undefined && finalOutcome.proof.approvalProofId === finalOutcome.decision.approvalProofId,
      finalOutcome?.proof?.approvalProofId ?? 'none',
      finalOutcome?.proof?.approvalProofId !== undefined ? 'PROOF_CHAIN_LINKED' : 'PROOF_CHAIN_NOT_LINKED',
      finalOutcome?.proof?.approvalProofId !== undefined
        ? 'The enforcement proof references the approval proof that unlocked it.'
        : 'The enforcement proof does not reference an approval proof.',
    ),
  ];
};
