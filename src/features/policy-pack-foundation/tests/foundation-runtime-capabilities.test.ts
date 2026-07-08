import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectFoundationRuntimeCapabilities, findFoundationRuntimeCapabilityStatus } from '../foundation/foundation-runtime-capabilities.js';

describe('detectFoundationRuntimeCapabilities', () => {
  it('1. detects available capabilities truthfully, including Jurisdiction Pack Runtime once it ships', () => {
    const capabilities = detectFoundationRuntimeCapabilities();

    const recognition = findFoundationRuntimeCapabilityStatus(capabilities, 'recognition_runtime');
    assert.equal(recognition?.availability, 'available');

    const manifestStandard = findFoundationRuntimeCapabilityStatus(capabilities, 'policy_pack_manifest_standard');
    assert.equal(manifestStandard?.availability, 'available');

    // Jurisdiction Pack Runtime v1 (src/features/jurisdiction-pack-runtime) now exists and is
    // exported, so this capability is truthfully 'available' rather than 'planned'.
    const jurisdictionPackRuntime = findFoundationRuntimeCapabilityStatus(capabilities, 'jurisdiction_pack_runtime');
    assert.equal(jurisdictionPackRuntime?.availability, 'available');
    assert.equal(jurisdictionPackRuntime?.modulePath, 'src/features/jurisdiction-pack-runtime');

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

  it('every capability marked available cites a real modulePath grounding the claim', () => {
    const capabilities = detectFoundationRuntimeCapabilities();
    const availableCapabilities = capabilities.filter((status) => status.availability === 'available');

    assert.ok(availableCapabilities.length > 0);
    for (const status of availableCapabilities) {
      assert.equal(typeof status.modulePath, 'string');
      assert.ok((status.modulePath ?? '').length > 0, `capability "${status.capability}" is marked available but cites no modulePath`);
    }
  });

  it('a capability status not present in the list is never treated as available by the lookup helper', () => {
    const capabilities = detectFoundationRuntimeCapabilities().filter((status) => status.capability !== 'jurisdiction_pack_runtime');
    const missing = findFoundationRuntimeCapabilityStatus(capabilities, 'jurisdiction_pack_runtime');
    assert.equal(missing, undefined);
  });
});
