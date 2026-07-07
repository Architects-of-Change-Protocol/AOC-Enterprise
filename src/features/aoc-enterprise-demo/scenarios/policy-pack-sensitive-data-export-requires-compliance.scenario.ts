import { buildExportClientDataRequiresComplianceReviewInput, EXPORT_CLIENT_DATA } from '../fixtures/enterprise-demo-policy-pack.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PROJECT_SCOPE, TRUST_DOMAIN_ID, VICTOR_ACTOR_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion, policyDecisionAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'policy-pack-sensitive-data-export-requires-compliance';
const MATCHED_RULE_ID = 'data-boundary-basic-rule-sensitive-export-compliance-review';

export const POLICY_PACK_SENSITIVE_DATA_EXPORT_REQUIRES_COMPLIANCE_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Sensitive Data Export Blocked Pending Compliance Review',
  shortTitle: 'Policy: Sensitive Export Needs Compliance',
  category: 'policy_packs',
  summary: 'Victor attempts export_client_data touching a sensitive data domain (pii); the data-boundary-basic policy pack requires a compliance review approval before the export may proceed.',
  enterpriseMessage: 'AOC can protect sensitive data exports through policy-pack-driven compliance approval requirements, independent of Recognition/Authority already allowing the export.',
  buyerPain: 'Enterprises cannot let any recognized actor export PII or other sensitive client data without a compliance reviewer in the loop.',
  aocValue:
    'The data-boundary-basic policy pack requires compliance_review approval for exports touching sensitive data domains; Action Enforcement blocks the export until that approval exists.',
  personas: [VICTOR_PERSONA_ID],
  primaryActorId: VICTOR_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: EXPORT_CLIENT_DATA,
  capability: 'data.export',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'high',
  expectedOutcome: 'approval_required',
  tags: ['policy_packs', 'data_boundary', 'approval', 'blocked'],
  steps: [
    {
      id: 'setup-world',
      kind: 'setup',
      title: 'Establish the data-boundary-basic policy pack',
      description: 'The data-boundary-basic policy pack requires compliance review for exports touching sensitive data domains such as pii, health_records or financial_records.',
      operatorNarration: 'Victor holds a real data.export capability token -- Recognition and Authority already allow this request.',
    },
    {
      id: 'policy-evaluation',
      kind: 'enforcement',
      title: 'Domain Policy Pack Runtime requires compliance review',
      description: 'Action Enforcement preflight consults the policy pack integration; data-boundary-basic matches the sensitive data domain and requires compliance review.',
      operatorNarration: 'The requested dataDomains include "pii," which the pack classifies as sensitive.',
      expectedState: 'policy_requires_approval',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'enforcement-block',
      kind: 'enforcement',
      title: 'Action Enforcement blocks execution',
      description: 'AocGuard enforces the request through the policy-pack-configured runtime; the decision is approval_required and the real executor never runs.',
      operatorNarration: 'The blocked decision carries the compliance-review approval requirement.',
      expectedState: 'approval_required',
      expectedEventSource: 'enforcement',
      metadata: { onlyIfExecuted: false },
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the compliance requirement',
      description: 'The Policy Packs panel shows the matched sensitive-export rule and its compliance_review approval requirement; the Enforcement panel shows the blocked decision.',
      operatorNarration: 'Open Policy Packs to see the exact approval requirement type.',
    },
    {
      id: 'operator-explanation',
      kind: 'operator_explanation',
      title: 'Explain the compliance gate',
      description: 'Summarize that sensitive data exports require a compliance reviewer under the enterprise policy pack.',
      operatorNarration: 'This demo pack models an enterprise policy requirement; the Control Plane shows policy evidence and enforcement trace, not legal advice.',
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
      description: 'The real executor callback must never run while compliance review is pending.',
      expected: 'exactly 0 executed enforcement outcomes',
    },
    {
      id: 'assert-policy-decision-referenced',
      type: 'policy_decision',
      title: 'Compliance review requirement referenced with proof',
      description: 'The outcome must carry a real policy decision id and policy proof id, matching the sensitive-export-compliance rule.',
      expected: `outcome.policyMatchedRuleIds includes "${MATCHED_RULE_ID}"`,
    },
  ],
};

export const executePolicyPackSensitiveDataExportRequiresComplianceScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [setupStep, policyStep, enforcementStep, controlPlaneStep, explanationStep] =
    POLICY_PACK_SENSITIVE_DATA_EXPORT_REQUIRES_COMPLIANCE_SCENARIO.steps;

  steps.push(
    completeStep(
      SCENARIO_ID,
      setupStep!,
      'passed',
      ctx.now(),
      ctx.now(),
      'data-boundary-basic is registered and active; Victor requests an export touching the sensitive "pii" data domain.',
      [world.fixture.world.victor.id],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.policyPackAocGuard.enforce(buildExportClientDataRequiresComplianceReviewInput(), () => {
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
      'Policy Packs panel shows the matched compliance-review rule; Enforcement panel shows the blocked decision.',
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
      'Operator walkthrough explains that a compliance reviewer must approve this export before it can execute.',
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluatePolicyPackSensitiveDataExportRequiresComplianceAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
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
      outcome.status === 'approval_required' ? 'POLICY_COMPLIANCE_REVIEW_PENDING' : 'POLICY_OUTCOME_UNEXPECTED',
      `Outcome status was "${outcome.status}".`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[1]!.id, defs[1]!.expected, 0, executedCount),
    policyDecisionAssertion(SCENARIO_ID, defs[2]!.id, defs[2]!.expected, outcome, MATCHED_RULE_ID),
  ];
};
