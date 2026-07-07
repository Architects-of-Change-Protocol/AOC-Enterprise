import type { GuardActionRequestInput } from '../../action-enforcement/sdk/aoc-guard.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { PREPARE_INVOICE_SUPPORT } from '../fixtures/enterprise-demo-actions.fixture.js';
import { PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID, VICTOR_ACTOR_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'evidence-required-block';

function buildInvoiceSupportGuardInput(): GuardActionRequestInput {
  return {
    actorId: PMFREAK_ACTOR_ID,
    principalActorId: VICTOR_ACTOR_ID,
    trustDomainId: TRUST_DOMAIN_ID,
    action: PREPARE_INVOICE_SUPPORT,
    resourceScope: PROJECT_SCOPE,
    capability: 'project_closure.invoice_support',
    sideEffectType: 'write',
    riskLevel: 'medium',
    metadata: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-invoice-support' },
  };
}

export const EVIDENCE_REQUIRED_BLOCK_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Invoice Support Blocked Because Evidence Is Missing',
  shortTitle: 'Evidence Required',
  category: 'recognition',
  summary: 'PMFreak Closure Agent attempts to prepare invoice support without the invoice backup evidence its capability token requires.',
  enterpriseMessage: 'AOC ensures agents do not execute operational or financial workflows without required evidence.',
  buyerPain: 'Enterprises need proof that an agent had the right supporting documentation before it touched invoicing.',
  aocValue: "PMFreak's invoice-support capability token declares an evidence requirement; Recognition Runtime enforces it before Enforcement is even reached.",
  personas: [PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: PREPARE_INVOICE_SUPPORT,
  capability: 'project_closure.invoice_support',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'medium',
  expectedOutcome: 'evidence_required',
  tags: ['recognition', 'evidence', 'blocked'],
  steps: [
    {
      id: 'setup-world',
      kind: 'setup',
      title: 'Establish the invoice-support capability',
      description: "PMFreak's invoice-support capability token declares an evidenceRequirement for invoice_backup evidence.",
      operatorNarration: 'This requirement was attached when the token was issued, not invented for this demo.',
    },
    {
      id: 'recognition-check',
      kind: 'recognition',
      title: 'Recognition Runtime requires more evidence',
      description: 'No invoice_backup evidence is attached to this request, so Recognition Runtime returns require_more_evidence.',
      operatorNarration: 'The check happens before authority or enforcement evaluation.',
      expectedState: 'require_more_evidence',
      expectedEventSource: 'recognition',
    },
    {
      id: 'enforcement-block',
      kind: 'enforcement',
      title: 'Action Enforcement blocks execution',
      description: 'AocGuard enforces the request; the decision is evidence_required and the executor never runs.',
      operatorNarration: 'Enforcement mirrors what Recognition already decided -- it cannot be bypassed at this layer.',
      expectedState: 'evidence_required',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the missing-evidence reason',
      description: 'The Enforcement panel shows the blocked decision with an evidence_required reason.',
      operatorNarration: 'The reason code is visible directly on the decision row.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-recognition-requires-evidence',
      type: 'recognition_decision',
      title: 'Recognition requires more evidence',
      description: 'Recognition Runtime must produce a decision that blocks on missing evidence.',
      expected: 'outcome.status === "evidence_required"',
    },
    {
      id: 'assert-enforcement-evidence-required',
      type: 'enforcement_decision',
      title: 'Enforcement requires evidence',
      description: 'The enforcement decision type must be evidence_required.',
      expected: 'decision.type === "evidence_required"',
    },
    {
      id: 'assert-executor-did-not-run',
      type: 'executor_safety',
      title: 'Executor did not run',
      description: 'The real executor callback must never run while evidence is missing.',
      expected: 'exactly 0 executed enforcement outcomes',
    },
  ],
};

export const executeEvidenceRequiredBlockScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [setupStep, recognitionStep, enforcementStep, controlPlaneStep] = EVIDENCE_REQUIRED_BLOCK_SCENARIO.steps;

  steps.push(
    completeStep(
      SCENARIO_ID,
      setupStep!,
      'passed',
      ctx.now(),
      ctx.now(),
      "PMFreak's invoice-support capability token requires invoice_backup evidence for prepare_invoice_support.",
      [world.fixture.world.pmfreak.id],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.aocGuard.enforce(buildInvoiceSupportGuardInput(), () => {
    executorRuns += 1;
    return 'invoice support prepared';
  });
  const completedAt = ctx.now();

  const recognitionPassed = outcome.decision.type === 'evidence_required';
  steps.push(
    completeStep(
      SCENARIO_ID,
      recognitionStep!,
      recognitionPassed ? 'passed' : 'failed',
      startedAt,
      completedAt,
      'Recognition Runtime blocked the request pending required evidence.',
      [world.fixture.world.pmfreak.id],
      outcome.decision.recognitionDecisionId !== undefined ? [outcome.decision.recognitionDecisionId] : [],
    ),
  );

  steps.push(
    completeStep(
      SCENARIO_ID,
      enforcementStep!,
      recognitionPassed ? 'passed' : 'failed',
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
      'Enforcement panel shows the evidence_required decision and its reason code.',
      [outcome.request.id],
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluateEvidenceRequiredBlockAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
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
      outcome.status === 'evidence_required' ? 'EVIDENCE_REQUIRED' : 'EVIDENCE_STATE_UNEXPECTED',
      `Outcome status was "${outcome.status}".`,
    ),
    assertionResult(
      SCENARIO_ID,
      defs[1]!.id,
      defs[1]!.type,
      defs[1]!.expected,
      outcome.status === 'evidence_required',
      outcome.status,
      outcome.status === 'evidence_required' ? 'ENFORCEMENT_EVIDENCE_REQUIRED' : 'ENFORCEMENT_DECISION_UNEXPECTED',
      `Enforcement decision reason: ${outcome.reason}`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[2]!.id, defs[2]!.expected, 0, executedCount),
  ];
};
