import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import type { PMFreakScenarioRunnerDeps } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { clientCommunicationDraftStatusUpdateScenario, clientCommunicationSendStatusUpdateScenario, demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { getPMFreakRealAgentPassportFixtures } from '../pmfreak-real-agent-passport-fixtures.js';
import { PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID } from '../pmfreak-project-governance-scenario-constants.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

const [DRAFT_PM_APPROVAL_ID] = clientCommunicationDraftStatusUpdateScenario.approvalRequirements.map((requirement) => requirement.id);
const [SEND_EVIDENCE_ID] = clientCommunicationSendStatusUpdateScenario.baselineEvidenceIds;
const [SEND_PM_APPROVAL_ID] = clientCommunicationSendStatusUpdateScenario.baselineApprovalIds;

describe('Client Communication -- Draft Status Update', () => {
  it("17. drafting customer-facing content without PM approval requires PM approval (the resolver's context-sensitivity gate -- pmfreak.foundation.action.communication.draft_client_update carries no evidence requirement blocking this by itself)", async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, overrideApprovalIds: [] },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'require_pm_approval');
  });

  it('18. the draft can be prepared safely -- once PM approval is present the decision is allow, and the narrative states draft only', async () => {
    const withoutApproval = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, overrideApprovalIds: [] },
      scenarioRegistry,
      runnerDeps,
    );
    assert.equal(withoutApproval.decision, 'require_pm_approval');

    const withApproval = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, overrideApprovalIds: [DRAFT_PM_APPROVAL_ID!] },
      scenarioRegistry,
      runnerDeps,
    );
    assert.equal(withApproval.decision, 'allow');

    const scenario = scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID);
    assert.ok(scenario !== undefined);
    assert.ok(scenario!.safeNarrative.toLowerCase().includes('draft'));
    assert.ok(scenario!.safeNarrative.toLowerCase().includes('cannot send'));
  });
});

describe('Client Communication -- Send Status Update', () => {
  /**
   * NOTE ON VERIFIED BEHAVIOR (differs from this scenario's own header comment and
   * `expectedDecision`): the comment above `clientCommunicationSendStatusUpdateScenario` in
   * scenarios/client-communication-scenario.ts states that the real Client Communication role
   * profile's `humanApprovalRequiredFor` unconditionally forces `require_pm_approval` for a send
   * attempt. Running this scenario against the real resolver shows that is not what actually
   * happens: `pmfreak-agent-enrollment-builder.ts` never carries a role profile's
   * `humanApprovalRequiredFor` (a list of *action ids*) into the `AgentEnrollmentInput` it builds:
   * `@aoc-enterprise/agent-governance`'s `createAgentPolicyManifest` instead derives its own
   * `humanApprovalRequiredFor` from `input.tools` (a list of *tool names*) whenever
   * `humanOversight.requirement === 'required'`. Since `pmfreak.foundation.action.communication.send_client_update`
   * is an action id, not a tool name, it can never appear in that list, so the runtime guard's
   * step 9 (`policyManifest.humanApprovalRequiredFor.includes(requestedAction)`) never matches
   * for this or any other scenario in this pack. In practice, sending is therefore gated by
   * exactly the same context-sensitivity gate as drafting (customer-facing/external-communication
   * requires a granted `pm_approval`) -- verified by direct execution against the real resolver
   * before writing these assertions. This looks like a real mismatch in
   * `packages/pmfreak-agent-passport-foundation`'s enrollment-to-manifest wiring (or in this
   * scenario's own header comment/`expectedDecision`), reported separately rather than papered
   * over here.
   */
  it('19. sending without the drafted-communication evidence or PM approval requires PM approval (the same context-sensitivity gate the draft scenario exercises)', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID, overrideEvidenceIds: [], overrideApprovalIds: [] },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'require_pm_approval');
  });

  it('sending with the drafted-communication evidence and PM approval present allows -- verified directly against the real resolver (see the note above)', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID,
        overrideEvidenceIds: [SEND_EVIDENCE_ID!],
        overrideApprovalIds: [SEND_PM_APPROVAL_ID!],
      },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'allow');
    assert.equal(result.evidenceSatisfied, true);
    assert.equal(result.approvalsSatisfied, true);
  });

  it('20. a customer-commitment, contract-sensitive send requires contract review ahead of a plain PM-approval gate', async () => {
    // RunPMFreakProjectGovernanceScenarioInput does not expose a context override (context is scenario-defined,
    // never caller-injected, so a scenario's sensitivity flags can never be spoofed at run time). This exercises
    // the same resolver path directly against a one-off scenario registry carrying the customer-commitment context.
    const commitmentScenario = {
      ...clientCommunicationSendStatusUpdateScenario,
      context: { ...clientCommunicationSendStatusUpdateScenario.context, customerCommitment: true, contractSensitive: true },
    };
    const commitmentRegistry = createPMFreakProjectGovernanceScenarioRegistry([commitmentScenario]);

    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: commitmentScenario.scenarioId, overrideEvidenceIds: [SEND_EVIDENCE_ID!], overrideApprovalIds: [SEND_PM_APPROVAL_ID!] },
      commitmentRegistry,
      runnerDeps,
    );

    // require_contract_review outranks require_customer_validation and require_pm_approval in the priority order.
    assert.equal(result.decision, 'require_contract_review');
  });
});
