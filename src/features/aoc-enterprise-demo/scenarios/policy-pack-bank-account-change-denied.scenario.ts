import { buildChangeBankAccountDeniedInput } from '../fixtures/enterprise-demo-policy-pack.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { CHANGE_BANK_ACCOUNT } from '../fixtures/enterprise-demo-actions.fixture.js';
import { VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PROJECT_SCOPE, TRUST_DOMAIN_ID, VICTOR_ACTOR_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion, policyDecisionAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'policy-pack-bank-account-change-denied';
const MATCHED_RULE_ID = 'payments-basic-rule-change-bank-account-denied';

export const POLICY_PACK_BANK_ACCOUNT_CHANGE_DENIED_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Bank Account Change Denied by Policy Pack',
  shortTitle: 'Policy: Bank Account Denied',
  category: 'policy_packs',
  summary: 'Victor attempts change_bank_account; the payments-basic policy pack denies bank account changes by default, regardless of recognition, authority or approval state.',
  enterpriseMessage: 'AOC can enforce hard-deny enterprise policies at execution time, independent of every other governance layer already having allowed the request.',
  buyerPain: 'A single misconfigured or compromised actor should never be able to redirect settlement funds -- enterprises need a hard, policy-enforced deny on bank account changes.',
  aocValue:
    'The payments-basic policy pack denies change_bank_account by default; Action Enforcement blocks the request even though Recognition, Authority and Approval all consider it a valid, in-scope action.',
  personas: [VICTOR_PERSONA_ID],
  primaryActorId: VICTOR_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: CHANGE_BANK_ACCOUNT,
  capability: 'finance.bank_details',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'critical',
  expectedOutcome: 'blocked',
  tags: ['policy_packs', 'payments', 'denied', 'blocked'],
  steps: [
    {
      id: 'setup-world',
      kind: 'setup',
      title: 'Establish the payments-basic policy pack',
      description: 'The payments-basic policy pack denies change_bank_account by default unless customer policy metadata explicitly allows it -- Victor has not been granted that override.',
      operatorNarration: 'This is a deny-by-default rule, not an evidence or approval gate.',
    },
    {
      id: 'policy-evaluation',
      kind: 'enforcement',
      title: 'Domain Policy Pack Runtime denies the request',
      description: 'Action Enforcement preflight consults the policy pack integration; payments-basic matches and denies the action outright.',
      operatorNarration: 'A deny is not a pending state -- there is no approval or evidence that unlocks it.',
      expectedState: 'policy_denied',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'enforcement-block',
      kind: 'enforcement',
      title: 'Action Enforcement blocks execution',
      description: 'AocGuard enforces the request through the policy-pack-configured runtime; the decision is execution_blocked and the real executor never runs.',
      operatorNarration: 'The blocked decision carries the policy decision/proof ids that produced the denial.',
      expectedState: 'execution_blocked',
      expectedEventSource: 'enforcement',
      metadata: { onlyIfExecuted: false },
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the policy denial',
      description: 'The Policy Packs panel shows the matched deny rule and its policy proof; the Enforcement panel shows the blocked decision.',
      operatorNarration: 'Open Proofs / Audit to see the policy proof hash backing this denial.',
    },
    {
      id: 'operator-explanation',
      kind: 'operator_explanation',
      title: 'Explain the denial',
      description: 'Summarize that this action is hard-denied by the enterprise policy pack, not merely blocked pending review.',
      operatorNarration: 'This demo pack models an enterprise policy requirement; it is not a legal or compliance conclusion.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-outcome-blocked',
      type: 'enforcement_decision',
      title: 'Outcome is blocked',
      description: 'The scenario outcome status must be blocked.',
      expected: 'outcome.status === "blocked"',
    },
    {
      id: 'assert-executor-did-not-run',
      type: 'executor_safety',
      title: 'Executor did not run',
      description: 'The real executor callback must never run while the policy pack denies the action.',
      expected: 'exactly 0 executed enforcement outcomes',
    },
    {
      id: 'assert-policy-decision-referenced',
      type: 'policy_decision',
      title: 'Policy denial referenced with proof',
      description: 'The outcome must carry a real policy decision id and policy proof id, matching the bank-account-denial rule.',
      expected: `outcome.policyMatchedRuleIds includes "${MATCHED_RULE_ID}"`,
    },
  ],
};

export const executePolicyPackBankAccountChangeDeniedScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [setupStep, policyStep, enforcementStep, controlPlaneStep, explanationStep] = POLICY_PACK_BANK_ACCOUNT_CHANGE_DENIED_SCENARIO.steps;

  steps.push(
    completeStep(
      SCENARIO_ID,
      setupStep!,
      'passed',
      ctx.now(),
      ctx.now(),
      'payments-basic is registered and active; its bank-account-change rule denies this action by default.',
      [world.fixture.world.victor.id],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.policyPackAocGuard.enforce(buildChangeBankAccountDeniedInput(), () => {
    executorRuns += 1;
    return 'bank account changed';
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
      [world.fixture.world.victor.id],
      outcome.decision.policyDecisionId !== undefined ? [outcome.decision.policyDecisionId] : [],
    ),
  );

  const enforcementPassed = outcome.decision.type === 'execution_blocked' && !outcome.decision.allowedToExecute;
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
      'Policy Packs panel shows the matched deny rule; Enforcement panel shows the blocked decision.',
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
      'Operator walkthrough explains that this action is hard-denied by policy, not pending review.',
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluatePolicyPackBankAccountChangeDeniedAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const outcome = result.outcome;
  const executedCount = result.enforcementOutcomes.filter((o) => o.result.executed).length;

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      outcome.status === 'blocked',
      outcome.status,
      outcome.status === 'blocked' ? 'POLICY_DENIED' : 'POLICY_OUTCOME_UNEXPECTED',
      `Outcome status was "${outcome.status}".`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[1]!.id, defs[1]!.expected, 0, executedCount),
    policyDecisionAssertion(SCENARIO_ID, defs[2]!.id, defs[2]!.expected, outcome, MATCHED_RULE_ID),
  ];
};
