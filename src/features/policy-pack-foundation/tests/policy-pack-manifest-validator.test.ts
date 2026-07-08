import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validatePolicyPackManifest } from '../manifest/policy-pack-manifest-validator.js';
import { assertNoPolicyPackOverclaim } from '../validation/policy-pack-no-overclaim.js';
import { buildDemoLegalBaselineManifestFixture } from '../fixtures/policy-pack-foundation-fixtures.js';
import type { PolicyPackManifest } from '../manifest/policy-pack-manifest-types.js';

/** Portable equivalent of `assert.doesNotMatch` (not declared in this repo's pinned `node:assert/strict` shim). */
function assertDoesNotMatch(text: string, pattern: RegExp): void {
  assert.equal(pattern.test(text), false, `expected "${text}" not to match ${pattern}`);
}

const BASE_SAFE_FRAMING = {
  notLegalAdvice: true,
  notComplianceCertification: true,
  noCompletenessClaim: true,
  noJurisdictionalComplianceClaim: true,
  partialPolicyModel: true,
};

function baseManifest(overrides: Partial<PolicyPackManifest> = {}): PolicyPackManifest {
  return {
    id: 'aoc.demo.base.v1',
    name: 'Base Demo Pack',
    version: '1.0.0',
    kind: 'demo_pack',
    domain: 'legal',
    scope: { global: false, jurisdictionSpecific: false, domainSpecific: false, useCaseSpecific: false, customerSpecific: false, demoOnly: true, systemAuthored: true },
    status: 'demo_baseline',
    sourceStatus: 'demo_fixture',
    safeFraming: BASE_SAFE_FRAMING,
    description: 'A base demo pack for validator tests.',
    extendsPackIds: [],
    requiredPackIds: [],
    optionalPackIds: [],
    evidenceRequirements: [],
    approvalRequirements: [],
    exportRequirements: [],
    controlPlaneRequirements: [],
    claimProfile: { allowedClaims: [], prohibitedClaims: [], requiredDisclaimers: ['not_legal_advice'], claimValidationStatus: 'demo_baseline' },
    labels: ['not_legal_advice'],
    notes: [],
    ...overrides,
  };
}

describe('validatePolicyPackManifest', () => {
  it('7. validates a safe demo legal baseline manifest', () => {
    const manifest = buildDemoLegalBaselineManifestFixture();
    const result = validatePolicyPackManifest(manifest);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('8. rejects a manifest with a missing id or version', () => {
    const missingId = validatePolicyPackManifest(baseManifest({ id: '' }));
    assert.equal(missingId.valid, false);

    const missingVersion = validatePolicyPackManifest(baseManifest({ version: '' }));
    assert.equal(missingVersion.valid, false);
  });

  it('9. rejects a legal advice overclaim', () => {
    const manifest = baseManifest({ safeFraming: { ...BASE_SAFE_FRAMING, notLegalAdvice: false } });
    const result = validatePolicyPackManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('legal advice')));
  });

  it('10. rejects a compliance certification overclaim', () => {
    const manifest = baseManifest({ safeFraming: { ...BASE_SAFE_FRAMING, notComplianceCertification: false } });
    const result = validatePolicyPackManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('compliance certification')));
  });

  it('11. rejects a completeness claim', () => {
    const manifest = baseManifest({ safeFraming: { ...BASE_SAFE_FRAMING, noCompletenessClaim: false } });
    const result = validatePolicyPackManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('complete policy model')));
  });

  it('12. domain labels do not imply compliance', () => {
    for (const domain of ['healthcare', 'finance', 'jurisdiction'] as const) {
      const manifest = baseManifest({ domain });
      const result = validatePolicyPackManifest(manifest);
      const combinedText = [...result.errors, ...result.warnings].join(' ').toLowerCase();
      assertDoesNotMatch(combinedText, /healthcare compliant/);
      assertDoesNotMatch(combinedText, /finance compliant/);
      assertDoesNotMatch(combinedText, /financial compliant/);
      assertDoesNotMatch(combinedText, /jurisdictionally compliant/);
      assertNoPolicyPackOverclaim(result);
    }
  });

  it('requires demo packs to set scope.demoOnly', () => {
    const manifest = baseManifest({ scope: { ...baseManifest().scope, demoOnly: false } });
    const result = validatePolicyPackManifest(manifest);
    assert.equal(result.valid, false);
  });

  it('requires customer packs to set scope.customerSpecific', () => {
    const manifest = baseManifest({
      kind: 'customer_pack',
      sourceStatus: 'customer_provided',
      scope: { global: false, jurisdictionSpecific: false, domainSpecific: false, useCaseSpecific: false, customerSpecific: false, demoOnly: false, systemAuthored: false },
    });
    const result = validatePolicyPackManifest(manifest);
    assert.equal(result.valid, false);
  });

  it('requires a superseded pack to identify supersededByPackId', () => {
    const manifest = baseManifest({ status: 'superseded' });
    const result = validatePolicyPackManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('supersededByPackId')));
  });

  it('rejects overclaiming manifest text even outside safeFraming flags', () => {
    const manifest = baseManifest({ description: 'This pack guarantees a guaranteed outcome and is fully secure.' });
    const result = validatePolicyPackManifest(manifest);
    assert.equal(result.valid, false);
  });
});
