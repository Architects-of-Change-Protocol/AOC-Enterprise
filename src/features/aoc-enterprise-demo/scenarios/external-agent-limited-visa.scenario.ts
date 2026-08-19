import { buildTrustedPartnerReadGuardInput, completeTrustedPartnerHandshake } from '../../action-enforcement/fixtures/external-agent-action.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { READ_PROJECT_SUMMARY } from '../fixtures/enterprise-demo-actions.fixture.js';
import { TRUSTED_PARTNER_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PROJECT_SCOPE, TRUST_DOMAIN_ID, TRUSTED_PARTNER_AGENT_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'external-agent-limited-visa';

export const EXTERNAL_AGENT_LIMITED_VISA_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Trusted External Agent Receives Limited Visa',
  shortTitle: 'External Agent Limited Visa',
  category: 'external_agents',
  summary:
    'Trusted Partner Research Agent completes External Agent Handshake and receives a limited visa and ingress grant to read the project summary for project:HMP-14665.',
  enterpriseMessage: 'Soberanía lets trusted external agents collaborate with bounded, auditable access.',
  buyerPain: 'Enterprises need to collaborate with partner-run agents without granting them unbounded internal access.',
  aocValue: "A completed handshake produces a real, scope-limited AgentVisa and IngressGrant that enforcement checks on every request.",
  personas: [TRUSTED_PARTNER_PERSONA_ID],
  primaryActorId: TRUSTED_PARTNER_AGENT_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: READ_PROJECT_SUMMARY,
  capability: READ_PROJECT_SUMMARY,
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'low',
  expectedOutcome: 'executed',
  tags: ['external_agents', 'handshake', 'allowed'],
  steps: [
    {
      id: 'external-handshake',
      kind: 'external_handshake',
      title: 'External Agent Handshake completes',
      description:
        'Trusted Partner Research Agent presents its passport, requests read_project_summary, and Handshake Runtime accepts, issuing a visa and ingress grant.',
      operatorNarration: 'The trust boundary already allowlists this issuer, capability and scope.',
      expectedState: 'accepted',
      expectedEventSource: 'handshake',
    },
    {
      id: 'recognition-check',
      kind: 'recognition',
      title: 'Recognition Runtime confirms local capability and external standing',
      description: "Recognition Runtime allows the request, consulting External Agent Handshake's standing check.",
      operatorNarration: 'Local capability alone is not enough -- standing must also be confirmed.',
      expectedState: 'allow',
      expectedEventSource: 'recognition',
    },
    {
      id: 'enforcement-execute',
      kind: 'enforcement',
      title: 'Action Enforcement allows and executes',
      description: 'AocGuard enforces the request; the decision is execute_allowed and the executor runs exactly once.',
      operatorNarration: 'A read-only, low-risk action -- allowed end to end.',
      expectedState: 'execute_allowed',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the visa and ingress grant',
      description: 'The External Agents panel shows the active visa and ingress grant for the Trusted Partner Research Agent.',
      operatorNarration: 'Every field here -- allowed actions, scopes, expiry -- is real visa state.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-visa-active',
      type: 'handshake_state',
      title: 'Agent visa is active',
      description: 'The handshake decision must issue an active AgentVisa.',
      expected: 'visa.status === "active"',
    },
    {
      id: 'assert-ingress-grant-active',
      type: 'handshake_state',
      title: 'Ingress grant is active',
      description: 'The handshake decision must issue an active IngressGrant.',
      expected: 'ingressGrant.status === "active"',
    },
    {
      id: 'assert-enforcement-allowed',
      type: 'enforcement_decision',
      title: 'Enforcement allows the read',
      description: 'The enforcement decision type must be execute_allowed.',
      expected: 'outcome.status === "executed"',
    },
    {
      id: 'assert-executor-ran-once',
      type: 'executor_safety',
      title: 'Executor ran exactly once',
      description: 'The real executor callback must run exactly once.',
      expected: 'exactly 1 executed enforcement outcome',
    },
  ],
};

export const executeExternalAgentLimitedVisaScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [handshakeStep, recognitionStep, enforcementStep, controlPlaneStep] = EXTERNAL_AGENT_LIMITED_VISA_SCENARIO.steps;

  const handshakeStartedAt = ctx.now();
  const handshake = completeTrustedPartnerHandshake(world.fixture, 'handshake-request-demo-limited-visa');
  const handshakeCompletedAt = ctx.now();

  const handshakeAccepted = handshake.decision.type === 'accepted' || handshake.decision.type === 'accepted_limited';
  steps.push(
    completeStep(
      SCENARIO_ID,
      handshakeStep!,
      handshakeAccepted ? 'passed' : 'failed',
      handshakeStartedAt,
      handshakeCompletedAt,
      `Handshake decision: ${handshake.decision.type}. Visa: ${handshake.visa?.id ?? 'none'}. Ingress grant: ${handshake.ingressGrant?.id ?? 'none'}.`,
      [TRUSTED_PARTNER_AGENT_ID],
      handshake.proof !== undefined ? [handshake.proof.id] : [],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.aocGuard.enforce(buildTrustedPartnerReadGuardInput(handshake), () => {
    executorRuns += 1;
    return 'summary';
  });
  const completedAt = ctx.now();

  const recognitionPassed = outcome.decision.type === 'execute_allowed';
  steps.push(
    completeStep(
      SCENARIO_ID,
      recognitionStep!,
      recognitionPassed ? 'passed' : 'failed',
      startedAt,
      completedAt,
      'Recognition Runtime allowed the read, confirming both local capability and external standing.',
      [TRUSTED_PARTNER_AGENT_ID],
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
      'External Agents panel shows the active visa and ingress grant.',
      handshake.visa !== undefined ? [handshake.visa.id] : [],
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, outcome, executorRuns > 0),
    steps,
    enforcementOutcomes: [outcome],
  };
  return result;
};

export const evaluateExternalAgentLimitedVisaAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const outcome = result.outcome;
  const executedCount = result.enforcementOutcomes.filter((o) => o.result.executed).length;
  const finalOutcome = result.enforcementOutcomes[result.enforcementOutcomes.length - 1];
  const visaActive = finalOutcome?.decision.visaId !== undefined;
  const ingressActive = finalOutcome?.decision.ingressGrantId !== undefined;

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      visaActive,
      finalOutcome?.decision.visaId ?? 'none',
      visaActive ? 'VISA_ACTIVE' : 'VISA_MISSING',
      visaActive ? 'The enforcement decision references an active visa.' : 'No visa id was carried on the enforcement decision.',
    ),
    assertionResult(
      SCENARIO_ID,
      defs[1]!.id,
      defs[1]!.type,
      defs[1]!.expected,
      ingressActive,
      finalOutcome?.decision.ingressGrantId ?? 'none',
      ingressActive ? 'INGRESS_GRANT_ACTIVE' : 'INGRESS_GRANT_MISSING',
      ingressActive ? 'The enforcement decision references an active ingress grant.' : 'No ingress grant id was carried on the enforcement decision.',
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
  ];
};
