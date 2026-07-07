import { buildSettleEventPaymentRequiresEvidenceInput, SETTLE_EVENT_PAYMENT } from '../fixtures/enterprise-demo-policy-pack.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion, policyDecisionAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'policy-pack-sports-settlement-event-record-required';
const MATCHED_RULE_ID = 'sports-settlement-basic-rule-event-record-evidence';

export const POLICY_PACK_SPORTS_SETTLEMENT_EVENT_RECORD_REQUIRED_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Event Settlement Blocked Pending Event Record Evidence',
  shortTitle: 'Policy: Settlement Needs Event Record',
  category: 'policy_packs',
  summary:
    'PMFreak (delegated event-settlement authority from Victor) attempts settle_event_payment for a below-threshold amount with a known counterparty, but without the event_record evidence the sports-event-settlement-basic policy pack requires.',
  enterpriseMessage: 'AOC can require event records before smart-contract or payment settlement actions are executed.',
  buyerPain: 'Enterprises automating sports/event settlement payments cannot let an agent release funds without a verified record of the event outcome it is settling against.',
  aocValue:
    'The sports-event-settlement-basic policy pack requires event_record evidence for settle_event_payment; Action Enforcement blocks the settlement until that evidence is attached, even though authority and counterparty checks already pass.',
  personas: [PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: SETTLE_EVENT_PAYMENT,
  capability: 'events.settlement',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'critical',
  expectedOutcome: 'evidence_required',
  tags: ['policy_packs', 'sports_event_settlement', 'evidence', 'blocked'],
  steps: [
    {
      id: 'setup-world',
      kind: 'setup',
      title: 'Establish the sports-event-settlement-basic policy pack',
      description: 'The sports-event-settlement-basic policy pack requires event_record evidence for settle_event_payment; PMFreak holds authority delegated from Victor and a known counterparty, but no event record.',
      operatorNarration: 'This is a demo-only sample pack for agent-managed settlement, not tied to any real jurisdiction\'s licensing regime.',
    },
    {
      id: 'policy-evaluation',
      kind: 'enforcement',
      title: 'Domain Policy Pack Runtime requires event record evidence',
      description: 'Action Enforcement preflight consults the policy pack integration; sports-event-settlement-basic matches and requires event_record evidence.',
      operatorNarration: 'This blocks below the pack\'s own approval threshold, so it is purely an evidence gate here, not an approval gate.',
      expectedState: 'policy_requires_evidence',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'enforcement-block',
      kind: 'enforcement',
      title: 'Action Enforcement blocks execution',
      description: 'AocGuard enforces the request through the policy-pack-configured runtime; the decision is evidence_required and the real executor never runs.',
      operatorNarration: 'The blocked decision carries the policy decision/proof ids and the event_record evidence requirement.',
      expectedState: 'evidence_required',
      expectedEventSource: 'enforcement',
      metadata: { onlyIfExecuted: false },
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the required event record',
      description: 'The Policy Packs panel shows the matched event-record evidence rule; the Enforcement panel shows the blocked settlement decision.',
      operatorNarration: 'Open Policy Packs to see the exact event_record evidence type required before settlement.',
    },
    {
      id: 'operator-explanation',
      kind: 'operator_explanation',
      title: 'Explain the evidence gate',
      description: 'Summarize that event settlement cannot proceed without a verified event record, per the enterprise policy pack.',
      operatorNarration: 'This demo pack models an enterprise policy requirement, not a licensing or regulatory conclusion.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-outcome-evidence-required',
      type: 'enforcement_decision',
      title: 'Outcome is evidence_required',
      description: 'The scenario outcome status must be evidence_required.',
      expected: 'outcome.status === "evidence_required"',
    },
    {
      id: 'assert-executor-did-not-run',
      type: 'executor_safety',
      title: 'Executor did not run',
      description: 'The real executor callback must never run while event_record evidence is missing.',
      expected: 'exactly 0 executed enforcement outcomes',
    },
    {
      id: 'assert-policy-decision-referenced',
      type: 'policy_decision',
      title: 'Event record evidence requirement referenced with proof',
      description: 'The outcome must carry a real policy decision id and policy proof id, matching the event-record-evidence rule.',
      expected: `outcome.policyMatchedRuleIds includes "${MATCHED_RULE_ID}"`,
    },
  ],
};

export const executePolicyPackSportsSettlementEventRecordRequiredScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [setupStep, policyStep, enforcementStep, controlPlaneStep, explanationStep] =
    POLICY_PACK_SPORTS_SETTLEMENT_EVENT_RECORD_REQUIRED_SCENARIO.steps;

  steps.push(
    completeStep(
      SCENARIO_ID,
      setupStep!,
      'passed',
      ctx.now(),
      ctx.now(),
      'sports-event-settlement-basic is registered and active; PMFreak\'s settlement request carries a known counterparty but no event_record evidence.',
      [world.fixture.world.pmfreak.id, world.fixture.world.victor.id],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.policyPackAocGuard.enforce(buildSettleEventPaymentRequiresEvidenceInput(), () => {
    executorRuns += 1;
    return 'event payment settled';
  });
  const completedAt = ctx.now();

  const policyMatched = outcome.decision.policyMatchedRuleIds?.includes(MATCHED_RULE_ID) ?? false;
  steps.push(
    completeStep(
      SCENARIO_ID,
      policyStep!,
      policyMatched ? 'passed' : 'failed',
      startedAt,
      completedAt,
      `Policy decision: ${outcome.decision.policyReasonCode ?? 'none'}. Matched rules: ${(outcome.decision.policyMatchedRuleIds ?? []).join(', ') || 'none'}.`,
      [world.fixture.world.pmfreak.id],
      outcome.decision.policyDecisionId !== undefined ? [outcome.decision.policyDecisionId] : [],
    ),
  );

  const enforcementPassed = outcome.decision.type === 'evidence_required' && !outcome.decision.allowedToExecute;
  steps.push(
    completeStep(
      SCENARIO_ID,
      enforcementStep!,
      enforcementPassed ? 'passed' : 'failed',
      startedAt,
      completedAt,
      `Enforcement decision: ${outcome.decision.type}. Executor ran ${executorRuns} time(s).`,
      [outcome.request.id],
      outcome.proof !== undefined ? [outcome.proof.id] : [],
    ),
  );

  steps.push(
    completeStep(
      SCENARIO_ID,
      controlPlaneStep!,
      'passed',
      completedAt,
      completedAt,
      'Policy Packs panel shows the matched event-record evidence rule; Enforcement panel shows the blocked decision.',
      outcome.decision.policyDecisionId !== undefined ? [outcome.decision.policyDecisionId] : [],
    ),
  );
  steps.push(
    completeStep(
      SCENARIO_ID,
      explanationStep!,
      'passed',
      completedAt,
      completedAt,
      'Operator walkthrough explains that a verified event record is required before this settlement can execute.',
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluatePolicyPackSportsSettlementEventRecordRequiredAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const outcome = result.outcome;
  const executedCount = result.enforcementOutcomes.filter((o) => o.result.executed).length;

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      outcome.status === 'evidence_required',
      outcome.status,
      outcome.status === 'evidence_required' ? 'POLICY_EVENT_RECORD_PENDING' : 'POLICY_OUTCOME_UNEXPECTED',
      `Outcome status was "${outcome.status}".`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[1]!.id, defs[1]!.expected, 0, executedCount),
    policyDecisionAssertion(SCENARIO_ID, defs[2]!.id, defs[2]!.expected, outcome, MATCHED_RULE_ID),
  ];
};
