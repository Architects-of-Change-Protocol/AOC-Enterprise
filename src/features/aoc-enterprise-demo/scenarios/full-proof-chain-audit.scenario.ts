import { approveSendClientFollowUp, buildSendClientFollowUpGuardInput } from '../../action-enforcement/fixtures/approval-required-action.fixture.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import { SEND_CLIENT_FOLLOW_UP } from '../fixtures/enterprise-demo-actions.fixture.js';
import { AOC_OPERATOR_PERSONA_ID, PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID } from '../fixtures/enterprise-demo-personas.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID } from '../fixtures/enterprise-demo-world.fixture.js';
import { assertionResult } from './assertion-helpers.js';
import { buildScenarioOutcome } from './outcome-helpers.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
import { completeStep } from './step-helpers.js';

const SCENARIO_ID = 'full-proof-chain-audit';
const ACTION_REQUEST_ID = 'action-request-demo-full-proof-chain-audit';

export const FULL_PROOF_CHAIN_AUDIT_SCENARIO: DemoScenario = {
  id: SCENARIO_ID,
  title: 'Operator Inspects Full Proof Chain in Control Plane',
  shortTitle: 'Full Proof Chain Audit',
  category: 'audit',
  summary:
    'An enterprise operator opens the Control Plane after the client follow-up is approved and executed, then inspects the chain from the enforcement proof back through the approval proof, the recognition decision and the authority proof.',
  enterpriseMessage: 'Soberanía gives enterprise operators an auditable chain of why autonomous execution was allowed or blocked.',
  buyerPain: "Enterprises won't trust an autonomous decision they cannot trace back to its evidence after the fact.",
  aocValue: 'Every enforcement proof carries the ids of the recognition, authority and approval proofs that produced it, so the full chain is always reconstructible.',
  personas: [PMFREAK_PERSONA_ID, VICTOR_PERSONA_ID, AOC_OPERATOR_PERSONA_ID],
  primaryActorId: PMFREAK_ACTOR_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  action: SEND_CLIENT_FOLLOW_UP,
  capability: 'project_closure.client_communication',
  resourceScope: PROJECT_SCOPE,
  riskLevel: 'high',
  expectedOutcome: 'executed',
  tags: ['audit', 'proof', 'control_plane'],
  steps: [
    {
      id: 'drive-approved-execution',
      kind: 'enforcement',
      title: 'Drive an approved, executed action',
      description: 'PMFreak requests the client follow-up, Victor approves it, and the retried request executes -- producing recognition, authority, approval and enforcement proofs.',
      operatorNarration: 'This reuses the exact approval-unlock flow, but this scenario is about what happens next: the audit.',
      expectedEventSource: 'enforcement',
    },
    {
      id: 'control-plane-snapshot',
      kind: 'control_plane',
      title: 'Open the Control Plane',
      description: 'The operator opens the Control Plane and navigates to the Enforcement and Proofs / Audit panels.',
      operatorNarration: 'Every panel here is a projection of what just happened -- no separate audit log was hand-maintained.',
    },
    {
      id: 'proof-chain-walk',
      kind: 'proof',
      title: 'Walk the proof chain',
      description: 'Starting from the enforcement proof, the operator traces recognitionDecisionId, authorityProofId and approvalProofId back to their source proofs.',
      operatorNarration: 'A complete chain means every upstream id the enforcement proof references actually resolves to a real proof.',
    },
    {
      id: 'operator-explanation',
      kind: 'operator_explanation',
      title: 'Explain the full chain',
      description: 'The operator explains, proof by proof, why this action was ultimately allowed to execute.',
      operatorNarration: 'This is the walkthrough an auditor or enterprise buyer would be given.',
    },
  ],
  expectedAssertions: [
    {
      id: 'assert-proof-references-exist',
      type: 'proof_chain',
      title: 'Proof references exist',
      description: 'The final enforcement proof must exist and carry references to upstream proofs.',
      expected: 'enforcementProof and recognitionDecisionId are both present',
    },
    {
      id: 'assert-proof-chain-complete',
      type: 'proof_chain',
      title: 'Proof chain is complete where expected',
      description: 'The demo proof chain built for this run must be marked complete for the sources this decision actually used.',
      expected: 'proofChain.complete === true',
    },
    {
      id: 'assert-timeline-has-enforcement-event',
      type: 'control_plane_row',
      title: 'Timeline contains the enforcement event',
      description: 'The scenario must produce at least one enforcement step confirming execution.',
      expected: 'a passed enforcement step exists in the run timeline',
    },
  ],
};

export const executeFullProofChainAuditScenario: ScenarioExecutor = async (world, ctx) => {
  const steps: DemoStepRun[] = [];
  const [driveStep, snapshotStep, proofStep, explanationStep] = FULL_PROOF_CHAIN_AUDIT_SCENARIO.steps;

  const startedAt = ctx.now();
  const pending = await world.fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID }), () => 'unused');
  const approvalProofId = approveSendClientFollowUp(world.fixture, pending.decision.recognitionDecisionId!, ACTION_REQUEST_ID);

  let executorRuns = 0;
  const executed = await world.fixture.aocGuard.enforce(
    buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID, approvalProofId }),
    () => {
      executorRuns += 1;
      return 'sent';
    },
  );
  const completedAt = ctx.now();

  const driven = executed.decision.type === 'execute_allowed';
  steps.push(
    completeStep(
      SCENARIO_ID,
      driveStep!,
      driven ? 'passed' : 'failed',
      startedAt,
      completedAt,
      `Approved and executed. Final decision: ${executed.decision.type}. Executor ran ${executorRuns} time(s).`,
      [world.fixture.world.pmfreak.id, world.fixture.world.victor.id, executed.request.id],
      executed.proof !== undefined ? [executed.proof.id] : [],
    ),
  );

  steps.push(
    completeStep(
      SCENARIO_ID,
      snapshotStep!,
      'passed',
      completedAt,
      completedAt,
      'Control Plane opened to the Enforcement and Proofs / Audit panels.',
      [executed.request.id],
    ),
  );

  const chainProofIds = [
    ...(executed.proof !== undefined ? [executed.proof.id] : []),
    ...(executed.decision.recognitionDecisionId !== undefined ? [executed.decision.recognitionDecisionId] : []),
    ...(executed.decision.authorityProofId !== undefined ? [executed.decision.authorityProofId] : []),
    ...(executed.decision.approvalProofId !== undefined ? [executed.decision.approvalProofId] : []),
  ];
  steps.push(
    completeStep(
      SCENARIO_ID,
      proofStep!,
      chainProofIds.length > 1 ? 'passed' : 'failed',
      completedAt,
      completedAt,
      `Traced ${chainProofIds.length} proof reference(s) from the enforcement proof back through approval, recognition and authority.`,
      [],
      chainProofIds,
    ),
  );

  steps.push(
    completeStep(
      SCENARIO_ID,
      explanationStep!,
      'passed',
      completedAt,
      completedAt,
      'Operator walkthrough explains each proof in the chain and why the action was allowed to execute.',
    ),
  );

  const result: ScenarioExecutionResult = {
    outcome: buildScenarioOutcome(SCENARIO_ID, executed, executorRuns > 0),
    steps,
    enforcementOutcomes: [pending, executed],
  };
  return result;
};

export const evaluateFullProofChainAuditAssertions: ScenarioAssertionEvaluator = (scenario, result) => {
  const defs = scenario.expectedAssertions;
  const finalOutcome = result.enforcementOutcomes[result.enforcementOutcomes.length - 1]!;
  const proofPresent = finalOutcome.proof !== undefined && finalOutcome.decision.recognitionDecisionId !== undefined;
  const chainSourcesPresent = [
    finalOutcome.proof !== undefined,
    finalOutcome.decision.recognitionDecisionId !== undefined,
    finalOutcome.decision.authorityProofId !== undefined,
    finalOutcome.decision.approvalProofId !== undefined,
  ].every(Boolean);
  const enforcementStepPassed = result.steps.some((step) => step.kind === 'enforcement' && step.status === 'passed');

  return [
    assertionResult(
      SCENARIO_ID,
      defs[0]!.id,
      defs[0]!.type,
      defs[0]!.expected,
      proofPresent,
      `proof=${finalOutcome.proof?.id ?? 'none'}, recognitionDecisionId=${finalOutcome.decision.recognitionDecisionId ?? 'none'}`,
      proofPresent ? 'PROOF_REFERENCES_PRESENT' : 'PROOF_REFERENCES_MISSING',
      proofPresent ? 'The enforcement proof and recognition decision id are both present.' : 'One or more proof references are missing.',
    ),
    assertionResult(
      SCENARIO_ID,
      defs[1]!.id,
      defs[1]!.type,
      defs[1]!.expected,
      chainSourcesPresent,
      `enforcement=${finalOutcome.proof !== undefined}, recognition=${finalOutcome.decision.recognitionDecisionId !== undefined}, authority=${finalOutcome.decision.authorityProofId !== undefined}, approval=${finalOutcome.decision.approvalProofId !== undefined}`,
      chainSourcesPresent ? 'PROOF_CHAIN_COMPLETE' : 'PROOF_CHAIN_INCOMPLETE',
      chainSourcesPresent
        ? 'Every proof source this decision depended on is present.'
        : 'At least one expected proof source is missing from the chain.',
    ),
    assertionResult(
      SCENARIO_ID,
      defs[2]!.id,
      defs[2]!.type,
      defs[2]!.expected,
      enforcementStepPassed,
      String(enforcementStepPassed),
      enforcementStepPassed ? 'TIMELINE_HAS_ENFORCEMENT_EVENT' : 'TIMELINE_MISSING_ENFORCEMENT_EVENT',
      enforcementStepPassed ? 'The run timeline includes a passed enforcement step.' : 'No passed enforcement step was found in the run timeline.',
    ),
  ];
};
