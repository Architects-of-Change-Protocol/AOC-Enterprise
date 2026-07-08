import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectFoundationRuntimeCapabilities, findFoundationRuntimeCapabilityStatus } from '../foundation/foundation-runtime-capabilities.js';

describe('detectFoundationRuntimeCapabilities', () => {
  it('1. detects available and reference-only/planned capabilities truthfully', () => {
    const capabilities = detectFoundationRuntimeCapabilities();

    const recognition = findFoundationRuntimeCapabilityStatus(capabilities, 'recognition_runtime');
    assert.equal(recognition?.availability, 'available');

    const manifestStandard = findFoundationRuntimeCapabilityStatus(capabilities, 'policy_pack_manifest_standard');
    assert.equal(manifestStandard?.availability, 'available');

    const jurisdictionPackRuntime = findFoundationRuntimeCapabilityStatus(capabilities, 'jurisdiction_pack_runtime');
    assert.notEqual(jurisdictionPackRuntime?.availability, 'available');
    assert.ok(['reference_only', 'planned', 'missing'].includes(jurisdictionPackRuntime?.availability ?? ''));

    const approval = findFoundationRuntimeCapabilityStatus(capabilities, 'approval_runtime');
    assert.ok(['available', 'reference_only', 'planned'].includes(approval?.availability ?? ''));

    const evidence = findFoundationRuntimeCapabilityStatus(capabilities, 'evidence_runtime');
    assert.ok(['available', 'reference_only', 'planned'].includes(evidence?.availability ?? ''));

    const exportPackage = findFoundationRuntimeCapabilityStatus(capabilities, 'verifiable_export_package');
    assert.ok(['available', 'reference_only', 'planned'].includes(exportPackage?.availability ?? ''));

    for (const status of capabilities) {
      assert.ok(Array.isArray(status.notes));
    }
  });

  it('is deterministic across calls', () => {
    assert.deepEqual(detectFoundationRuntimeCapabilities(), detectFoundationRuntimeCapabilities());
  });

  it('never marks a capability it does not know about as available', () => {
    const capabilities = detectFoundationRuntimeCapabilities();
    const unknown = findFoundationRuntimeCapabilityStatus(capabilities, 'jurisdiction_pack_runtime');
    assert.notEqual(unknown?.availability, 'available');
  });
});
