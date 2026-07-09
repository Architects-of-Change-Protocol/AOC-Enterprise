import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPMFreakProjectGovernanceScenarioPackManifest } from '../pmfreak-project-governance-scenario-manifest.js';
import { PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID } from '../pmfreak-project-governance-scenario-constants.js';

describe('PMFreak Project Governance Scenario Pack manifest', () => {
  it('1. creates a manifest with the documented id, domain, status, and scope', () => {
    const manifest = createPMFreakProjectGovernanceScenarioPackManifest();

    assert.equal(manifest.id, 'aoc.demo.pmfreak.project_governance_scenarios.v1');
    assert.equal(manifest.id, PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID);
    assert.equal(manifest.domain, 'project_governance');
    assert.equal(manifest.kind, 'demo_pack');
    assert.equal(manifest.status, 'demo_baseline');
    assert.equal(manifest.sourceStatus, 'system_authored');
    assert.equal(manifest.scope.demoOnly, true);
    assert.equal(manifest.scope.systemAuthored, true);
    assert.equal(manifest.scope.domainSpecific, true);
    assert.equal(manifest.scope.useCaseSpecific, true);
    assert.equal(manifest.scope.customerSpecific, false);
  });

  it('safe framing defaults are all true', () => {
    const manifest = createPMFreakProjectGovernanceScenarioPackManifest();

    assert.equal(manifest.safeFraming.notLegalAdvice, true);
    assert.equal(manifest.safeFraming.notComplianceCertification, true);
    assert.equal(manifest.safeFraming.noCompletenessClaim, true);
    assert.equal(manifest.safeFraming.noJurisdictionalComplianceClaim, true);
    assert.equal(manifest.safeFraming.partialPolicyModel, true);
    assert.equal(manifest.safeFraming.requiresCustomerValidation, true);
    assert.equal(manifest.safeFraming.requiresDomainExpertReviewWhenApplicable, true);
  });

  /**
   * Changed under the real model: `@aoc-enterprise/pmfreak-agent-passport-foundation` (the real
   * resolver this pack now consumes, see pmfreak-scenario-runner.ts) is a workspace code
   * dependency, not a `PolicyPackManifest`-shaped pack, so it is never listed in
   * `requiredPackIds` -- there is no longer a sibling demo pack manifest for this manifest to
   * declare as required.
   */
  it('declares no required policy packs -- its real passport/runtime-guard dependency is a workspace code package, not a PolicyPackManifest-shaped pack', () => {
    const manifest = createPMFreakProjectGovernanceScenarioPackManifest();

    assert.deepEqual([...manifest.requiredPackIds], []);
  });

  it('labels include the documented safe vocabulary and never a certification/production claim', () => {
    const manifest = createPMFreakProjectGovernanceScenarioPackManifest();

    for (const label of [
      'pmfreak',
      'project_governance',
      'scenario_pack',
      'aoc_enterprise_demo',
      'agent_passport',
      'billing_readiness',
      'milestone_acceptance',
      'schedule_change',
      'risk_escalation',
      'client_communication',
      'change_control',
      'evidence_required',
      'approval_required',
      'audit_trail',
      'not_production_integration',
      'demo_baseline',
    ]) {
      assert.ok(manifest.labels.includes(label), `expected labels to include "${label}"`);
    }

    for (const forbidden of ['production_ready', 'certified_project_governance', 'fully_governed', 'risk_free', 'invoice_ready_certified', 'customer_acceptance_certified', 'contractually_compliant', 'legally_approved']) {
      assert.ok(!manifest.labels.includes(forbidden), `expected labels to never include "${forbidden}"`);
    }
  });

  it('accepts an operator-reviewed status override without losing the safe framing', () => {
    const manifest = createPMFreakProjectGovernanceScenarioPackManifest({ status: 'operator_reviewed', sourceStatus: 'operator_provided' });

    assert.equal(manifest.status, 'operator_reviewed');
    assert.equal(manifest.safeFraming.notLegalAdvice, true);
  });
});
