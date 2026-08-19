import { buildPrepareInvoiceSupportRequiresEvidenceInput } from '../fixtures/enterprise-demo-policy-pack.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { PREPARE_INVOICE_SUPPORT } from '../fixtures/enterprise-demo-actions.fixture.js';
import { PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion, policyDecisionAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'policy-pack-invoice-evidence-required';
const MATCHED_RULE_ID = 'procurement-basic-rule-invoice-support-evidence';

export const POLICY_PACK_INVOICE_EVIDENCE_REQUIRED_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Invoice Support Blocked Pending Purchase Order Evidence',
  shortTitle: 'Policy: Invoice Evidence Required',
  category: 'policy_packs',
  summary:
    'PMFreak Closure Agent attempts prepare_invoice_support with its own capability-token evidence requirement satisfied, but without the purchase_order/invoice evidence the procurement-basic policy pack independently requires.',
  enterpriseMessage: 'Soberanía does not let agents proceed with procurement workflows unless required supporting evidence exists, even after every core Soberanía layer has already allowed the request.',
  buyerPain: "Enterprises need proof an agent had the right purchase-order documentation before it touched procurement -- a capability token's own evidence rule is not the whole policy.",
  aocValue:
    'The procurement-basic policy pack requires purchase_order (or invoice) evidence for prepare_invoice_support independently of Recognition Runtime\'s own evidence check; Action Enforcement blocks execution until that evidence is attached.',
  personas: [PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: PREPARE_INVOICE_SUPPORT,
  capability: 'project_closure.invoice_support',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'medium',
  expectedOutcome: 'evidence_required',
  tags: ['policy_packs', 'procurement', 'evidence', 'blocked'],
  steps: [
    {
      id: 'setup-world',
      kind: 'setup',
      title: 'Establish the procurement-basic policy pack',
      description: 'The procurement-basic policy pack requires purchase_order (or invoice) evidence for prepare_invoice_support, and a known vendor counterparty.',
      operatorNarration: 'PMFreak already satisfies Recognition Runtime\'s own invoice_backup evidence requirement -- this is a second, independent policy check.',
    },
    {
      id: 'policy-evaluation',
      kind: 'enforcement',
      title: 'Domain Policy Pack Runtime requires evidence',
      description: 'Action Enforcement preflight consults the policy pack integration; procurement-basic matches and requires purchase-order evidence.',
      operatorNarration: 'This blocks even though every core Soberanía layer -- recognition, authority -- already allowed the request.',
      expectedState: 'policy_requires_evidence',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'enforcement-block',
      kind: 'enforcement',
      title: 'Action Enforcement blocks execution',
      description: 'AocGuard enforces the request through the policy-pack-configured runtime; the decision is evidence_required and the real executor never runs.',
      operatorNarration: 'The blocked decision carries the policy decision/proof ids alongside the evidence requirement.',
      expectedState: 'evidence_required',
      expectedEventSource: 'enforcement',
      metadata: { onlyIfExecuted: false },
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the required evidence',
      description: 'The Policy Packs panel shows the matched evidence rule and its purchase_order requirement; the Enforcement panel shows the blocked decision.',
      operatorNarration: 'Open Policy Packs to see the exact evidence type required.',
    },
    {
      id: 'operator-explanation',
      kind: 'operator_explanation',
      title: 'Explain evidence-backed execution',
      description: 'Summarize that Soberanía does not let procurement workflows proceed without the policy-required evidence.',
      operatorNarration: 'This demo pack models an enterprise policy requirement, not a legal conclusion.',
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
      description: 'The real executor callback must never run while purchase-order evidence is missing.',
      expected: 'exactly 0 executed enforcement outcomes',
    },
    {
      id: 'assert-policy-decision-referenced',
      type: 'policy_decision',
      title: 'Policy evidence requirement referenced with proof',
      description: 'The outcome must carry a real policy decision id and policy proof id, matching the purchase-order-evidence rule.',
      expected: `outcome.policyMatchedRuleIds includes "${MATCHED_RULE_ID}"`,
    },
  ],
};

export const executePolicyPackInvoiceEvidenceRequiredScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [setupStep, policyStep, enforcementStep, controlPlaneStep, explanationStep] = POLICY_PACK_INVOICE_EVIDENCE_REQUIRED_SCENARIO.steps;

  steps.push(
    completeStep(
      SCENARIO_ID,
      setupStep!,
      'passed',
      ctx.now(),
      ctx.now(),
      'procurement-basic is registered and active; PMFreak\'s request carries a known vendor counterparty but no purchase-order evidence.',
      [world.fixture.world.pmfreak.id],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.policyPackAocGuard.enforce(buildPrepareInvoiceSupportRequiresEvidenceInput(), () => {
    executorRuns += 1;
    return 'invoice support prepared';
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
      'Policy Packs panel shows the matched purchase-order evidence rule; Enforcement panel shows the blocked decision.',
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
      'Operator walkthrough explains that purchase-order evidence is required before this procurement action can execute.',
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluatePolicyPackInvoiceEvidenceRequiredAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
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
      outcome.status === 'evidence_required' ? 'POLICY_EVIDENCE_PENDING' : 'POLICY_OUTCOME_UNEXPECTED',
      `Outcome status was "${outcome.status}".`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[1]!.id, defs[1]!.expected, 0, executedCount),
    policyDecisionAssertion(SCENARIO_ID, defs[2]!.id, defs[2]!.expected, outcome, MATCHED_RULE_ID),
  ];
};
