import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectFoundationRuntimeCapabilities } from '../foundation/foundation-runtime-capabilities.js';
import { createFoundationRuntimeReferenceMap } from '../foundation/foundation-runtime-references.js';
import { validateFoundationRuntimeReferences } from '../foundation/foundation-runtime-validation.js';
import { createFoundationRuntimeAlignmentReport } from '../foundation/foundation-runtime-report.js';
import type { FoundationRuntimeIntegrationStatus } from '../foundation/foundation-runtime-types.js';

/** Portable equivalent of `assert.doesNotMatch` (not declared in this repo's pinned `node:assert/strict` shim). */
function assertDoesNotMatch(text: string, pattern: RegExp): void {
  assert.equal(pattern.test(text), false, `expected "${text}" not to match ${pattern}`);
}

const REFERENCE_ONLY_CAPABILITIES: FoundationRuntimeIntegrationStatus[] = [
  { capability: 'approval_runtime', availability: 'reference_only', notes: ['test fixture'] },
  { capability: 'evidence_runtime', availability: 'reference_only', notes: ['test fixture'] },
  { capability: 'source_runtime', availability: 'reference_only', notes: ['test fixture'] },
  { capability: 'citation_runtime', availability: 'reference_only', notes: ['test fixture'] },
  { capability: 'proof_runtime', availability: 'reference_only', notes: ['test fixture'] },
  { capability: 'verifiable_export_package', availability: 'reference_only', notes: ['test fixture'] },
  { capability: 'control_plane', availability: 'reference_only', notes: ['test fixture'] },
];

const MISSING_CAPABILITIES: FoundationRuntimeIntegrationStatus[] = REFERENCE_ONLY_CAPABILITIES.map((status) => ({ ...status, availability: 'missing' }));

describe('createFoundationRuntimeReferenceMap', () => {
  it('2. normalizes every reference category safely', () => {
    const referenceMap = createFoundationRuntimeReferenceMap({
      capabilities: REFERENCE_ONLY_CAPABILITIES,
      approval: [{ approvalRuntimeRef: 'approval-1', reviewType: 'counsel_review', required: true, status: 'reference_only' }],
      evidence: [{ evidenceRuntimeRef: 'evidence-1', evidenceType: 'contract', required: true, status: 'reference_only' }],
      source: [{ sourceRuntimeRef: 'source-1', sourceType: 'customer_policy', required: true, status: 'reference_only' }],
      citation: [{ citationRuntimeRef: 'citation-1', citationType: 'source_excerpt', required: false, status: 'reference_only' }],
      proof: [{ proofRuntimeRef: 'proof-1', proofType: 'policy_decision', required: false, status: 'reference_only' }],
      export: [{ exportRuntimeRef: 'export-1', exportType: 'audit_bundle', required: true, status: 'reference_only' }],
      controlPlane: [{ controlPlaneRef: 'control-plane-1', surface: 'policy_pack', displaySafeLabels: ['not_legal_advice'], status: 'reference_only' }],
    });

    assert.equal(referenceMap.approval?.[0]?.status, 'reference_only');
    assert.equal(referenceMap.evidence?.[0]?.status, 'reference_only');
    assert.equal(referenceMap.source?.[0]?.status, 'reference_only');
    assert.equal(referenceMap.citation?.[0]?.status, 'reference_only');
    assert.equal(referenceMap.proof?.[0]?.status, 'reference_only');
    assert.equal(referenceMap.export?.[0]?.status, 'reference_only');
    assert.equal(referenceMap.controlPlane?.[0]?.status, 'reference_only');
    assert.equal(referenceMap.approval?.[0]?.required, true);
  });

  it('never lets a missing capability be reported as available', () => {
    const referenceMap = createFoundationRuntimeReferenceMap({
      capabilities: MISSING_CAPABILITIES,
      approval: [{ approvalRuntimeRef: 'approval-1', reviewType: 'counsel_review', required: true, status: 'approved' }],
      export: [{ exportRuntimeRef: 'export-1', exportType: 'audit_bundle', required: true, status: 'available' }],
    });

    assert.equal(referenceMap.approval?.[0]?.status, 'not_available');
    assert.equal(referenceMap.export?.[0]?.status, 'not_available');
  });
});

describe('validateFoundationRuntimeReferences', () => {
  it('3. reference-only approval/evidence/export integrations validate safely without claiming execution', () => {
    const referenceMap = createFoundationRuntimeReferenceMap({
      capabilities: REFERENCE_ONLY_CAPABILITIES,
      approval: [{ approvalRuntimeRef: 'approval-1', reviewType: 'counsel_review', required: true, status: 'reference_only' }],
      evidence: [{ evidenceRuntimeRef: 'evidence-1', evidenceType: 'contract', required: true, status: 'reference_only' }],
      export: [{ exportRuntimeRef: 'export-1', exportType: 'audit_bundle', required: true, status: 'reference_only' }],
    });

    const result = validateFoundationRuntimeReferences(referenceMap, REFERENCE_ONLY_CAPABILITIES);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    for (const warning of result.warnings) {
      assertDoesNotMatch(warning.toLowerCase(), /has actually (approved|executed|been exported)/);
    }
  });

  it('4. rejects fake availability for a runtime marked missing/reference_only', () => {
    const referenceMap = {
      export: [{ exportRuntimeRef: 'export-1', exportType: 'audit_bundle' as const, required: true, status: 'available' as const }],
    };

    const result = validateFoundationRuntimeReferences(referenceMap, MISSING_CAPABILITIES);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('unavailable runtime cannot be treated as available')));
  });

  it('rejects an approval reference claiming approved status against a missing capability', () => {
    const referenceMap = {
      approval: [{ approvalRuntimeRef: 'approval-1', reviewType: 'counsel_review' as const, required: true, status: 'approved' as const }],
    };

    const result = validateFoundationRuntimeReferences(referenceMap, MISSING_CAPABILITIES);

    assert.equal(result.valid, false);
  });

  it('flags a required reference with a blank id', () => {
    const referenceMap = {
      approval: [{ approvalRuntimeRef: '', reviewType: 'counsel_review' as const, required: true, status: 'reference_only' as const }],
    };

    const result = validateFoundationRuntimeReferences(referenceMap, REFERENCE_ONLY_CAPABILITIES);

    assert.equal(result.valid, false);
  });
});

describe('createFoundationRuntimeAlignmentReport', () => {
  it('5. distinguishes available, reference-only, planned, missing, and disabled capabilities', () => {
    const capabilities = detectFoundationRuntimeCapabilities();
    const report = createFoundationRuntimeAlignmentReport(capabilities);

    assert.ok(Array.isArray(report.availableCapabilities));
    assert.ok(Array.isArray(report.referenceOnlyCapabilities));
    assert.ok(Array.isArray(report.plannedCapabilities));
    assert.ok(Array.isArray(report.missingCapabilities));
    assert.ok(Array.isArray(report.disabledCapabilities));
    assert.ok(Array.isArray(report.warnings));
    assert.ok(Array.isArray(report.errors));
    assert.ok(report.availableCapabilities.includes('policy_pack_manifest_standard'));
    assert.ok(['aligned', 'aligned_with_reference_only_integrations'].includes(report.status));
  });

  it('reports blocked when reference validation fails', () => {
    const referenceMap = {
      export: [{ exportRuntimeRef: 'export-1', exportType: 'audit_bundle' as const, required: true, status: 'available' as const }],
    };
    const report = createFoundationRuntimeAlignmentReport(MISSING_CAPABILITIES, referenceMap);
    assert.equal(report.status, 'blocked');
    assert.ok(report.errors.length > 0);
  });
});
