import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthcareOperationsSensitiveDataPilotFixture } from '../../fixtures/healthcare-operations-sensitive-data-pilot.fixture.js';

// A disclaimer legitimately says "does not claim ... healthcare regulatory
// compliance" -- only an *unnegated* match (no "not"/"never"/"n't"/
// "without"/"no"/"claim" anywhere in the same sentence as the match) counts
// as an actual overclaim.
function containsUnnegatedMatch(text: string, pattern: RegExp): boolean {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = global.exec(text)) !== null) {
    const sentenceStart = Math.max(text.lastIndexOf('.', match.index), text.lastIndexOf('\n', match.index));
    const sentence = text.slice(sentenceStart + 1, match.index).toLowerCase();
    if (!/\b(not|never|n't|without|no|claim|claims)\b/.test(sentence)) {
      return true;
    }
  }
  return false;
}

describe('Healthcare pilot end-to-end', () => {
  it('1. builds Healthcare PilotKit', async () => {
    const fixture = await buildHealthcareOperationsSensitiveDataPilotFixture();
    assert.equal(fixture.kit.templateId, 'healthcare-operations-sensitive-data');
  });

  it('2. includes sensitive data scenario', async () => {
    const fixture = await buildHealthcareOperationsSensitiveDataPilotFixture();
    assert.ok(fixture.kit.boundScenarioIds.includes('healthcare-scenario-sensitive-export-requires-approval'));
  });

  it('3. includes approval/evidence scenario', async () => {
    const fixture = await buildHealthcareOperationsSensitiveDataPilotFixture();
    assert.ok(fixture.kit.boundScenarioIds.includes('healthcare-scenario-handoff-requires-evidence'));
  });

  it('4. includes prohibited export scenario', async () => {
    const fixture = await buildHealthcareOperationsSensitiveDataPilotFixture();
    assert.ok(fixture.kit.boundScenarioIds.includes('healthcare-scenario-prohibited-export-denied'));
  });

  it('5. includes healthcare disclaimer', async () => {
    const fixture = await buildHealthcareOperationsSensitiveDataPilotFixture();
    assert.ok(/HIPAA/i.test(fixture.kit.template.legalDisclaimer));
  });

  it('6. no healthcare regulatory compliance overclaim', async () => {
    const fixture = await buildHealthcareOperationsSensitiveDataPilotFixture();
    for (const artifact of fixture.kit.generatedArtifacts.filter((a) => a.type !== 'pilot_json')) {
      assert.equal(containsUnnegatedMatch(artifact.content, /is HIPAA compliant|healthcare regulatory compliance/i), false, `${artifact.type} should not overclaim`);
    }
  });
});
