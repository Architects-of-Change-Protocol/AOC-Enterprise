import { buildApprovePaymentRequiresFinanceReviewInput } from '../fixtures/enterprise-demo-policy-pack.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { APPROVE_PAYMENT } from '../fixtures/enterprise-demo-actions.fixture.js';
import { FINANCE_APPROVER_PERSONA_ID, PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion, policyDecisionAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'policy-pack-payment-approval-required';
const MATCHED_RULE_ID = 'payments-basic-rule-approve-payment-finance-review';

export const POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Payment Approval Blocked Pending Finance Review',
  shortTitle: 'Policy: Payment Needs Finance Review',
  category: 'policy_packs',
  summary: 'PMFreak Closure Agent attempts approve_payment under the payments-basic policy pack, which requires a finance_review approval before any payment approval action may proceed.',
  enterpriseMessage: 'AOC can prevent autonomous financial execution unless the enterprise policy pack requires and receives finance approval.',
  buyerPain: 'Enterprises cannot let an autonomous agent approve a payment on its own -- they need a policy-enforced finance review gate, not a trust exercise.',
  aocValue:
    'The payments-basic policy pack is evaluated by Action Enforcement during preflight; it requires a finance_review approval before approve_payment may proceed, and enforcement blocks execution until that approval exists -- exactly like every other AOC governance layer.',
  personas: [PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID, FINANCE_APPROVER_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: APPROVE_PAYMENT,
  capability: 'payments.approval',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'critical',
  expectedOutcome: 'approval_required',
  tags: ['policy_packs', 'payments', 'approval', 'blocked'],
  steps: [
    {
      id: 'setup-world',
      kind: 'setup',
      title: 'Establish the payments-basic policy pack',
      description: 'The payments-basic policy pack is registered and active; its finance-review rule applies to every approve_payment action, independent of recognition, authority or approval state.',
      operatorNarration: 'This rule exists on the policy pack itself -- it is not something invented for this demo.',
    },
    {
      id: 'policy-evaluation',
      kind: 'enforcement',
      title: 'Domain Policy Pack Runtime evaluates approve_payment',
      description: 'Action Enforcement preflight consults the policy pack integration; payments-basic matches and requires a finance_review approval.',
      operatorNarration: 'This evaluation happens even though Recognition and Authority already allow this request -- policy packs are an additional, independent layer.',
      expectedState: 'policy_requires_approval',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'enforcement-block',
      kind: 'enforcement',
      title: 'Action Enforcement blocks execution',
      description: 'AocGuard enforces the request through the policy-pack-configured runtime; the decision is approval_required and the real executor never runs.',
      operatorNarration: 'The blocked decision carries both the enforcement reason and the policy decision/proof ids that produced it.',
      expectedState: 'approval_required',
      expectedEventSource: 'enforcement',
      metadata: { onlyIfExecuted: false },
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the policy-blocked payment',
      description: 'The Policy Packs panel shows the matched finance-review rule and approval requirement; the Enforcement panel shows the blocked decision referencing the same policy decision id.',
      operatorNarration: 'Open Policy Packs to see the matched rule, then Enforcement to see it enforced.',
    },
    {
      id: 'operator-explanation',
      kind: 'operator_explanation',
      title: 'Explain the block',
      description: 'Summarize that AOC blocks financial execution until finance review exists, per the payments-basic demo policy pack.',
      operatorNarration: 'This demo pack models an enterprise policy requirement; a customer- or counsel-validated pack could encode real customer policy.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-outcome-approval-required',
      type: 'enforcement_decision',
      title: 'Outcome is approval_required',
      description: 'The scenario outcome status must be approval_required.',
      expected: 'outcome.status === "approval_required"',
    },
    {
      id: 'assert-executor-did-not-run',
      type: 'executor_safety',
      title: 'Executor did not run',
      description: 'The real executor callback must never run while finance review is pending.',
      expected: 'exactly 0 executed enforcement outcomes',
    },
    {
      id: 'assert-policy-decision-referenced',
      type: 'policy_decision',
      title: 'Policy decision and proof referenced',
      description: 'The outcome must carry a real policy decision id and policy proof id, matching the finance-review rule.',
      expected: `outcome.policyMatchedRuleIds includes "${MATCHED_RULE_ID}"`,
    },
  ],
};

export const executePolicyPackPaymentApprovalRequiredScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [setupStep, policyStep, enforcementStep, controlPlaneStep, explanationStep] = POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO.steps;

  steps.push(
    completeStep(
      SCENARIO_ID,
      setupStep!,
      'passed',
      ctx.now(),
      ctx.now(),
      'payments-basic is registered and active on the policy-pack-configured enforcement runtime.',
      [world.fixture.world.pmfreak.id],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.policyPackAocGuard.enforce(buildApprovePaymentRequiresFinanceReviewInput(), () => {
    executorRuns += 1;
    return 'payment approved';
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

  const enforcementPassed = outcome.decision.type === 'approval_required' && !outcome.decision.allowedToExecute;
  steps.push(
    completeStep(
      SCENARIO_ID,
      enforcementStep!,
      enforcementPassed ? 'passed' : 'failed',
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
      'Policy Packs panel shows the matched finance-review rule; Enforcement panel shows the blocked decision.',
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
      'Operator walkthrough explains that finance review is required before this payment can execute.',
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluatePolicyPackPaymentApprovalRequiredAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
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
      outcome.status === 'approval_required' ? 'POLICY_APPROVAL_PENDING' : 'POLICY_OUTCOME_UNEXPECTED',
      `Outcome status was "${outcome.status}".`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[1]!.id, defs[1]!.expected, 0, executedCount),
    policyDecisionAssertion(SCENARIO_ID, defs[2]!.id, defs[2]!.expected, outcome, MATCHED_RULE_ID),
  ];
};
