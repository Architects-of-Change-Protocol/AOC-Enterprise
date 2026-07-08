import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDatasysProjectGovernancePilotFixture } from '../../fixtures/datasys-project-governance-pilot.fixture.js';

const FORBIDDEN_COMPLIANCE_PATTERNS: readonly RegExp[] = [/proves? (legal|regulatory|production) compliance/i, /is (fully )?compliant/i, /legally binding/i];

// A disclaimer legitimately says "does not prove production compliance" --
// only an *unnegated* match (no "not"/"never"/"n't"/"without"/"no" anywhere
// in the same sentence as the match) counts as an actual overclaim.
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

describe('Datasys pilot end-to-end', () => {
  it('1. builds Datasys PilotKit', async () => {
    const fixture = await buildDatasysProjectGovernancePilotFixture();
    assert.equal(fixture.kit.templateId, 'datasys-project-governance');
  });

  it('2. binds scenarios', async () => {
    const fixture = await buildDatasysProjectGovernancePilotFixture();
    assert.ok(fixture.kit.boundScenarioIds.length === fixture.kit.template.scenarios.length);
  });

  it('3. binds policy packs', async () => {
    const fixture = await buildDatasysProjectGovernancePilotFixture();
    assert.ok(fixture.kit.boundPolicyPackIds.includes('policy-pack-procurement-basic'));
  });

  it('4. binds evidence references', async () => {
    const fixture = await buildDatasysProjectGovernancePilotFixture();
    assert.ok(fixture.evidenceFixture.invoiceRequirement.id.length > 0);
  });

  it('5. binds export package references', async () => {
    const fixture = await buildDatasysProjectGovernancePilotFixture();
    assert.ok(fixture.kit.boundExportPackageIds.length > 0);
  });

  it('6. generates artifacts', async () => {
    const fixture = await buildDatasysProjectGovernancePilotFixture();
    assert.equal(fixture.kit.generatedArtifacts.length, 7);
  });

  it('7. readiness is ready or ready_with_warnings', async () => {
    const fixture = await buildDatasysProjectGovernancePilotFixture();
    assert.ok(['ready', 'ready_with_warnings'].includes(fixture.kit.readiness.status));
  });

  it('8. no legal compliance overclaim', async () => {
    const fixture = await buildDatasysProjectGovernancePilotFixture();
    // pilot_json is a raw structured dump of the template (including risk
    // descriptions that must name the very overclaim they warn against) --
    // narrative artifacts are what must never overclaim.
    for (const artifact of fixture.kit.generatedArtifacts.filter((a) => a.type !== 'pilot_json')) {
      for (const pattern of FORBIDDEN_COMPLIANCE_PATTERNS) {
        assert.equal(containsUnnegatedMatch(artifact.content, pattern), false, `${artifact.type} should not match ${pattern}`);
      }
    }
  });
});
