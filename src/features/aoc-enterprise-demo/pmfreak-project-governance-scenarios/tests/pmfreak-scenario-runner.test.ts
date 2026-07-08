import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
  PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID,
  PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
  PMFREAK_SCENARIO_SCHEDULE_CHANGE_PROPOSE_REPLAN_ID,
} from '../pmfreak-project-governance-scenario-constants.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('PMFreak Project Governance Scenario runner -- consumes the passport resolver, never duplicates it', () => {
  it('2. calls resolvePMFreakAgentPassportAction: the result carries a full PMFreakAgentPassportResolution', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, scenarioRegistry, passportRegistry);

    assert.equal(result.decision, result.passportResolution.decision);
    assert.equal(result.evidenceSatisfied, result.passportResolution.evidenceSatisfied);
    assert.equal(result.approvalsSatisfied, result.passportResolution.approvalsSatisfied);
    assert.deepEqual(result.missingEvidenceIds, result.passportResolution.missingEvidenceIds);
    assert.deepEqual(result.missingApprovalIds, result.passportResolution.missingApprovalIds);
    assert.ok(result.passportResolution.appliedPolicyPackIds.includes('aoc.demo.pmfreak.agent_passport.v1'));
  });

  it('this pack\'s own source never redeclares passport/authority/capability/evidence/approval gating logic', () => {
    const runnerSource = readFileSync(resolve(process.cwd(), 'src/features/aoc-enterprise-demo/pmfreak-project-governance-scenarios/pmfreak-scenario-runner.ts'), 'utf8');

    assert.ok(runnerSource.includes("import { resolvePMFreakAgentPassportAction } from '../pmfreak-agent-passport/index.js';"));
    assert.ok(!runnerSource.includes('function resolvePMFreakAgentPassportAction'));
  });

  it('28. an unknown scenario id denies with a scenario_not_found error', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: 'pmfreak.scenario.does_not_exist' }, scenarioRegistry, passportRegistry);

    assert.equal(result.decision, 'deny');
    assert.ok(result.errors.some((error) => error.includes('scenario_not_found')));
  });

  it('24. propagates a revoked passport override as a denial', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
        overridePassportId: 'aoc.passport.pmfreak.billing_readiness.revoked.v1',
        overrideAgentId: 'pmfreak.agent.billing_readiness.revoked',
      },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'deny');
    assert.equal(result.passportResolution.passportStatus, 'revoked');
  });

  it('25. propagates a suspended passport override as a hold', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID,
        overridePassportId: 'aoc.passport.pmfreak.client_communication.suspended.v1',
        overrideAgentId: 'pmfreak.agent.client_communication.suspended',
        // Neutralize the scenario's customer-facing PM-approval context gate so the passport-status
        // hold is the only candidate decision -- otherwise require_pm_approval (higher priority than
        // hold) would legitimately win, since both are real, independent gates.
        overrideApprovalIds: ['pmfreak.approval.pm_approval'],
      },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'hold');
    assert.equal(result.passportResolution.passportStatus, 'suspended');
  });

  it('26. propagates an expired passport override as a denial', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_PROPOSE_REPLAN_ID,
        overridePassportId: 'aoc.passport.pmfreak.planning.expired.v1',
        overrideAgentId: 'pmfreak.agent.planning.expired',
      },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'deny');
    assert.equal(result.passportResolution.passportStatus, 'expired');
  });

  it('27. propagates an out-of-scope authority denial: the out-of-scope demo passport\'s authority scope only covers a different project than this scenario\'s default demo project', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
        overridePassportId: 'aoc.passport.pmfreak.risk.out_of_scope.v1',
        overrideAgentId: 'pmfreak.agent.risk.out_of_scope',
      },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.passportResolution.allowedByAuthorityScope, false);
    assert.equal(result.decision, 'deny');
  });

  it('a resolver-level deny is never softened into a review-type decision', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
        overridePassportId: 'aoc.passport.pmfreak.billing_readiness.revoked.v1',
        overrideAgentId: 'pmfreak.agent.billing_readiness.revoked',
        overrideEvidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
        overrideApprovalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
      },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'deny');
  });

  it('never mutates the scenario registry\'s scenario objects across runs', () => {
    const scenarioBefore = JSON.stringify(scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID));
    runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID, overrideEvidenceIds: [] }, scenarioRegistry, passportRegistry);
    const scenarioAfter = JSON.stringify(scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID));

    assert.equal(scenarioBefore, scenarioAfter);
  });
});
