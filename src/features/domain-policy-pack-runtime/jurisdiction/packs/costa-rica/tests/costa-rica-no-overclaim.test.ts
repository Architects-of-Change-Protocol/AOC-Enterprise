import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { assertNoPolicyPackOverclaim } from '../../../../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { evaluatePolicyPackClaimSafety } from '../../../../../policy-pack-foundation/validation/policy-pack-claim-safety.js';
import { createCostaRicaBaseJurisdictionPack } from '../costa-rica-base-pack.js';
import { createCostaRicaJurisdictionDescriptor } from '../costa-rica-jurisdiction-descriptor.js';
import { validateJurisdictionPack } from '../../../jurisdiction-pack-validator.js';
import { createJurisdictionPackRegistry } from '../../../jurisdiction-pack-registry.js';
import { composeJurisdictionWithBaseline } from '../../../jurisdiction-pack-composer.js';
import { resolveCostaRicaJurisdictionAction } from '../costa-rica-resolution.js';
import { buildGlobalBaselineManifestFixture } from '../../../../../policy-pack-foundation/fixtures/policy-pack-foundation-fixtures.js';
import { COSTA_RICA_REQUIRED_BASELINE_PACK_ID } from '../costa-rica-constants.js';

describe('Costa Rica Base Pack passes the universal no-overclaim harness', () => {
  it('5. no-overclaim passes for the manifest, descriptor, validation result, registry, resolution, and composition', () => {
    const pack = createCostaRicaBaseJurisdictionPack();
    assertNoPolicyPackOverclaim(pack);
    assertNoPolicyPackOverclaim(pack.manifest);
    assertNoPolicyPackOverclaim(createCostaRicaJurisdictionDescriptor());
    assertNoPolicyPackOverclaim(validateJurisdictionPack(pack));

    const registry = createJurisdictionPackRegistry([pack]);
    assertNoPolicyPackOverclaim(registry.list());

    const baseline = buildGlobalBaselineManifestFixture();
    const composition = composeJurisdictionWithBaseline({
      compositionId: 'costa-rica-no-overclaim-composition',
      jurisdictionPack: pack,
      baselinePackId: COSTA_RICA_REQUIRED_BASELINE_PACK_ID,
      availableManifests: [baseline],
    });
    assertNoPolicyPackOverclaim(composition);

    const resolution = resolveCostaRicaJurisdictionAction({
      compositionId: 'costa-rica-no-overclaim-resolution',
      jurisdiction: { countryCode: 'CR' },
      legallySensitive: true,
      registry,
      baselineManifests: [baseline],
      requiredValidationStatus: 'counsel_reviewed',
    });
    assertNoPolicyPackOverclaim(resolution);
  });

  it('6. rejects an unsafe Costa Rica compliance claim', () => {
    const unsafe = evaluatePolicyPackClaimSafety('This action is Costa Rica compliant.');
    assert.equal(unsafe.safe, false);
    assert.ok(unsafe.prohibitedPhrasesFound.length > 0);
    assert.throws(() => assertNoPolicyPackOverclaim('This action is Costa Rica compliant.'));
  });

  it('safe disclaimers do not produce false positives', () => {
    const safe = evaluatePolicyPackClaimSafety(
      'not legal advice; not compliance certification; no jurisdictional compliance claim; no Costa Rica compliance claimed',
    );
    assert.equal(safe.safe, true);
  });

  it('22. no real Costa Rican legal content is encoded in this pack\'s implementation', () => {
    // Hardcoded, not filesystem-scanned -- mirrors jurisdiction-pack-runtime-determinism.test.ts.
    const sourceFiles = [
      'costa-rica-constants.ts',
      'costa-rica-jurisdiction-descriptor.ts',
      'costa-rica-review-triggers.ts',
      'costa-rica-evidence-requirements.ts',
      'costa-rica-approval-requirements.ts',
      'costa-rica-export-requirements.ts',
      'costa-rica-control-plane.ts',
      'costa-rica-base-pack.ts',
      'costa-rica-resolution.ts',
      'costa-rica-registry.ts',
      'costa-rica-fixtures.ts',
      'index.ts',
    ];
    const prohibitedPatterns = [/civil code/i, /commercial code/i, /labor code/i, /criminal code/i, /tax code/i, /law article/i, /\bstatute\b/i, /regulation number/i, /legal article/i];

    for (const file of sourceFiles) {
      const raw = readFileSync(resolve(process.cwd(), 'src/features/domain-policy-pack-runtime/jurisdiction/packs/costa-rica', file), 'utf8');
      // Strip comments before scanning: a disclaimer in a comment ("never encodes any
      // Costa Rican statute") is documentation, not encoded legal content. Encoded law
      // would appear in actual data/identifiers, which comment-stripping does not touch.
      const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
      for (const pattern of prohibitedPatterns) {
        assert.equal(pattern.test(withoutComments), false, `${file} contains prohibited legal-content pattern ${pattern} outside of a comment/disclaimer`);
      }
    }
  });
});
