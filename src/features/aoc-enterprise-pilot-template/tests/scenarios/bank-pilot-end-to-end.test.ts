import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBankPaymentsProcurementDataPilotFixture } from '../../fixtures/bank-payments-procurement-data-pilot.fixture.js';

// A disclaimer legitimately says "does not prove banking regulatory
// compliance" -- only an *unnegated* match (no "not"/"never"/"n't"/
// "without"/"no" anywhere in the same sentence as the match) counts as an
// actual overclaim.
function containsUnnegatedMatch(text: string, pattern: RegExp): boolean {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = global.exec(text)) !== null) {
    const sentenceStart = Math.max(text.lastIndexOf('.', match.index), text.lastIndexOf('\n', match.index));
    const sentence = text.slice(sentenceStart + 1, match.index).toLowerCase();
    if (!/\b(not|never|n't|without|no)\b/.test(sentence)) {
      return true;
    }
  }
  return false;
}

describe('Bank pilot end-to-end', () => {
  it('1. builds Bank PilotKit', async () => {
    const fixture = await buildBankPaymentsProcurementDataPilotFixture();
    assert.equal(fixture.kit.templateId, 'bank-payments-procurement-data');
  });

  it('2. includes payment approval required scenario', async () => {
    const fixture = await buildBankPaymentsProcurementDataPilotFixture();
    assert.ok(fixture.kit.boundScenarioIds.includes('bank-scenario-payment-requires-finance-approval'));
  });

  it('3. includes bank account denied scenario', async () => {
    const fixture = await buildBankPaymentsProcurementDataPilotFixture();
    assert.ok(fixture.kit.boundScenarioIds.includes('bank-scenario-bank-account-change-denied'));
  });

  it('4. includes invoice evidence scenario', async () => {
    const fixture = await buildBankPaymentsProcurementDataPilotFixture();
    assert.ok(fixture.kit.boundScenarioIds.includes('bank-scenario-invoice-support-requires-evidence'));
  });

  it('5. includes data export scenario', async () => {
    const fixture = await buildBankPaymentsProcurementDataPilotFixture();
    assert.ok(fixture.kit.boundScenarioIds.includes('bank-scenario-data-export-requires-compliance'));
    assert.ok(fixture.kit.boundScenarioIds.includes('bank-scenario-prohibited-data-export-denied'));
  });

  it('6. includes verified export package reference', async () => {
    const fixture = await buildBankPaymentsProcurementDataPilotFixture();
    assert.ok(fixture.kit.boundExportPackageIds.length > 0);
    assert.ok(fixture.kit.readiness.verifiedExportPackageIds.length > 0);
  });

  it('7. no banking compliance overclaim', async () => {
    const fixture = await buildBankPaymentsProcurementDataPilotFixture();
    for (const artifact of fixture.kit.generatedArtifacts.filter((a) => a.type !== 'pilot_json')) {
      assert.equal(containsUnnegatedMatch(artifact.content, /proves? banking regulatory compliance/i), false, `${artifact.type} should not overclaim`);
    }
  });
});
