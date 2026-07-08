import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE } from '../../pilots/datasys-project-governance.pilot.js';
import { buildDatasysProjectGovernancePilotFixture } from '../../fixtures/datasys-project-governance-pilot.fixture.js';

describe('DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE', () => {
  const template = DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE;

  it('1. template exists', () => {
    assert.equal(template.id, 'datasys-project-governance');
  });

  it('2. industry = technology_services', () => {
    assert.equal(template.industry, 'technology_services');
  });

  it('3. includes PM/project governance pain', () => {
    assert.ok(/PM agent|project management|PMO/i.test(template.businessPain));
  });

  it('4. includes procurement/financial/data policy scenario', () => {
    assert.ok(template.policyModel.policyPackIds.includes('policy-pack-procurement-basic'));
    assert.ok(template.policyModel.policyPackIds.includes('policy-pack-financial-approval-basic'));
    assert.ok(template.policyModel.policyPackIds.includes('policy-pack-data-boundary-basic'));
  });

  it('5. includes evidence requirements', () => {
    assert.ok(template.evidenceModel.evidenceScenarios.length > 0);
  });

  it('6. includes export package definitions', () => {
    assert.ok(template.exportPackages.length > 0);
  });

  it('7. includes Control Plane walkthrough', () => {
    assert.ok(template.controlPlaneWalkthrough.sections.length > 0);
    assert.ok(template.controlPlaneWalkthrough.operatorScript.length > 0);
  });

  it('8. includes legal disclaimer', () => {
    assert.ok(template.legalDisclaimer.length > 0);
  });

  it('9. readiness is ready or ready_with_warnings', async () => {
    const fixture = await buildDatasysProjectGovernancePilotFixture();
    assert.ok(['ready', 'ready_with_warnings'].includes(fixture.kit.readiness.status));
  });
});
