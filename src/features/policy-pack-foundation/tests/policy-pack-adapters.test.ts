import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPolicyPackApprovalAdapter } from '../adapters/policy-pack-approval-adapter.js';
import { createPolicyPackEvidenceAdapter } from '../adapters/policy-pack-evidence-adapter.js';
import { createPolicyPackExportAdapter } from '../adapters/policy-pack-export-adapter.js';
import { createPolicyPackControlPlaneAdapter } from '../adapters/policy-pack-control-plane-adapter.js';
import { detectFoundationRuntimeCapabilities } from '../foundation/foundation-runtime-capabilities.js';
import type { FoundationRuntimeIntegrationStatus } from '../foundation/foundation-runtime-types.js';

const MISSING_CAPABILITIES: FoundationRuntimeIntegrationStatus[] = [
  { capability: 'approval_runtime', availability: 'missing', notes: [] },
  { capability: 'evidence_runtime', availability: 'missing', notes: [] },
  { capability: 'verifiable_export_package', availability: 'missing', notes: [] },
  { capability: 'control_plane', availability: 'missing', notes: [] },
];

describe('createPolicyPackApprovalAdapter', () => {
  it('31. maps requirements to ApprovalRuntimeReference records without claiming a real approval', () => {
    const adapter = createPolicyPackApprovalAdapter(detectFoundationRuntimeCapabilities());
    const [reference] = adapter.toApprovalRuntimeReferences([{ id: 'ap-1', reviewType: 'counsel_review', required: true }], 'pack-1');

    assert.equal(reference?.approvalRuntimeRef, 'ap-1');
    assert.equal(reference?.reviewType, 'counsel_review');
    assert.equal(reference?.required, true);
    assert.equal(reference?.sourcePackId, 'pack-1');
    assert.equal(reference?.status, 'reference_only');
  });

  it('reports not_available when the Approval Runtime capability is missing', () => {
    const adapter = createPolicyPackApprovalAdapter(MISSING_CAPABILITIES);
    const [reference] = adapter.toApprovalRuntimeReferences([{ id: 'ap-1', reviewType: 'operator_review', required: true }]);
    assert.equal(reference?.status, 'not_available');
  });
});

describe('createPolicyPackEvidenceAdapter', () => {
  it('32. maps requirements to EvidenceRuntimeReference records, preserving source/citation/proof refs', () => {
    const adapter = createPolicyPackEvidenceAdapter(detectFoundationRuntimeCapabilities());
    const [reference] = adapter.toEvidenceRuntimeReferences(
      [{ id: 'ev-1', evidenceType: 'contract', required: true, sourceRuntimeRef: 'source-1', citationRuntimeRef: 'citation-1', proofRuntimeRef: 'proof-1' }],
      'pack-1',
    );

    assert.equal(reference?.evidenceRuntimeRef, 'ev-1');
    assert.equal(reference?.evidenceType, 'contract');
    assert.equal(reference?.sourceId, 'source-1');
    assert.equal(reference?.citationId, 'citation-1');
    assert.equal(reference?.proofId, 'proof-1');
    assert.equal(reference?.status, 'reference_only');
  });
});

describe('createPolicyPackExportAdapter', () => {
  it('33. maps requirements to ExportRuntimeReference records without claiming an export was created', () => {
    const adapter = createPolicyPackExportAdapter(detectFoundationRuntimeCapabilities());
    const [reference] = adapter.toExportRuntimeReferences([{ id: 'ex-1', exportType: 'audit_bundle', required: true }], 'pack-1');

    assert.equal(reference?.exportRuntimeRef, 'ex-1');
    assert.equal(reference?.status, 'reference_only');
  });

  it('reports not_available when the export capability is missing', () => {
    const adapter = createPolicyPackExportAdapter(MISSING_CAPABILITIES);
    const [reference] = adapter.toExportRuntimeReferences([{ id: 'ex-1', exportType: 'audit_bundle', required: true }]);
    assert.equal(reference?.status, 'not_available');
  });
});

describe('createPolicyPackControlPlaneAdapter', () => {
  it('34. maps requirements to ControlPlaneReference records, preserving safe display labels', () => {
    const adapter = createPolicyPackControlPlaneAdapter(detectFoundationRuntimeCapabilities());
    const [reference] = adapter.toControlPlaneReferences(
      [{ id: 'cp-1', surface: 'policy_pack', required: true, safeDisplayLabels: ['not_legal_advice', 'partial_policy_model'] }],
      'pack-1',
    );

    assert.equal(reference?.controlPlaneRef, 'cp-1');
    assert.deepEqual(reference?.displaySafeLabels, ['not_legal_advice', 'partial_policy_model']);
    assert.equal(reference?.status, 'reference_only');
  });

  it('drops an unsafe display label rather than surfacing it', () => {
    const adapter = createPolicyPackControlPlaneAdapter(detectFoundationRuntimeCapabilities());
    const [reference] = adapter.toControlPlaneReferences([{ id: 'cp-1', surface: 'policy_pack', required: true, safeDisplayLabels: ['legally compliant', 'not_legal_advice'] }]);

    assert.ok(!reference?.displaySafeLabels.includes('legally compliant'));
    assert.ok(reference?.displaySafeLabels.includes('not_legal_advice'));
  });
});
