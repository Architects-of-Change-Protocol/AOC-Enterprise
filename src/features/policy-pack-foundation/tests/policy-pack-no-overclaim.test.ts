import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertNoPolicyPackOverclaim } from '../validation/policy-pack-no-overclaim.js';
import { evaluatePolicyPackClaimSafety } from '../validation/policy-pack-claim-safety.js';
import { detectFoundationRuntimeCapabilities } from '../foundation/foundation-runtime-capabilities.js';
import { createFoundationRuntimeAlignmentReport } from '../foundation/foundation-runtime-report.js';
import {
  buildAiGovernanceManifestFixture,
  buildDemoLegalBaselineManifestFixture,
  buildGlobalBaselineManifestFixture,
  buildPrivacyDomainManifestFixture,
  buildSecurityDomainManifestFixture,
} from '../fixtures/policy-pack-foundation-fixtures.js';

describe('assertNoPolicyPackOverclaim', () => {
  it('26. does not throw for a manifest', () => {
    // A thrown error here fails the test on its own -- no doesNotThrow wrapper needed
    // (not declared in this repo's pinned `node:assert/strict` shim).
    assertNoPolicyPackOverclaim(buildDemoLegalBaselineManifestFixture());
    assertNoPolicyPackOverclaim(buildGlobalBaselineManifestFixture());
    assertNoPolicyPackOverclaim(buildSecurityDomainManifestFixture());
    assertNoPolicyPackOverclaim(buildPrivacyDomainManifestFixture());
    assertNoPolicyPackOverclaim(buildAiGovernanceManifestFixture());
  });

  it('28. does not throw for a foundation alignment report', () => {
    const capabilities = detectFoundationRuntimeCapabilities();
    const report = createFoundationRuntimeAlignmentReport(capabilities);
    assertNoPolicyPackOverclaim(report);
  });

  it('throws when a prohibited overclaim phrase is present', () => {
    assert.throws(() => assertNoPolicyPackOverclaim({ note: 'This pack is legally compliant.' }));
  });
});

describe('evaluatePolicyPackClaimSafety', () => {
  it('29. catches prohibited claims', () => {
    const result = evaluatePolicyPackClaimSafety({
      notes: ['This pack is legally compliant.', 'The system is fully secure.', 'This is GDPR compliant.', 'It is risk-free.', 'This is unbiased AI.'],
    });

    assert.equal(result.safe, false);
    assert.ok(result.prohibitedPhrasesFound.includes('legally compliant'));
    assert.ok(result.prohibitedPhrasesFound.includes('fully secure'));
    assert.ok(result.prohibitedPhrasesFound.includes('GDPR compliant'));
    assert.ok(result.prohibitedPhrasesFound.includes('risk-free'));
    assert.ok(result.prohibitedPhrasesFound.includes('unbiased AI'));
  });

  it('30. safe disclaimers do not cause false positives', () => {
    const result = evaluatePolicyPackClaimSafety({
      notes: ['This is not legal advice.', 'This is not a compliance certification.', 'This pack makes no jurisdictional compliance claim.'],
    });

    assert.equal(result.safe, true);
    assert.deepEqual(result.prohibitedPhrasesFound, []);
  });

  it('does not false-positive on a negated mention of a prohibited phrase', () => {
    const result = evaluatePolicyPackClaimSafety({ note: 'This pack is not GDPR compliant and does not claim to be HIPAA compliant.' });
    assert.equal(result.safe, true);
  });

  it('respects allowedSourceProvidedClaims and labels them as source-provided', () => {
    const result = evaluatePolicyPackClaimSafety(
      { note: 'Outside counsel attested that this configuration is legally compliant in this one instance.' },
      { allowedSourceProvidedClaims: ['legally compliant'] },
    );

    assert.equal(result.safe, true);
    assert.ok(result.warnings.some((warning) => warning.includes('source-provided')));
  });

  it('can disable safe-disclaimer stripping via options', () => {
    const stripped = evaluatePolicyPackClaimSafety('This pack is not GDPR compliant.', { stripSafeDisclaimers: true });
    const unstripped = evaluatePolicyPackClaimSafety('This pack is not GDPR compliant.', { stripSafeDisclaimers: false });

    assert.equal(stripped.safe, true);
    assert.equal(unstripped.safe, false);
  });
});
