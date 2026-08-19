import {
  buildApprovePaymentRequiresFinanceReviewInput,
  buildChangeBankAccountDeniedInput,
  buildExportClientDataProhibitedInput,
  buildExportClientDataRequiresComplianceReviewInput,
  buildPrepareInvoiceSupportRequiresEvidenceInput,
  buildSettleEventPaymentRequiresEvidenceInput,
  buildTrustedPartnerReadGuardInput,
  completeTrustedPartnerHandshake,
} from '../fixtures/enterprise-demo-policy-pack.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { APPROVE_PAYMENT } from '../fixtures/enterprise-demo-actions.fixture.js';
import { FINANCE_APPROVER_PERSONA_ID, PMFREAK_PERSONA_ID, TRUSTED_PARTNER_PERSONA_ID, VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID, TRUSTED_PARTNER_AGENT_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import type { EnforcementOutcome } from '../../action-enforcement/domain/enforcement-outcome.js';
import { assertionResult, executorSafetyAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'policy-pack-control-plane-walkthrough';
const MINIMUM_POLICY_DECISIONS = 6;

export const POLICY_PACK_CONTROL_PLANE_WALKTHROUGH_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Operator Walkthrough of Policy Pack Enforcement in the Control Plane',
  shortTitle: 'Policy: Control Plane Walkthrough',
  category: 'policy_packs',
  summary:
    'An operator opens the Control Plane after a representative sweep of policy-pack scenarios -- a required finance review, a hard deny, two evidence requirements, a compliance-review requirement, and an allowed low-risk read -- and inspects Policy Packs, Enforcement and Proofs together.',
  enterpriseMessage: 'Soberanía makes policy-pack enforcement explainable to operators and buyers: every pack, rule, decision, proof and enforcement link is inspectable from one place.',
  buyerPain: 'Buyers and operators do not trust a policy engine they cannot inspect -- they need to see exactly which rule matched, which decision it produced, and how it ties back to the enforcement outcome.',
  aocValue:
    'Every policy pack decision this walkthrough produced is real: matched against a real rule, proven with a real policy proof, and linked back to the real enforcement decision it informed -- all inspectable in the Control Plane\'s Policy Packs, Enforcement and Proofs panels.',
  personas: [PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID, FINANCE_APPROVER_PERSONA_ID, TRUSTED_PARTNER_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: APPROVE_PAYMENT,
  capability: 'payments.approval',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'critical',
  expectedOutcome: 'executed',
  tags: ['policy_packs', 'audit', 'control_plane', 'walkthrough'],
  steps: [
    {
      id: 'setup-world',
      kind: 'setup',
      title: 'Establish every policy-pack-configured runtime path',
      description: 'The policy-pack-configured enforcement runtime has payments-basic, procurement-basic, data-boundary-basic and sports-event-settlement-basic all registered and active.',
      operatorNarration: 'This is the same policy-pack-configured runtime every other policy-pack scenario in this pack uses.',
    },
    {
      id: 'drive-representative-policy-actions',
      kind: 'enforcement',
      title: 'Drive a representative sweep of policy-pack decisions',
      description: 'Six real enforcement calls are made through the policy-pack-configured runtime, covering approval-required, denied, evidence-required (twice), compliance-required and allowed outcomes.',
      operatorNarration: 'Each call is a real AocGuard.enforce() call -- nothing here is a pre-built fixture of finished decisions.',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Inspect Policy Packs, Enforcement and Proofs together',
      description: 'The operator opens the Policy Packs panel to see every matched pack/rule/decision, the Enforcement panel to see each enforcement decision, and Proofs / Audit to see the policy and enforcement proof chain.',
      operatorNarration: 'Show the operator how a single enforcement decision links back to the exact policy decision and proof that produced it.',
    },
    {
      id: 'operator-explanation',
      kind: 'operator_explanation',
      title: 'Explain what to show a buyer',
      description: 'Summarize the operator walkthrough: Policy Packs shows the rule catalog and decisions, Enforcement shows what was blocked or allowed, Proofs shows the audit trail tying them together.',
      operatorNarration: 'This demo pack models an enterprise policy requirement; the Control Plane shows policy evidence and enforcement trace, not legal advice.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-multiple-policy-decisions',
      type: 'control_plane_row',
      title: 'Multiple policy decisions were produced',
      description: 'At least six real enforcement outcomes, each carrying a distinct policy decision, must have been produced.',
      expected: `at least ${MINIMUM_POLICY_DECISIONS} enforcement outcomes with distinct policyDecisionId`,
    },
    {
      id: 'assert-outcome-executed',
      type: 'enforcement_decision',
      title: 'Final outcome is executed',
      description: 'The scenario\'s final (closing) outcome status must be executed.',
      expected: 'outcome.status === "executed"',
    },
    {
      id: 'assert-executor-ran-once',
      type: 'executor_safety',
      title: 'Executor ran exactly once',
      description: 'Across the entire sweep, the real executor callback must run exactly once -- only for the allowed low-risk read.',
      expected: 'exactly 1 executed enforcement outcome',
    },
  ],
};

export const executePolicyPackControlPlaneWalkthroughScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [setupStep, sweepStep, controlPlaneStep, explanationStep] = POLICY_PACK_CONTROL_PLANE_WALKTHROUGH_SCENARIO.steps;

  steps.push(
    completeStep(
      SCENARIO_ID,
      setupStep!,
      'passed',
      ctx.now(),
      ctx.now(),
      'The policy-pack-configured enforcement runtime is ready with all six demo packs registered and active.',
      [world.fixture.world.pmfreak.id, world.fixture.world.victor.id],
    ),
  );

  const enforcementOutcomes: EnforcementOutcome<unknown>[] = [];
  let executorRuns = 0;
  const sweepStartedAt = ctx.now();
  const noopExecutor = (): string => {
    executorRuns += 1;
    return 'n/a';
  };

  enforcementOutcomes.push(await world.fixture.policyPackAocGuard.enforce(buildApprovePaymentRequiresFinanceReviewInput(), noopExecutor));
  enforcementOutcomes.push(await world.fixture.policyPackAocGuard.enforce(buildChangeBankAccountDeniedInput(), noopExecutor));
  enforcementOutcomes.push(await world.fixture.policyPackAocGuard.enforce(buildPrepareInvoiceSupportRequiresEvidenceInput(), noopExecutor));
  enforcementOutcomes.push(await world.fixture.policyPackAocGuard.enforce(buildExportClientDataRequiresComplianceReviewInput(), noopExecutor));
  enforcementOutcomes.push(await world.fixture.policyPackAocGuard.enforce(buildExportClientDataProhibitedInput(), noopExecutor));
  enforcementOutcomes.push(await world.fixture.policyPackAocGuard.enforce(buildSettleEventPaymentRequiresEvidenceInput(), noopExecutor));

  const handshake = completeTrustedPartnerHandshake(world.fixture, 'handshake-request-demo-policy-pack-walkthrough');
  const finalOutcome = await world.fixture.policyPackAocGuard.enforce(
    buildTrustedPartnerReadGuardInput(handshake, { policyEvaluationInput: { domain: 'data_boundary', dataDomains: ['project_metadata'] } }),
    () => {
      executorRuns += 1;
      return 'summary';
    },
  );
  enforcementOutcomes.push(finalOutcome);

  const sweepCompletedAt = ctx.now();
  const distinctPolicyDecisionIds = new Set(enforcementOutcomes.map((o) => o.decision.policyDecisionId).filter((id): id is string => id !== undefined));
  steps.push(
    completeStep(
      SCENARIO_ID,
      sweepStep!,
      distinctPolicyDecisionIds.size >= MINIMUM_POLICY_DECISIONS ? 'passed' : 'failed',
      sweepStartedAt,
      sweepCompletedAt,
      `${enforcementOutcomes.length} enforcement calls produced ${distinctPolicyDecisionIds.size} distinct policy decisions.`,
      [world.fixture.world.pmfreak.id, world.fixture.world.victor.id, TRUSTED_PARTNER_AGENT_ID],
      [...distinctPolicyDecisionIds],
    ),
  );

  steps.push(
    completeStep(
      SCENARIO_ID,
      controlPlaneStep!,
      'passed',
      sweepCompletedAt,
      sweepCompletedAt,
      'Policy Packs, Enforcement and Proofs / Audit panels together show the full sweep of decisions and their proofs.',
      [...distinctPolicyDecisionIds],
    ),
  );
  steps.push(
    completeStep(
      SCENARIO_ID,
      explanationStep!,
      'passed',
      sweepCompletedAt,
      sweepCompletedAt,
      'Operator walkthrough explains what each panel shows and how policy decisions link back to enforcement decisions.',
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, finalOutcome, executorRuns > 0),
    steps,
    enforcementOutcomes,
  };
  return result;
};

export const evaluatePolicyPackControlPlaneWalkthroughAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const outcome = result.outcome;
  const distinctPolicyDecisionIds = new Set(
    result.enforcementOutcomes.map((o) => o.decision.policyDecisionId).filter((id): id is string => id !== undefined),
  );
  const executedCount = result.enforcementOutcomes.filter((o) => o.result.executed).length;
  const multiplePolicyDecisionsPassed = distinctPolicyDecisionIds.size >= MINIMUM_POLICY_DECISIONS;

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      multiplePolicyDecisionsPassed,
      `${distinctPolicyDecisionIds.size} distinct policy decisions`,
      multiplePolicyDecisionsPassed ? 'POLICY_DECISION_SWEEP_COMPLETE' : 'POLICY_DECISION_SWEEP_INCOMPLETE',
      `Expected at least ${MINIMUM_POLICY_DECISIONS} distinct policy decisions across the sweep; found ${distinctPolicyDecisionIds.size}.`,
    ),
    assertionResult(
      SCENARIO_ID,
      defs[1]!.id,
      defs[1]!.type,
      defs[1]!.expected,
      outcome.status === 'executed',
      outcome.status,
      outcome.status === 'executed' ? 'WALKTHROUGH_CLOSES_ALLOWED' : 'WALKTHROUGH_OUTCOME_UNEXPECTED',
      `Final outcome status was "${outcome.status}".`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[2]!.id, defs[2]!.expected, 1, executedCount),
  ];
};
