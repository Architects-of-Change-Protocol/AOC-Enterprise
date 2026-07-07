import { buildApprovePaymentGuardInput, paymentsAdapter } from '../../action-enforcement/fixtures/side-effect-action.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { APPROVE_PAYMENT } from '../fixtures/enterprise-demo-actions.fixture.js';
import { FINANCE_APPROVER_PERSONA_ID, PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult, executorSafetyAssertion } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'adapter-denies-dangerous-action';

export const ADAPTER_DENIES_DANGEROUS_ACTION_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Adapter Blocks Dangerous Action Even If Upstream Context Exists',
  shortTitle: 'Adapter Denies',
  category: 'enforcement',
  summary:
    'PMFreak Closure Agent attempts approve_payment through the Payments Workflow adapter, which denies the action outright even though Recognition and Authority would allow it.',
  enterpriseMessage: 'AOC enforcement can be stricter at the execution boundary than upstream recognition alone.',
  buyerPain: "Enterprises need a last line of defense at the execution boundary, not just trust in upstream policy checks.",
  aocValue: 'A registered EnforcementAdapter can deny specific actions outright -- adapter deny always wins over an upstream allow.',
  personas: [PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID, FINANCE_APPROVER_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: APPROVE_PAYMENT,
  capability: 'payments.approval',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'critical',
  expectedOutcome: 'blocked',
  tags: ['enforcement', 'adapter', 'blocked'],
  steps: [
    {
      id: 'setup-adapter',
      kind: 'setup',
      title: 'Register the Payments Workflow adapter',
      description: 'The Payments Workflow adapter is registered with approve_payment on its denied-actions list.',
      operatorNarration: 'This is a real adapter registration on Action Enforcement, not a scripted denial.',
    },
    {
      id: 'enforcement-adapter-denied',
      kind: 'enforcement',
      title: 'Action Enforcement applies the adapter deny',
      description: 'Even though PMFreak holds a valid payment capability delegated from Victor, the adapter denies the action outright.',
      operatorNarration: 'Watch enforcement override what upstream context would otherwise allow.',
      expectedState: 'adapter_denied',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'control-plane-review',
      kind: 'control_plane',
      title: 'Review the adapter denial',
      description: 'The Enforcement panel shows the adapter_denied decision.',
      operatorNarration: 'The reason code makes clear this was an execution-boundary denial, not a recognition denial.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-enforcement-adapter-denied',
      type: 'enforcement_decision',
      title: 'Enforcement decision is adapter_denied',
      description: 'The enforcement decision type must be adapter_denied.',
      expected: 'decision.type === "adapter_denied"',
    },
    {
      id: 'assert-executor-did-not-run',
      type: 'executor_safety',
      title: 'Executor did not run',
      description: 'The real executor callback must never run when the adapter denies the action.',
      expected: 'exactly 0 executed enforcement outcomes',
    },
    {
      id: 'assert-side-effect-blocked',
      type: 'side_effect_state',
      title: 'Side effect blocked',
      description: 'No financial side effect may be marked executed for this request.',
      expected: 'sideEffectsExecuted === false',
    },
  ],
};

export const executeAdapterDeniesDangerousActionScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [setupStep, enforcementStep, controlPlaneStep] = ADAPTER_DENIES_DANGEROUS_ACTION_SCENARIO.steps;

  const setupStartedAt = ctx.now();
  world.fixture.enforcementRuntime.registerAdapter(paymentsAdapter);
  const setupCompletedAt = ctx.now();
  steps.push(
    completeStep(
      SCENARIO_ID,
      setupStep!,
      'passed',
      setupStartedAt,
      setupCompletedAt,
      `Registered adapter "${paymentsAdapter.name}" with approve_payment on its denied-actions list.`,
      [paymentsAdapter.id],
    ),
  );

  let executorRuns = 0;
  const startedAt = ctx.now();
  const outcome = await world.fixture.aocGuard.enforce(buildApprovePaymentGuardInput(), () => {
    executorRuns += 1;
    return 'approved';
  });
  const completedAt = ctx.now();

  const adapterDenied = outcome.decision.type === 'adapter_denied';
  steps.push(
    completeStep(
      SCENARIO_ID,
      enforcementStep!,
      adapterDenied ? 'passed' : 'failed',
      startedAt,
      completedAt,
      `Enforcement decision: ${outcome.decision.type}. Executor ran ${executorRuns} time(s).`,
      [outcome.request.id, paymentsAdapter.id],
    ),
  );

  steps.push(
    completeStep(
      SCENARIO_ID,
      controlPlaneStep!,
      'passed',
      completedAt,
      completedAt,
      'Enforcement panel shows the adapter_denied decision.',
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

export const evaluateAdapterDeniesDangerousActionAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const finalOutcome = result.enforcementOutcomes[result.enforcementOutcomes.length - 1]!;
  const executedCount = result.enforcementOutcomes.filter((o) => o.result.executed).length;
  const adapterDenied = finalOutcome.decision.type === 'adapter_denied';

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      adapterDenied,
      finalOutcome.decision.type,
      adapterDenied ? 'ADAPTER_DENIED' : 'ADAPTER_DECISION_UNEXPECTED',
      `Enforcement decision reason: ${finalOutcome.decision.reason}`,
    ),
    executorSafetyAssertion(SCENARIO_ID, defs[1]!.id, defs[1]!.expected, 0, executedCount),
    assertionResult(
      SCENARIO_ID,
      defs[2]!.id,
      defs[2]!.type,
      defs[2]!.expected,
      !result.outcome.sideEffectsExecuted,
      String(result.outcome.sideEffectsExecuted),
      !result.outcome.sideEffectsExecuted ? 'SIDE_EFFECT_BLOCKED' : 'SIDE_EFFECT_EXECUTED_UNEXPECTEDLY',
      !result.outcome.sideEffectsExecuted ? 'No financial side effect executed.' : 'A financial side effect executed despite the adapter deny.',
    ),
  ];
};
