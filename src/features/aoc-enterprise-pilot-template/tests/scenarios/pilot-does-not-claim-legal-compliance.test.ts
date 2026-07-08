import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFoundationV1CompleteFixture } from '../../fixtures/foundation-v1-complete.fixture.js';
import type { PilotGeneratedArtifact } from '../../domain/pilot-kit.js';

const FORBIDDEN_CLAIM_PATTERNS: readonly RegExp[] = [
  /is (fully )?compliant/i,
  /proves? (legal|regulatory|production|banking regulatory|healthcare regulatory) compliance/i,
  /guarantees? compliance/i,
  /certified complian/i,
  /legally binding/i,
  /is a legally enforceable smart contract/i,
];

// A disclaimer legitimately says "does not prove production compliance" or
// "does not claim ... healthcare regulatory compliance" -- only an
// *unnegated* match (no "not"/"never"/"n't"/"without"/"no"/"claim" anywhere
// in the same sentence as the match) counts as an actual overclaim.
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

async function allArtifacts(): Promise<readonly PilotGeneratedArtifact[]> {
  const fixture = await buildFoundationV1CompleteFixture();
  return fixture.kits.flatMap((kit) => kit.generatedArtifacts);
}

// pilot_json is a raw structured dump of the full template -- including risk
// descriptions that must legitimately name the very overclaim they warn
// buyers against. Narrative artifacts are what must never overclaim.
function narrativeOnly(artifacts: readonly PilotGeneratedArtifact[]): readonly PilotGeneratedArtifact[] {
  return artifacts.filter((a) => a.type !== 'pilot_json');
}

describe('Pilot templates do not claim legal compliance', () => {
  it('1. scans generated pilot_readme artifacts', async () => {
    const artifacts = (await allArtifacts()).filter((a) => a.type === 'pilot_readme');
    assert.ok(artifacts.length > 0);
    for (const artifact of artifacts) {
      for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
        assert.equal(containsUnnegatedMatch(artifact.content, pattern), false, `${artifact.title} matched ${pattern}`);
      }
    }
  });

  it('2. scans buyer_summary artifacts', async () => {
    const artifacts = (await allArtifacts()).filter((a) => a.type === 'buyer_summary');
    assert.ok(artifacts.length > 0);
    for (const artifact of artifacts) {
      for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
        assert.equal(containsUnnegatedMatch(artifact.content, pattern), false, `${artifact.title} matched ${pattern}`);
      }
    }
  });

  it('3. scans demo_script artifacts', async () => {
    const artifacts = (await allArtifacts()).filter((a) => a.type === 'demo_script');
    assert.ok(artifacts.length > 0);
    for (const artifact of artifacts) {
      for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
        assert.equal(containsUnnegatedMatch(artifact.content, pattern), false, `${artifact.title} matched ${pattern}`);
      }
    }
  });

  it('4. asserts no forbidden legal compliance claims across every narrative artifact', async () => {
    const artifacts = narrativeOnly(await allArtifacts());
    assert.ok(artifacts.length > 0);
    for (const artifact of artifacts) {
      for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
        assert.equal(containsUnnegatedMatch(artifact.content, pattern), false, `${artifact.type}/${artifact.title} matched ${pattern}`);
      }
    }
  });

  it('5. asserts legal disclaimer present', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    for (const kit of fixture.kits) {
      assert.ok(kit.template.legalDisclaimer.length > 0);
    }
  });

  it('6. asserts demo-only / not legal advice language present', async () => {
    const artifacts = (await allArtifacts()).filter((a) => a.type === 'pilot_readme' || a.type === 'buyer_summary' || a.type === 'demo_script');
    for (const artifact of artifacts) {
      assert.ok(/not legal advice/i.test(artifact.content), `${artifact.type} should carry "not legal advice" language`);
    }
  });
});
