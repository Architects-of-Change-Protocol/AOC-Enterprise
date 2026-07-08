import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { composeJurisdictionWithBaseline } from '../jurisdiction-pack-composer.js';
import { mapJurisdictionResolutionToApproval } from '../jurisdiction-pack-approval.js';
import { mapJurisdictionResolutionToEvidenceRequirements } from '../jurisdiction-pack-evidence.js';
import { createJurisdictionExportMetadata } from '../jurisdiction-pack-export.js';
import { createJurisdictionControlPlaneSummary } from '../jurisdiction-pack-control-plane.js';
import { buildJurisdictionPackWithRequirementsFixture } from '../jurisdiction-pack-fixtures.js';
import { buildGlobalBaselineManifestFixture } from '../../../policy-pack-foundation/fixtures/policy-pack-foundation-fixtures.js';
import { detectFoundationRuntimeCapabilities, findFoundationRuntimeCapabilityStatus } from '../../../policy-pack-foundation/foundation/foundation-runtime-capabilities.js';
import { JURISDICTION_CONTROL_PLANE_SAFE_LABELS } from '../jurisdiction-pack-constants.js';

const UNSAFE_LABELS = [
  'Legal compliance passed',
  'Compliant with law',
  'Costa Rica compliant',
  'EU compliant',
  'US compliant',
  'Fully legal',
  'Regulatory approved',
  'Certified compliant',
];

function buildComposition() {
  const jurisdictionPack = buildJurisdictionPackWithRequirementsFixture();
  const baseline = buildGlobalBaselineManifestFixture();
  return composeJurisdictionWithBaseline({
    compositionId: 'test-adapter-composition',
    jurisdictionPack,
    baselinePackId: baseline.id,
    availableManifests: [baseline],
  });
}

describe('Jurisdiction Pack Runtime maps to shared Foundation adapter references', () => {
  it('10. evidence requirements map to shared EvidenceRuntimeReference shape without a separate evidence runtime', () => {
    const composition = buildComposition();
    const capabilities = detectFoundationRuntimeCapabilities();
    const [reference] = mapJurisdictionResolutionToEvidenceRequirements(composition, capabilities);

    assert.ok(reference);
    assert.equal(reference?.evidenceRuntimeRef, 'demo-jurisdiction-basis-source');
    assert.equal(reference?.evidenceType, 'jurisdiction_basis_source');
    assert.equal(reference?.required, true);
    assert.ok(['reference_only', 'not_available'].includes(reference?.status ?? ''));
  });

  it('11. approval requirements map to shared ApprovalRuntimeReference shape without a separate approval runtime', () => {
    const composition = buildComposition();
    const capabilities = detectFoundationRuntimeCapabilities();
    const [reference] = mapJurisdictionResolutionToApproval(composition, capabilities);

    assert.ok(reference);
    assert.equal(reference?.approvalRuntimeRef, 'demo-jurisdiction-counsel-review');
    assert.equal(reference?.reviewType, 'counsel_review');
    assert.equal(reference?.required, true);
    assert.ok(['reference_only', 'not_available'].includes(reference?.status ?? ''));
  });

  it('the approval reference status matches the real approval_runtime capability -- reference_only when available, never a fabricated "approved"', () => {
    const composition = buildComposition();
    const capabilities = detectFoundationRuntimeCapabilities();
    const approvalCapability = findFoundationRuntimeCapabilityStatus(capabilities, 'approval_runtime');
    const [reference] = mapJurisdictionResolutionToApproval(composition, capabilities);

    assert.equal(approvalCapability?.availability, 'available');
    assert.equal(reference?.status, 'reference_only');
  });

  it('12. export metadata is claim-safe and preserves shared safe framing', () => {
    const composition = buildComposition();
    const capabilities = detectFoundationRuntimeCapabilities();
    const metadata = createJurisdictionExportMetadata({ exportId: 'test-export-12', composition, capabilities });

    assert.equal(metadata.safeFraming.notLegalAdvice, true);
    assert.equal(metadata.safeFraming.notComplianceCertification, true);
    assert.equal(metadata.safeFraming.noJurisdictionalComplianceClaim, true);
    for (const unsafeLabel of UNSAFE_LABELS) {
      assert.ok(!JSON.stringify(metadata).includes(unsafeLabel), `export metadata must not mention "${unsafeLabel}"`);
    }
  });

  it('13. Control Plane summary uses safe shared labels and never unsafe compliance claims', () => {
    const composition = buildComposition();
    const capabilities = detectFoundationRuntimeCapabilities();
    const summary = createJurisdictionControlPlaneSummary({ composition, capabilities });

    for (const safeLabel of JURISDICTION_CONTROL_PLANE_SAFE_LABELS) {
      assert.ok(summary.displaySafeLabels.includes(safeLabel), `expected safe label "${safeLabel}" to be present`);
    }
    for (const unsafeLabel of UNSAFE_LABELS) {
      assert.ok(!summary.displaySafeLabels.includes(unsafeLabel), `Control Plane summary must not include "${unsafeLabel}"`);
    }
  });
});
