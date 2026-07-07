import { buildTrustedPartnerReadGuardInput, completeTrustedPartnerHandshake } from '../fixtures/enterprise-demo-policy-pack.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { READ_PROJECT_SUMMARY } from '../fixtures/enterprise-demo-actions.fixture.js';
import { TRUSTED_PARTNER_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PROJECT_SCOPE, TRUST_DOMAIN_ID, TRUSTED_PARTNER_AGENT_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion, policyDecisionAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'policy-pack-low-risk-read-warning-allowed';
const MATCHED_RULE_ID = 'data-boundary-basic-rule-non-sensitive-read-allowed';

export const POLICY_PACK_LOW_RISK_READ_WARNING_ALLOWED_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Low-Risk Read Allowed With Policy Recorded, Not Blocked',
  shortTitle: 'Policy: Low-Risk Read Allowed',
  category: 'policy_packs',
  summary:
    'Trusted Partner Research Agent, having completed External Agent Handshake, performs read_project_summary touching only non-sensitive project metadata; the data-boundary-basic policy pack records an explicit allow and execution proceeds.',
  enterpriseMessage: 'AOC does not overblock low-risk work; it preserves execution while recording a policy decision for the audit trail.',
  buyerPain: 'A policy engine that blocks every action to be safe is unusable -- enterprises need policy enforcement that stays out of the way for genuinely low-risk work.',
  aocValue:
    'The data-boundary-basic policy pack explicitly evaluates and allows read_project_summary when it touches no sensitive or prohibited data domain; every core AOC layer already allowed the request, so enforcement executes and the policy decision/proof are recorded alongside it.',
  personas: [TRUSTED_PARTNER_PERSONA_ID],
  primaryActorId: TRUSTED_PARTNER_AGENT_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: READ_PROJECT_SUMMARY,
  capability: READ_PROJECT_SUMMARY,
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'low',
  expectedOutcome: 'executed',
  tags: ['policy_packs', 'data_boundary', 'allowed', 'warning'],
  steps: [
    {
      id: 'external-handshake',
      kind: 'external_handshake',
      title: 'External Agent Handshake completes',
      description: 'Trusted Partner Research Agent completes its handshake, receiving an active visa and ingress grant for read_project_summary.',
      operatorNarration: 'The same real handshake flow other demo scenarios use -- nothing staged for this scenario alone.',
      expectedState: 'accepted',
      expectedEventSource: 'handshake',
    },
    {
      id: 'policy-evaluation',
      kind: 'enforcement',
      title: 'Domain Policy Pack Runtime records an explicit allow',
      description: 'Action Enforcement preflight consults the policy pack integration; data-boundary-basic matches its non-sensitive-read rule and records policy_allowed.',
      operatorNarration: 'This is a real policy decision and proof, not a skipped evaluation -- it simply does not block.',
      expectedState: 'policy_allowed',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'enforcement-execute',
      kind: 'enforcement',
      title: 'Action Enforcement allows and executes',
      description: 'AocGuard enforces the request through the policy-pack-configured runtime; the decision is execute_allowed and the real executor runs exactly once.',
      operatorNarration: 'Policy allow never overrides a core denial -- here every layer, including policy, agrees.',
      expectedState: 'execute_allowed',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the recorded policy decision',
      description: 'The Policy Packs panel shows the matched allow rule and its policy proof; the Enforcement panel shows the executed request -- not a blocked one.',
      operatorNarration: 'Point out that a policy row exists even though nothing was blocked.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-outcome-executed',
      type: 'enforcement_decision',
      title: 'Outcome is executed',
      description: 'The scenario outcome status must be executed.',
      expected: 'outcome.status === "executed"',
    },
    {
      id: 'assert-executor-ran-once',
      type: 'executor_safety',
      title: 'Executor ran exactly once',
      description: 'The real executor callback must run exactly once.',
      expected: 'exactly 1 executed enforcement outcome',
    },
    {
      id: 'assert-policy-decision-referenced',
      type: 'policy_decision',
      title: 'Policy allow recorded with proof',
      description: 'The outcome must carry a real policy decision id and policy proof id, matching the non-sensitive-read-allowed rule.',
      expected: `outcome.policyMatchedRuleIds includes "${MATCHED_RULE_ID}"`,
    },
  ],
};

export const executePolicyPackLowRiskReadWarningAllowedScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [handshakeStep, policyStep, enforcementStep, controlPlaneStep] = POLICY_PACK_LOW_RISK_READ_WARNING_ALLOWED_SCENARIO.steps;

  const handshakeStartedAt = ctx.now();
  const handshake = completeTrustedPartnerHandshake(world.fixture, 'handshake-request-demo-policy-pack-low-risk-read');
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

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.policyPackAocGuard.enforce(
    buildTrustedPartnerReadGuardInput(handshake, {
      policyEvaluationInput: { domain: 'data_boundary', dataDomains: ['project_metadata'] },
    }),
    () => {
      executorRuns += 1;
      return 'summary';
    },
  );
  const completedAt = ctx.now();

  const policyMatched = outcome.decision.policyMatchedRuleIds?.includes(MATCHED_RULE_ID) ?? false;
  steps.push(
    completeStep(
      SCENARIO_ID,
      policyStep!,
      policyMatched ? 'passed' : 'failed',
      startedAt,
      completedAt,
      `Policy decision: ${outcome.decision.policyReasonCode ?? 'none'} (allowed). Matched rules: ${(outcome.decision.policyMatchedRuleIds ?? []).join(', ') || 'none'}.`,
      [TRUSTED_PARTNER_AGENT_ID],
      outcome.decision.policyDecisionId !== undefined ? [outcome.decision.policyDecisionId] : [],
    ),
  );

  const enforcementPassed = outcome.decision.type === 'execute_allowed' && outcome.decision.allowedToExecute;
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
      'Policy Packs panel shows the matched allow rule; Enforcement panel shows the executed (not blocked) request.',
      outcome.decision.policyDecisionId !== undefined ? [outcome.decision.policyDecisionId] : [],
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluatePolicyPackLowRiskReadWarningAllowedAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const outcome = result.outcome;
  const executedCount = result.enforcementOutcomes.filter((o) => o.result.executed).length;

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      outcome.status === 'executed',
      outcome.status,
      outcome.status === 'executed' ? 'POLICY_ALLOWED_EXECUTED' : 'POLICY_OUTCOME_UNEXPECTED',
      `Outcome status was "${outcome.status}".`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[1]!.id, defs[1]!.expected, 1, executedCount),
    policyDecisionAssertion(SCENARIO_ID, defs[2]!.id, defs[2]!.expected, outcome, MATCHED_RULE_ID),
  ];
};
