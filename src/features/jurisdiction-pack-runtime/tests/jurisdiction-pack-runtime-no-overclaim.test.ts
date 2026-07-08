import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertNoPolicyPackOverclaim } from '../../policy-pack-foundation/index.js';
import { JURISDICTION_CODE_DEMO_ALPHA, buildDemoJurisdictionPackRuntimeFixture } from '../fixtures/jurisdiction-pack-runtime-fixtures.js';

describe('jurisdiction-pack-runtime claim safety', () => {
  it('does not overclaim in registered jurisdiction pack manifests', () => {
    const { jurisdictionAlpha, jurisdictionBeta, globalBaseline } = buildDemoJurisdictionPackRuntimeFixture();
    assertNoPolicyPackOverclaim(jurisdictionAlpha);
    assertNoPolicyPackOverclaim(jurisdictionBeta);
    assertNoPolicyPackOverclaim(globalBaseline);
  });

  it('does not overclaim in a resolution result', () => {
    const { runtime, globalBaseline } = buildDemoJurisdictionPackRuntimeFixture();
    const result = runtime.resolve({ jurisdictionCode: JURISDICTION_CODE_DEMO_ALPHA, availableManifests: [globalBaseline] });
    assertNoPolicyPackOverclaim(result);
  });

  it('does not overclaim in an unresolved resolution result', () => {
    const { runtime } = buildDemoJurisdictionPackRuntimeFixture();
    const result = runtime.resolve({ jurisdictionCode: 'unknown-jurisdiction' });
    assertNoPolicyPackOverclaim(result);
  });
});
