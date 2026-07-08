import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSportsEventSettlementPilotFixture } from '../../fixtures/sports-event-settlement-pilot.fixture.js';

describe('Sports settlement pilot end-to-end', () => {
  it('1. builds Sports PilotKit', async () => {
    const fixture = await buildSportsEventSettlementPilotFixture();
    assert.equal(fixture.kit.templateId, 'sports-event-settlement');
  });

  it('2. includes event_record evidence requirement', async () => {
    const fixture = await buildSportsEventSettlementPilotFixture();
    assert.ok(fixture.kit.template.evidenceModel.evidenceScenarios.some((s) => s.requiredEvidenceTypes.includes('event_record')));
  });

  it('3. includes settlement action', async () => {
    const fixture = await buildSportsEventSettlementPilotFixture();
    assert.ok(fixture.kit.template.actions.some((a) => a.action === 'settle_event_payment'));
  });

  it('4. includes export package reference', async () => {
    const fixture = await buildSportsEventSettlementPilotFixture();
    assert.ok(fixture.kit.boundExportPackageIds.length > 0);
  });

  it('5. includes settlement/payment disclaimer', async () => {
    const fixture = await buildSportsEventSettlementPilotFixture();
    assert.ok(/smart-contract legal enforceability/i.test(fixture.kit.template.legalDisclaimer));
  });

  it('6. no smart-contract legal enforceability claim', async () => {
    const fixture = await buildSportsEventSettlementPilotFixture();
    // pilot_json is a raw structured dump of the template, including risk
    // descriptions that must name the very overclaim they warn buyers
    // against ("buyers may assume the settlement is a legally enforceable
    // smart contract") -- narrative artifacts are what must never overclaim.
    for (const artifact of fixture.kit.generatedArtifacts.filter((a) => a.type !== 'pilot_json')) {
      assert.equal(/is a legally enforceable smart contract/i.test(artifact.content), false, `${artifact.type} should not overclaim`);
    }
  });
});
