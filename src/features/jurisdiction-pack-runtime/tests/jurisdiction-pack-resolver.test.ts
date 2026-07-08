import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPolicyPackManifest, type PolicyPackValidationStatus } from '../../policy-pack-foundation/index.js';
import { createJurisdictionPackRegistry } from '../services/jurisdiction-pack-registry.js';
import { resolveJurisdictionPacks } from '../services/jurisdiction-pack-resolver.js';

function jurisdictionManifest(id: string, status: PolicyPackValidationStatus = 'demo_baseline') {
  return createPolicyPackManifest({
    id,
    name: 'Test Jurisdiction Pack',
    version: '1.0.0',
    kind: 'jurisdiction_pack',
    domain: 'jurisdiction',
    status,
    sourceStatus: 'demo_fixture',
    description: 'A test-only jurisdiction pack.',
    ...(status === 'superseded' ? { supersededByPackId: `${id}-v2` } : {}),
  });
}

describe('resolveJurisdictionPacks', () => {
  it('resolves to the single active pack registered under a jurisdiction code', () => {
    const registry = createJurisdictionPackRegistry();
    registry.register({ jurisdictionCode: 'demo-code-a', manifest: jurisdictionManifest('jx-1') });

    const result = resolveJurisdictionPacks(registry, 'demo-code-a');
    assert.equal(result.status, 'resolved');
    assert.deepEqual(result.matchedPackIds, ['jx-1']);
  });

  it('reports unresolved for a jurisdiction code with no registrations', () => {
    const registry = createJurisdictionPackRegistry();
    const result = resolveJurisdictionPacks(registry, 'unknown-code');
    assert.equal(result.status, 'unresolved');
    assert.deepEqual(result.matchedPackIds, []);
  });

  it('reports ambiguous when more than one active pack is registered under the same code', () => {
    const registry = createJurisdictionPackRegistry();
    registry.register({ jurisdictionCode: 'demo-code-a', manifest: jurisdictionManifest('jx-1') });
    registry.register({ jurisdictionCode: 'demo-code-a', manifest: jurisdictionManifest('jx-2') });

    const result = resolveJurisdictionPacks(registry, 'demo-code-a');
    assert.equal(result.status, 'ambiguous');
    assert.deepEqual([...result.matchedPackIds].sort(), ['jx-1', 'jx-2']);
  });

  it('excludes expired, superseded, and disabled packs from resolution', () => {
    const registry = createJurisdictionPackRegistry();
    registry.register({ jurisdictionCode: 'demo-code-a', manifest: jurisdictionManifest('jx-expired', 'expired') });
    registry.register({ jurisdictionCode: 'demo-code-a', manifest: jurisdictionManifest('jx-superseded', 'superseded') });
    registry.register({ jurisdictionCode: 'demo-code-a', manifest: jurisdictionManifest('jx-disabled', 'disabled') });
    registry.register({ jurisdictionCode: 'demo-code-a', manifest: jurisdictionManifest('jx-active') });

    const result = resolveJurisdictionPacks(registry, 'demo-code-a');
    assert.equal(result.status, 'resolved');
    assert.deepEqual(result.matchedPackIds, ['jx-active']);
  });

  it('reports unresolved when every registered pack is inactive', () => {
    const registry = createJurisdictionPackRegistry();
    registry.register({ jurisdictionCode: 'demo-code-a', manifest: jurisdictionManifest('jx-expired', 'expired') });

    const result = resolveJurisdictionPacks(registry, 'demo-code-a');
    assert.equal(result.status, 'unresolved');
  });
});
