import { buildTrustedPartnerReadGuardInput, completeTrustedPartnerHandshake } from '../../action-enforcement/fixtures/external-agent-action.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { READ_PROJECT_SUMMARY } from '../fixtures/enterprise-demo-actions.fixture.js';
import { TRUSTED_PARTNER_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PROJECT_SCOPE, TRUST_DOMAIN_ID, TRUSTED_PARTNER_AGENT_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'expired-visa-block';

export const EXPIRED_VISA_BLOCK_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'External Agent Blocked After Visa Expiration',
  shortTitle: 'Expired Visa Block',
  category: 'external_agents',
  summary: 'Trusted Partner Research Agent attempts the same read after its visa has expired.',
  enterpriseMessage: 'Soberanía access is time-bound and automatically loses standing when expired.',
  buyerPain: 'Enterprises need external access to expire automatically, not rely on someone remembering to revoke it.',
  aocValue: 'Handshake Runtime marks the visa expired, and Recognition Runtime denies external standing on every subsequent check.',
  personas: [TRUSTED_PARTNER_PERSONA_ID],
  primaryActorId: TRUSTED_PARTNER_AGENT_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: READ_PROJECT_SUMMARY,
  capability: READ_PROJECT_SUMMARY,
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'low',
  expectedOutcome: 'blocked',
  tags: ['external_agents', 'handshake', 'expired', 'blocked'],
  steps: [
    {
      id: 'external-handshake',
      kind: 'external_handshake',
      title: 'External Agent Handshake completes',
      description: 'Trusted Partner Research Agent completes a handshake and receives a visa and ingress grant, exactly as in the limited-visa scenario.',
      operatorNarration: 'Same successful handshake as before -- the difference is what happens next.',
      expectedState: 'accepted',
      expectedEventSource: 'handshake',
    },
    {
      id: 'visa-expires',
      kind: 'external_handshake',
      title: 'The visa expires',
      description: "Handshake Runtime marks the agent's visa expired.",
      operatorNarration: 'In production this happens automatically when the TTL elapses; here it is driven directly for determinism.',
      expectedState: 'expired',
      expectedEventSource: 'handshake',
    },
    {
      id: 'enforcement-block',
      kind: 'enforcement',
      title: 'Action Enforcement blocks the retry',
      description: 'The agent retries the same read; enforcement now blocks because external standing is no longer valid.',
      operatorNarration: 'The executor never runs -- an expired visa cannot be worked around by resubmitting.',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the expired visa',
      description: 'The External Agents panel shows the visa status as expired and the Enforcement panel shows the blocked decision.',
      operatorNarration: 'Both panels reflect the same real state change.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-visa-expired',
      type: 'handshake_state',
      title: 'Visa is expired',
      description: 'The agent visa must be in the expired status.',
      expected: 'visa.status === "expired"',
    },
    {
      id: 'assert-enforcement-blocked',
      type: 'enforcement_decision',
      title: 'Enforcement blocks the retry',
      description: 'The enforcement decision must not allow execution.',
      expected: 'decision.allowedToExecute === false',
    },
    {
      id: 'assert-executor-did-not-run',
      type: 'executor_safety',
      title: 'Executor did not run',
      description: 'The real executor callback must never run once the visa is expired.',
      expected: 'exactly 0 executed enforcement outcomes',
    },
  ],
};

export const executeExpiredVisaBlockScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [handshakeStep, expireStep, enforcementStep, controlPlaneStep] = EXPIRED_VISA_BLOCK_SCENARIO.steps;

  const handshakeStartedAt = ctx.now();
  const handshake = completeTrustedPartnerHandshake(world.fixture, 'handshake-request-demo-expired-visa');
  const handshakeCompletedAt = ctx.now();

  const handshakeAccepted = handshake.decision.type === 'accepted' || handshake.decision.type === 'accepted_limited';
  steps.push(
    completeStep(
      SCENARIO_ID,
      handshakeStep!,
      handshakeAccepted ? 'passed' : 'failed',
      handshakeStartedAt,
      handshakeCompletedAt,
      `Handshake decision: ${handshake.decision.type}. Visa: ${handshake.visa?.id ?? 'none'}.`,
      [TRUSTED_PARTNER_AGENT_ID],
      handshake.proof !== undefined ? [handshake.proof.id] : [],
    ),
  );

  const expireStartedAt = ctx.now();
  let expiredVisaId: string | undefined;
  if (handshake.visa !== undefined) {
    const expired = world.fixture.handshakeRuntime.expireAgentVisa(handshake.visa.id);
    expiredVisaId = expired.id;
  }
  const expireCompletedAt = ctx.now();
  steps.push(
    completeStep(
      SCENARIO_ID,
      expireStep!,
      expiredVisaId !== undefined ? 'passed' : 'failed',
      expireStartedAt,
      expireCompletedAt,
      expiredVisaId !== undefined ? `Visa ${expiredVisaId} is now expired.` : 'No visa was issued to expire.',
      [TRUSTED_PARTNER_AGENT_ID],
      expiredVisaId !== undefined ? [expiredVisaId] : [],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.aocGuard.enforce(buildTrustedPartnerReadGuardInput(handshake), () => {
    executorRuns += 1;
    return 'summary';
  });
  const completedAt = ctx.now();

  const enforcementBlocked = !outcome.decision.allowedToExecute;
  steps.push(
    completeStep(
      SCENARIO_ID,
      enforcementStep!,
      enforcementBlocked ? 'passed' : 'failed',
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
      'External Agents panel shows the expired visa; Enforcement panel shows the blocked decision.',
      expiredVisaId !== undefined ? [expiredVisaId] : [],
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0, 'blocked'),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluateExpiredVisaBlockAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const outcome = result.outcome;
  const executedCount = result.enforcementOutcomes.filter((o) => o.result.executed).length;
  const finalOutcome = result.enforcementOutcomes[result.enforcementOutcomes.length - 1];
  const visaExpiredStep = result.steps.find((step) => step.stepId === 'visa-expires');
  const visaExpired = visaExpiredStep?.status === 'passed';

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      visaExpired,
      visaExpiredStep?.summary ?? 'visa expiry step missing',
      visaExpired ? 'VISA_EXPIRED' : 'VISA_STATE_UNEXPECTED',
      'The visa was explicitly expired before this request was retried.',
    ),
    assertionResult(
      SCENARIO_ID,
      defs[1]!.id,
      defs[1]!.type,
      defs[1]!.expected,
      !finalOutcome!.decision.allowedToExecute,
      String(finalOutcome!.decision.allowedToExecute),
      !finalOutcome!.decision.allowedToExecute ? 'ENFORCEMENT_BLOCKED' : 'ENFORCEMENT_UNEXPECTEDLY_ALLOWED',
      `Enforcement decision reason: ${outcome.reason}`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[2]!.id, defs[2]!.expected, 0, executedCount),
  ];
};
