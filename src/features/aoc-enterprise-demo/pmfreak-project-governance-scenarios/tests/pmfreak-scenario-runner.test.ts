import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import type { PMFreakScenarioRunnerDeps } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { clientCommunicationDraftStatusUpdateScenario, demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { getPMFreakRealAgentPassportFixtures } from '../pmfreak-real-agent-passport-fixtures.js';
import {
  PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID,
  PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
  PMFREAK_SCENARIO_SCHEDULE_CHANGE_DETECT_VARIANCE_ID,
} from '../pmfreak-project-governance-scenario-constants.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

const [DRAFT_PM_APPROVAL_ID] = clientCommunicationDraftStatusUpdateScenario.approvalRequirements.map((requirement) => requirement.id);

describe('PMFreak Project Governance Scenario runner -- consumes the real passport resolver, never duplicates it', () => {
  it('2. calls resolvePMFreakAgentPassportAction: the result carries a full PMFreakAgentPassportResolution', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);

    assert.equal(result.decision, result.passportResolution.decision);
    assert.equal(result.evidenceSatisfied, result.passportResolution.evidenceSatisfied);
    assert.equal(result.approvalsSatisfied, result.passportResolution.approvalsSatisfied);
    assert.deepEqual(result.missingEvidenceIds, result.passportResolution.missingEvidenceIds);
    assert.deepEqual(result.missingApprovalIds, result.passportResolution.missingApprovalIds);
    assert.ok(result.appliedPolicyPackIds.includes(PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID));
  });

  it("this pack's own source never redeclares passport/authority/capability/evidence/approval gating logic", () => {
    const runnerSource = readFileSync(resolve(process.cwd(), 'src/features/aoc-enterprise-demo/pmfreak-project-governance-scenarios/pmfreak-scenario-runner.ts'), 'utf8');

    assert.ok(runnerSource.includes("import { buildPMFreakAgentRuntimeActionRequest, resolvePMFreakAgentPassportAction } from '@aoc-enterprise/pmfreak-agent-passport-foundation';"));
    assert.ok(!runnerSource.includes('function resolvePMFreakAgentPassportAction'));
  });

  it('28. an unknown scenario id denies with a scenario_not_found error', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: 'pmfreak.scenario.does_not_exist' }, scenarioRegistry, runnerDeps);

    assert.equal(result.scenarioFound, false);
    assert.equal(result.decision, 'deny');
    assert.ok(result.errors.some((error) => error.includes('scenario_not_found')));
  });

  it('24. propagates a revoked passport override as a denial', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID, overridePassportVariant: 'revoked' },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'deny');
    assert.equal(result.passportResolution.passportStatus, 'revoked');
  });

  it('25. propagates a suspended passport override as a hold', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      {
        scenarioId: clientCommunicationDraftStatusUpdateScenario.scenarioId,
        overridePassportVariant: 'suspended',
        // Neutralize the scenario's customer-facing PM-approval context gate (and its evidence
        // requirement, satisfied by default) so the passport-status hold is the only candidate
        // decision -- otherwise require_pm_approval (higher priority than hold) would legitimately
        // win, since both are real, independent gates.
        overrideApprovalIds: [DRAFT_PM_APPROVAL_ID!],
      },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'hold');
    assert.equal(result.passportResolution.passportStatus, 'suspended');
  });

  it('26. propagates an expired passport override as a denial', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_DETECT_VARIANCE_ID, overridePassportVariant: 'expired' },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'deny');
    assert.equal(result.passportResolution.passportStatus, 'expired');
  });

  it("27. propagates an out-of-scope authority denial: overrideAuthorityScope lets a caller exercise a denial without a special 'out-of-scope passport' fixture -- the real model separates authority scope from passport identity entirely", async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
        overrideAuthorityScope: {
          workspaceIds: ['workspace.demo.out-of-scope-harbor'],
          projectIds: ['project.demo.out-of-scope-harbor'],
          customerIds: [],
          allowedProjectPhases: ['initiation', 'planning', 'execution', 'monitoring', 'closure', 'billing'],
        },
      },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.passportResolution.allowedByAuthorityScope, false);
    assert.equal(result.decision, 'deny');
  });

  it('a resolver-level deny is never softened into a review-type decision', async () => {
    const scenario = scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID);
    assert.ok(scenario !== undefined);

    const result = await runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
        overridePassportVariant: 'revoked',
        overrideEvidenceIds: [...scenario!.baselineEvidenceIds],
        overrideApprovalIds: [...scenario!.baselineApprovalIds],
      },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'deny');
  });

  it("never mutates the scenario registry's scenario objects across runs", async () => {
    const scenarioBefore = JSON.stringify(scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID));
    await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID, overrideEvidenceIds: [] }, scenarioRegistry, runnerDeps);
    const scenarioAfter = JSON.stringify(scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID));

    assert.equal(scenarioBefore, scenarioAfter);
  });
});
