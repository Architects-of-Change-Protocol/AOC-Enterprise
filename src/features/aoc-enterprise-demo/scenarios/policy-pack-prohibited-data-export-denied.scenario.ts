import { buildExportClientDataProhibitedInput, EXPORT_CLIENT_DATA } from '../fixtures/enterprise-demo-policy-pack.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PROJECT_SCOPE, TRUST_DOMAIN_ID, VICTOR_ACTOR_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion, policyDecisionAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'policy-pack-prohibited-data-export-denied';
const MATCHED_RULE_ID = 'data-boundary-basic-rule-prohibited-export-denied';

export const POLICY_PACK_PROHIBITED_DATA_EXPORT_DENIED_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Prohibited Data Export Denied by Policy Pack',
  shortTitle: 'Policy: Prohibited Export Denied',
  category: 'policy_packs',
  summary: 'Victor attempts export_client_data touching a prohibited data domain (classified); the data-boundary-basic policy pack denies the export outright.',
  enterpriseMessage: 'AOC can enforce non-negotiable data boundaries before execution -- there is no approval path around a prohibited data domain.',
  buyerPain: 'Some data must never leave the trust domain regardless of who requests it or what approvals exist -- enterprises need a hard boundary, not a reviewable gate.',
  aocValue:
    'The data-boundary-basic policy pack denies exports touching prohibited data domains outright; Action Enforcement blocks the export with no evidence or approval path that could unlock it.',
  personas: [VICTOR_PERSONA_ID],
  primaryActorId: VICTOR_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: EXPORT_CLIENT_DATA,
  capability: 'data.export',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'high',
  expectedOutcome: 'blocked',
  tags: ['policy_packs', 'data_boundary', 'denied', 'blocked'],
  steps: [
    {
      id: 'setup-world',
      kind: 'setup',
      title: 'Establish the data-boundary-basic policy pack',
      description: 'The data-boundary-basic policy pack denies exports touching prohibited data domains such as classified or export_controlled data.',
      operatorNarration: 'This is a hard boundary rule, distinct from the sensitive-data compliance-review rule.',
    },
    {
      id: 'policy-evaluation',
      kind: 'enforcement',
      title: 'Domain Policy Pack Runtime denies the request',
      description: 'Action Enforcement preflight consults the policy pack integration; data-boundary-basic matches the prohibited data domain and denies the action outright.',
      operatorNarration: 'The requested dataDomains include "classified," which the pack treats as never exportable.',
      expectedState: 'policy_denied',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'enforcement-block',
      kind: 'enforcement',
      title: 'Action Enforcement blocks execution',
      description: 'AocGuard enforces the request through the policy-pack-configured runtime; the decision is execution_blocked and the real executor never runs.',
      operatorNarration: 'The blocked decision carries the policy decision/proof ids and the denial reason.',
      expectedState: 'execution_blocked',
      expectedEventSource: 'enforcement',
      metadata: { onlyIfExecuted: false },
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the denial reason and proof',
      description: 'The Policy Packs panel shows the matched prohibited-export rule and its policy proof; the Enforcement panel shows the blocked decision.',
      operatorNarration: 'Open Proofs / Audit to inspect the policy proof hash backing this denial.',
    },
    {
      id: 'operator-explanation',
      kind: 'operator_explanation',
      title: 'Explain the boundary',
      description: 'Summarize that this data domain can never be exported under the enterprise policy pack, regardless of approval.',
      operatorNarration: 'This demo pack models an enterprise policy requirement; it is not a legal or jurisdictional compliance conclusion.',
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
      description: 'The real executor callback must never run while the policy pack denies the export.',
      expected: 'exactly 0 executed enforcement outcomes',
    },
    {
      id: 'assert-policy-decision-referenced',
      type: 'policy_decision',
      title: 'Policy denial referenced with proof',
      description: 'The outcome must carry a real policy decision id and policy proof id, matching the prohibited-export rule.',
      expected: `outcome.policyMatchedRuleIds includes "${MATCHED_RULE_ID}"`,
    },
  ],
};

export const executePolicyPackProhibitedDataExportDeniedScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [setupStep, policyStep, enforcementStep, controlPlaneStep, explanationStep] = POLICY_PACK_PROHIBITED_DATA_EXPORT_DENIED_SCENARIO.steps;

  steps.push(
    completeStep(
      SCENARIO_ID,
      setupStep!,
      'passed',
      ctx.now(),
      ctx.now(),
      'data-boundary-basic is registered and active; Victor requests an export touching the prohibited "classified" data domain.',
      [world.fixture.world.victor.id],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.policyPackAocGuard.enforce(buildExportClientDataProhibitedInput(), () => {
    executorRuns += 1;
    return 'client data exported';
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
      'Policy Packs panel shows the matched prohibited-export rule and proof; Enforcement panel shows the blocked decision.',
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
      'Operator walkthrough explains that this data boundary is non-negotiable under the enterprise policy pack.',
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluatePolicyPackProhibitedDataExportDeniedAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
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
