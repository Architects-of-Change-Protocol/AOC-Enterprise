import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTHCARE_OPERATIONS_SENSITIVE_DATA_PILOT_TEMPLATE } from '../../pilots/healthcare-operations-sensitive-data.pilot.js';
import { buildHealthcareOperationsSensitiveDataPilotFixture } from '../../fixtures/healthcare-operations-sensitive-data-pilot.fixture.js';

describe('HEALTHCARE_OPERATIONS_SENSITIVE_DATA_PILOT_TEMPLATE', () => {
  const template = HEALTHCARE_OPERATIONS_SENSITIVE_DATA_PILOT_TEMPLATE;

  it('1. template exists', () => {
    assert.equal(template.id, 'healthcare-operations-sensitive-data');
  });

  it('2. industry = healthcare', () => {
    assert.equal(template.industry, 'healthcare');
  });

  it('3. includes sensitive data use case', () => {
    assert.ok(/sensitive/i.test(template.primaryUseCase) || /sensitive/i.test(template.description));
  });

  it('4. includes data-boundary policy', () => {
    assert.ok(template.policyModel.policyPackIds.includes('policy-pack-data-boundary-basic'));
  });

  it('5. includes approval/evidence scenarios', () => {
    assert.ok(template.scenarios.some((s) => s.controlPlaneFocus === 'approvals'));
    assert.ok(template.scenarios.some((s) => s.controlPlaneFocus === 'evidence'));
  });

  it('6. includes prohibited export scenario', () => {
    assert.ok(template.scenarios.some((s) => s.id === 'healthcare-scenario-prohibited-export-denied' && s.expectedOutcome === 'blocked'));
  });

  it('7. includes healthcare regulatory disclaimer', () => {
    assert.ok(/HIPAA/i.test(template.legalDisclaimer) && /GDPR/i.test(template.legalDisclaimer));
  });

  it('8. readiness is ready or ready_with_warnings', async () => {
    const fixture = await buildHealthcareOperationsSensitiveDataPilotFixture();
    assert.ok(['ready', 'ready_with_warnings'].includes(fixture.kit.readiness.status));
  });
});
