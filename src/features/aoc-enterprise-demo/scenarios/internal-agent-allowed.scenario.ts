import { buildDraftClosureEmailGuardInput } from '../../action-enforcement/fixtures/allowed-action.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { DRAFT_CLOSURE_EMAIL } from '../fixtures/enterprise-demo-actions.fixture.js';
import { DATASYS_PERSONA_ID, PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'internal-agent-allowed';

export const INTERNAL_AGENT_ALLOWED_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Internal Agent Allowed to Draft Closure Email',
  shortTitle: 'Internal Agent Allowed',
  category: 'enforcement',
  summary:
    'PMFreak Closure Agent is recognized inside Datasys Agent Republic, holds authority delegated from Victor, and drafts the closure email for project:HMP-14665.',
  enterpriseMessage: 'AOC can allow low-risk autonomous work when identity, authority and scope are valid.',
  buyerPain: "Enterprises don't trust autonomous agents to act without proof that identity, authority and scope were actually checked.",
  aocValue:
    'AOC only allows execution once Recognition and Authority independently agree the action is in scope -- and the real executor runs exactly once.',
  personas: [PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID, DATASYS_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: DRAFT_CLOSURE_EMAIL,
  capability: 'project_closure.drafting',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'medium',
  expectedOutcome: 'executed',
  tags: ['recognition', 'authority', 'enforcement', 'allowed'],
  steps: [
    {
      id: 'setup-world',
      kind: 'setup',
      title: 'Establish the Datasys Agent Republic',
      description: 'Register Datasys, Victor and PMFreak, issue passports and capability tokens, and delegate project-closure authority to PMFreak.',
      operatorNarration: 'This is the same real world every scenario starts from -- nothing here is scenario-specific staging.',
      expectedState: 'world_built',
    },
    {
      id: 'recognition-check',
      kind: 'recognition',
      title: 'Recognition Runtime evaluates the request',
      description: 'PMFreak submits an action request to draft the closure email; Recognition Runtime checks actor, passport, capability token, scope and evidence.',
      operatorNarration: 'Watch Recognition allow the request once every check passes.',
      expectedState: 'allow',
      expectedEventSource: 'recognition',
    },
    {
      id: 'authority-check',
      kind: 'authority',
      title: 'Authority Graph confirms the delegation chain',
      description: "Authority Graph resolves PMFreak's delegated authority back to Victor's grant from Datasys.",
      operatorNarration: 'The authority chain must resolve to a valid root issuer.',
      expectedState: 'authority_valid',
      expectedEventSource: 'authority',
    },
    {
      id: 'enforcement-execute',
      kind: 'enforcement',
      title: 'Action Enforcement allows and executes',
      description: 'AocGuard enforces the request; the decision is execute_allowed and the real executor callback runs exactly once.',
      operatorNarration: 'This is the only place the real side effect can happen -- and it happens once.',
      expectedState: 'execute_allowed',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review in the Control Plane',
      description: 'The Enforcement panel shows the allowed, executed request with its decision and proof.',
      operatorNarration: 'Open the Enforcement panel to see the executed request.',
    },
    {
      id: 'proof-chain-review',
      kind: 'proof',
      title: 'Inspect the proof chain',
      description: 'The enforcement proof references the recognition decision and authority proof that allowed it.',
      operatorNarration: 'Proofs / Audit shows the chain from enforcement back to recognition and authority.',
    },
    {
      id: 'operator-explanation',
      kind: 'operator_explanation',
      title: 'Explain the outcome',
      description: 'Summarize why this action was allowed and what evidence backs the decision.',
      operatorNarration: 'Everything you just saw is a projection of real runtime state -- nothing was staged.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-recognition-allow',
      type: 'recognition_decision',
      title: 'Recognition allows the request',
      description: 'Recognition Runtime must have produced a decision for this request.',
      expected: 'recognitionDecisionId is present on the enforcement decision',
    },
    {
      id: 'assert-authority-proof',
      type: 'authority_proof',
      title: 'Authority proof exists',
      description: 'The enforcement decision must carry an authority proof id.',
      expected: 'authorityProofId is present on the enforcement decision',
    },
    {
      id: 'assert-enforcement-allowed',
      type: 'enforcement_decision',
      title: 'Enforcement allows execution',
      description: 'The enforcement decision type must be execute_allowed and the outcome status must be executed.',
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
      id: 'assert-proof-chain',
      type: 'proof_chain',
      title: 'Proof chain includes enforcement and authority',
      description: 'The scenario must produce a proof chain that includes at least the enforcement and authority sources.',
      expected: 'enforcementDecisionId and authorityProofId both present',
    },
  ],
};

export const executeInternalAgentAllowedScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [setupStep, recognitionStep, authorityStep, enforcementStep, controlPlaneStep, proofStep, explanationStep] =
    INTERNAL_AGENT_ALLOWED_SCENARIO.steps;

  steps.push(
    completeStep(
      SCENARIO_ID,
      setupStep!,
      'passed',
      ctx.now(),
      ctx.now(),
      `World built: ${world.fixture.world.datasys.displayName}, ${world.fixture.world.victor.displayName} and ${world.fixture.world.pmfreak.displayName} are registered, with project-closure authority delegated to PMFreak.`,
      [world.fixture.world.datasys.id, world.fixture.world.victor.id, world.fixture.world.pmfreak.id],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.aocGuard.enforce(buildDraftClosureEmailGuardInput(), () => {
    executorRuns += 1;
    return 'draft saved';
  });
  const completedAt = ctx.now();

  const recognitionPassed = outcome.decision.recognitionDecisionId !== undefined;
  steps.push(
    completeStep(
      SCENARIO_ID,
      recognitionStep!,
      recognitionPassed ? 'passed' : 'failed',
      startedAt,
      completedAt,
      recognitionPassed ? 'Recognition Runtime produced a decision that allowed this request.' : 'Recognition Runtime did not produce a decision.',
      [world.fixture.world.pmfreak.id],
      outcome.decision.recognitionDecisionId !== undefined ? [outcome.decision.recognitionDecisionId] : [],
    ),
  );

  const authorityPassed = outcome.decision.authorityProofId !== undefined;
  steps.push(
    completeStep(
      SCENARIO_ID,
      authorityStep!,
      authorityPassed ? 'passed' : 'failed',
      startedAt,
      completedAt,
      authorityPassed
        ? "Authority Graph confirmed the delegated chain from Victor's grant to PMFreak."
        : 'Authority Graph did not confirm a valid chain.',
      [world.fixture.world.victor.id, world.fixture.world.pmfreak.id],
      outcome.decision.authorityProofId !== undefined ? [outcome.decision.authorityProofId] : [],
    ),
  );

  const enforcementPassed = outcome.decision.type === 'execute_allowed';
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
      'Enforcement panel shows the allowed, executed request.',
      [outcome.request.id],
    ),
  );
  steps.push(
    completeStep(
      SCENARIO_ID,
      proofStep!,
      'passed',
      completedAt,
      completedAt,
      'Proof chain traced from enforcement back to recognition and authority.',
      [],
      outcome.proof !== undefined ? [outcome.proof.id] : [],
    ),
  );
  steps.push(
    completeStep(
      SCENARIO_ID,
      explanationStep!,
      'passed',
      completedAt,
      completedAt,
      'Operator walkthrough explains why this action was allowed and what evidence backs it.',
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluateInternalAgentAllowedAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const outcome = result.outcome;
  const executedCount = result.enforcementOutcomes.filter((o) => o.result.executed).length;

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      outcome.recognitionDecisionId !== undefined,
      outcome.recognitionDecisionId ?? 'none',
      outcome.recognitionDecisionId !== undefined ? 'RECOGNITION_DECISION_PRESENT' : 'RECOGNITION_DECISION_MISSING',
      outcome.recognitionDecisionId !== undefined
        ? 'Recognition Runtime produced a decision for this request.'
        : 'No recognition decision id was recorded on the enforcement decision.',
    ),
    assertionResult(
      SCENARIO_ID,
      defs[1]!.id,
      defs[1]!.type,
      defs[1]!.expected,
      outcome.authorityProofId !== undefined,
      outcome.authorityProofId ?? 'none',
      outcome.authorityProofId !== undefined ? 'AUTHORITY_PROOF_PRESENT' : 'AUTHORITY_PROOF_MISSING',
      outcome.authorityProofId !== undefined
        ? 'Authority Graph produced a proof for this decision.'
        : 'No authority proof id was recorded on the enforcement decision.',
    ),
    assertionResult(
      SCENARIO_ID,
      defs[2]!.id,
      defs[2]!.type,
      defs[2]!.expected,
      outcome.status === 'executed',
      outcome.status,
      outcome.status === 'executed' ? 'ENFORCEMENT_ALLOWED' : 'ENFORCEMENT_NOT_ALLOWED',
      `Enforcement decision reason: ${outcome.reason}`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[3]!.id, defs[3]!.expected, 1, executedCount),
    assertionResult(
      SCENARIO_ID,
      defs[4]!.id,
      defs[4]!.type,
      defs[4]!.expected,
      outcome.enforcementDecisionId !== undefined && outcome.authorityProofId !== undefined,
      `enforcementDecisionId=${outcome.enforcementDecisionId ?? 'none'}, authorityProofId=${outcome.authorityProofId ?? 'none'}`,
      outcome.enforcementDecisionId !== undefined && outcome.authorityProofId !== undefined ? 'PROOF_CHAIN_SOURCES_PRESENT' : 'PROOF_CHAIN_SOURCES_MISSING',
      'The proof chain requires both an enforcement decision and an authority proof for this action.',
    ),
  ];
};
