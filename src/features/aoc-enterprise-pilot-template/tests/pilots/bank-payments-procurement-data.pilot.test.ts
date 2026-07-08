import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BANK_PAYMENTS_PROCUREMENT_DATA_PILOT_TEMPLATE } from '../../pilots/bank-payments-procurement-data.pilot.js';
import { buildBankPaymentsProcurementDataPilotFixture } from '../../fixtures/bank-payments-procurement-data-pilot.fixture.js';

describe('BANK_PAYMENTS_PROCUREMENT_DATA_PILOT_TEMPLATE', () => {
  const template = BANK_PAYMENTS_PROCUREMENT_DATA_PILOT_TEMPLATE;

  it('1. template exists', () => {
    assert.equal(template.id, 'bank-payments-procurement-data');
  });

  it('2. industry = banking', () => {
    assert.equal(template.industry, 'banking');
  });

  it('3. includes payments-basic policy', () => {
    assert.ok(template.policyModel.policyPackIds.includes('policy-pack-payments-basic'));
  });

  it('4. includes procurement-basic policy', () => {
    assert.ok(template.policyModel.policyPackIds.includes('policy-pack-procurement-basic'));
  });

  it('5. includes data-boundary-basic policy', () => {
    assert.ok(template.policyModel.policyPackIds.includes('policy-pack-data-boundary-basic'));
  });

  it('6. includes approve_payment approval required scenario', () => {
    assert.ok(template.scenarios.some((s) => s.id === 'bank-scenario-payment-requires-finance-approval' && s.expectedOutcome === 'approval_required'));
  });

  it('7. includes change_bank_account denied scenario', () => {
    assert.ok(template.scenarios.some((s) => s.id === 'bank-scenario-bank-account-change-denied' && s.expectedOutcome === 'blocked'));
  });

  it('8. includes export_client_data scenario', () => {
    assert.ok(template.scenarios.some((s) => s.id === 'bank-scenario-data-export-requires-compliance'));
    assert.ok(template.scenarios.some((s) => s.id === 'bank-scenario-prohibited-data-export-denied'));
  });

  it('9. includes legal disclaimer against banking compliance claims', () => {
    assert.ok(/does not prove banking regulatory compliance/i.test(template.legalDisclaimer));
  });

  it('10. readiness is ready or ready_with_warnings', async () => {
    const fixture = await buildBankPaymentsProcurementDataPilotFixture();
    assert.ok(['ready', 'ready_with_warnings'].includes(fixture.kit.readiness.status));
  });
});
