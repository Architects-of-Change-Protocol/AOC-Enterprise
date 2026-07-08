import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS_EVENT_SETTLEMENT_PILOT_TEMPLATE } from '../../pilots/sports-event-settlement.pilot.js';
import { buildSportsEventSettlementPilotFixture } from '../../fixtures/sports-event-settlement-pilot.fixture.js';

describe('SPORTS_EVENT_SETTLEMENT_PILOT_TEMPLATE', () => {
  const template = SPORTS_EVENT_SETTLEMENT_PILOT_TEMPLATE;

  it('1. template exists', () => {
    assert.equal(template.id, 'sports-event-settlement');
  });

  it('2. industry = sports_entertainment', () => {
    assert.equal(template.industry, 'sports_entertainment');
  });

  it('3. includes sports-event-settlement-basic policy', () => {
    assert.ok(template.policyModel.policyPackIds.includes('policy-pack-sports-event-settlement-basic'));
  });

  it('4. includes event_record evidence requirement', () => {
    assert.ok(template.evidenceModel.evidenceScenarios.some((s) => s.requiredEvidenceTypes.includes('event_record')));
  });

  it('5. includes settlement action', () => {
    assert.ok(template.actions.some((a) => a.action === 'settle_event_payment'));
  });

  it('6. includes export package definition', () => {
    assert.ok(template.exportPackages.length > 0);
  });

  it('7. includes smart-contract/payment disclaimer', () => {
    assert.ok(/smart-contract legal enforceability/i.test(template.legalDisclaimer));
    assert.ok(/payment regulatory compliance/i.test(template.legalDisclaimer));
  });

  it('8. readiness is ready or ready_with_warnings', async () => {
    const fixture = await buildSportsEventSettlementPilotFixture();
    assert.ok(['ready', 'ready_with_warnings'].includes(fixture.kit.readiness.status));
  });
});
