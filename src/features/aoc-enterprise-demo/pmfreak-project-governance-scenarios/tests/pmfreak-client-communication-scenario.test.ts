import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios, clientCommunicationSendStatusUpdateScenario } from '../scenarios/index.js';
import { PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID } from '../pmfreak-project-governance-scenario-constants.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('Client Communication -- Draft Status Update', () => {
  it('17. drafting customer-facing content without PM approval requires PM approval (the resolver\'s context-sensitivity gate -- pmfreak.action.communication.draft_client_update carries no evidence requirement of its own)', () => {
    const result = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, overrideApprovalIds: [] },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'require_pm_approval');
  });

  it('18. the draft can be prepared safely -- once PM approval is present the decision is allow, and the narrative states draft only', () => {
    const withoutApproval = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, overrideApprovalIds: [] },
      scenarioRegistry,
      passportRegistry,
    );
    assert.ok(['allow', 'require_pm_approval'].includes(withoutApproval.decision));

    const withApproval = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, overrideApprovalIds: ['pmfreak.approval.pm_approval'] },
      scenarioRegistry,
      passportRegistry,
    );
    assert.equal(withApproval.decision, 'allow');

    const scenario = scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID);
    assert.ok(scenario !== undefined);
    assert.ok(scenario!.safeNarrative.toLowerCase().includes('draft'));
    assert.ok(scenario!.safeNarrative.toLowerCase().includes('cannot send'));
  });
});

describe('Client Communication -- Send Status Update', () => {
  it('19. sending without the drafted-communication evidence or PM approval requires PM approval, never a softened allow', () => {
    const result = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID, overrideEvidenceIds: [], overrideApprovalIds: [] },
      scenarioRegistry,
      passportRegistry,
    );

    assert.ok(['require_pm_approval', 'deny'].includes(result.decision));
  });

  it('sending with the drafted-communication evidence and PM approval present allows', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID,
        overrideEvidenceIds: ['pmfreak.evidence.client_communication_draft'],
        overrideApprovalIds: ['pmfreak.approval.pm_approval'],
      },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'allow');
  });

  it('20. a customer-commitment, contract-sensitive send requires contract review or customer validation ahead of a plain PM-approval gate', () => {
    // RunPMFreakProjectGovernanceScenarioInput does not expose a context override (context is scenario-defined,
    // never caller-injected, so a scenario's sensitivity flags can never be spoofed at run time). This exercises
    // the same resolver path directly against a one-off scenario registry carrying the customer-commitment context.
    const commitmentScenario = {
      ...clientCommunicationSendStatusUpdateScenario,
      context: { ...clientCommunicationSendStatusUpdateScenario.context, customerCommitment: true, contractSensitive: true },
    };
    const commitmentRegistry = createPMFreakProjectGovernanceScenarioRegistry([commitmentScenario]);

    const result = runPMFreakProjectGovernanceScenario(
      { scenarioId: commitmentScenario.scenarioId, overrideEvidenceIds: ['pmfreak.evidence.client_communication_draft'], overrideApprovalIds: ['pmfreak.approval.pm_approval'] },
      commitmentRegistry,
      passportRegistry,
    );

    assert.ok(['require_contract_review', 'require_customer_validation'].includes(result.decision));
  });
});
