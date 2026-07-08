import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPolicyPackManifest } from '../../policy-pack-foundation/index.js';
import { createJurisdictionPackRegistry } from '../services/jurisdiction-pack-registry.js';
import { JurisdictionPackDuplicateManifestIdError, JurisdictionPackWrongKindError } from '../runtime/jurisdiction-pack-runtime-errors.js';

function assertThrowsInstanceOf(fn: () => void, errorClass: new (...args: never[]) => Error): void {
  assert.throws(() => {
    try {
      fn();
    } catch (error) {
      assert.ok(error instanceof errorClass, `expected error to be an instance of ${errorClass.name}`);
      throw error;
    }
  });
}

function jurisdictionManifest(id: string) {
  return createPolicyPackManifest({
    id,
    name: 'Test Jurisdiction Pack',
    version: '1.0.0',
    kind: 'jurisdiction_pack',
    domain: 'jurisdiction',
    status: 'demo_baseline',
    sourceStatus: 'demo_fixture',
    description: 'A test-only jurisdiction pack.',
  });
}

describe('JurisdictionPackRegistry', () => {
  it('registers a jurisdiction pack manifest and indexes it by jurisdiction code', () => {
    const registry = createJurisdictionPackRegistry();
    const manifest = jurisdictionManifest('jx-1');

    registry.register({ jurisdictionCode: 'demo-code-a', manifest });

    assert.deepEqual(registry.getByJurisdictionCode('demo-code-a'), [manifest]);
    assert.equal(registry.getManifestById('jx-1'), manifest);
    assert.deepEqual(registry.allManifests(), [manifest]);
    assert.deepEqual(registry.allJurisdictionCodes(), ['demo-code-a']);
  });

  it('rejects a manifest whose kind is not jurisdiction_pack', () => {
    const registry = createJurisdictionPackRegistry();
    const manifest = createPolicyPackManifest({
      id: 'not-a-jurisdiction-pack',
      name: 'Domain Pack',
      version: '1.0.0',
      kind: 'domain_pack',
      domain: 'general',
      status: 'demo_baseline',
      sourceStatus: 'demo_fixture',
      description: 'Not a jurisdiction pack.',
    });

    assertThrowsInstanceOf(() => registry.register({ jurisdictionCode: 'demo-code-a', manifest }), JurisdictionPackWrongKindError);
  });

  it('rejects a duplicate manifest id', () => {
    const registry = createJurisdictionPackRegistry();
    registry.register({ jurisdictionCode: 'demo-code-a', manifest: jurisdictionManifest('jx-1') });

    assertThrowsInstanceOf(() => registry.register({ jurisdictionCode: 'demo-code-b', manifest: jurisdictionManifest('jx-1') }), JurisdictionPackDuplicateManifestIdError);
  });

  it('allows multiple manifests under the same jurisdiction code', () => {
    const registry = createJurisdictionPackRegistry();
    registry.register({ jurisdictionCode: 'demo-code-a', manifest: jurisdictionManifest('jx-1') });
    registry.register({ jurisdictionCode: 'demo-code-a', manifest: jurisdictionManifest('jx-2') });

    assert.equal(registry.getByJurisdictionCode('demo-code-a').length, 2);
  });

  it('returns an empty array for an unregistered jurisdiction code', () => {
    const registry = createJurisdictionPackRegistry();
    assert.deepEqual(registry.getByJurisdictionCode('unknown-code'), []);
  });
});
