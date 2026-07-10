import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseModuleRegistry } from '../registry/enterprise-module-registry.js';
import { EnterpriseModuleCycleError, EnterpriseModuleRegistrationError, EnterpriseModuleStateError } from '../lifecycle/lifecycle-errors.js';
import type { EnterpriseModule } from '../modules/enterprise-module.js';

function testModule(id: string, overrides: Partial<EnterpriseModule['descriptor']> = {}): EnterpriseModule {
  return {
    descriptor: { id, version: '1.0.0', criticality: 'required', ...overrides },
    async initialize() {},
    async health() {
      return { status: 'healthy', checkedAt: '2026-01-01T00:00:00.000Z' };
    },
    async shutdown() {},
  };
}

describe('EnterpriseModuleRegistry', () => {
  it('registers a module and makes it retrievable and listable', () => {
    const registry = createEnterpriseModuleRegistry();
    const module = testModule('a');
    registry.register(module);

    assert.equal(registry.get('a'), module);
    assert.deepEqual(registry.list(), [{ descriptor: module.descriptor, state: 'registered' }]);
  });

  it('rejects a duplicate module id', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('a'));
    assert.throws(() => registry.register(testModule('a')), EnterpriseModuleRegistrationError);
  });

  it('rejects registration after the registry is frozen', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.freeze();
    assert.throws(() => registry.register(testModule('a')), EnterpriseModuleRegistrationError);
  });

  it('validate() accepts a module with no dependencies', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('a'));
    assert.deepEqual(registry.validate(), { valid: true, errors: [] });
  });

  it('validate() detects a missing required dependency', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('a', { dependencies: [{ moduleId: 'missing' }] }));
    const result = registry.validate();
    assert.equal(result.valid, false);
    assert.ok(result.errors[0]?.includes('missing'));
  });

  it('validate() accepts a missing optional dependency', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('a', { dependencies: [{ moduleId: 'missing', optional: true }] }));
    assert.deepEqual(registry.validate(), { valid: true, errors: [] });
  });

  it('validate() detects an incompatible version range on a present dependency', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('a', { dependencies: [{ moduleId: 'b', versionRange: '^2.0.0' }] }));
    registry.register(testModule('b', { version: '1.0.0' }));
    const result = registry.validate();
    assert.equal(result.valid, false);
    assert.ok(result.errors[0]?.includes('b'));
  });

  it('resolveInitializationOrder() produces a dependency-respecting order', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('c', { dependencies: [{ moduleId: 'b' }] }));
    registry.register(testModule('b', { dependencies: [{ moduleId: 'a' }] }));
    registry.register(testModule('a'));

    assert.deepEqual(registry.resolveInitializationOrder(), ['a', 'b', 'c']);
  });

  it('resolveInitializationOrder() breaks ties by registration order for unrelated modules', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('z'));
    registry.register(testModule('y'));
    registry.register(testModule('x'));

    assert.deepEqual(registry.resolveInitializationOrder(), ['z', 'y', 'x']);
  });

  it('detects a direct dependency cycle with a useful path', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('a', { dependencies: [{ moduleId: 'b' }] }));
    registry.register(testModule('b', { dependencies: [{ moduleId: 'a' }] }));

    assert.throws(
      () => registry.resolveInitializationOrder(),
      (error: unknown) => {
        assert.ok(error instanceof EnterpriseModuleCycleError);
        assert.ok(error.path.includes('a') && error.path.includes('b'));
        assert.ok(error.message.includes('a') && error.message.includes('b'));
        return true;
      },
    );
  });

  it('detects an indirect dependency cycle with the full path', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('a', { dependencies: [{ moduleId: 'c' }] }));
    registry.register(testModule('b', { dependencies: [{ moduleId: 'a' }] }));
    registry.register(testModule('c', { dependencies: [{ moduleId: 'b' }] }));

    assert.throws(
      () => registry.resolveInitializationOrder(),
      (error: unknown) => {
        assert.ok(error instanceof EnterpriseModuleCycleError);
        assert.ok(['a', 'b', 'c'].every((id) => error.path.includes(id)));
        return true;
      },
    );
  });

  it('setState() rejects an invalid transition', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('a'));
    assert.throws(() => registry.setState('a', 'ready'), EnterpriseModuleStateError);
  });

  it('setState() allows the documented transition path', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('a'));
    registry.setState('a', 'validating');
    registry.setState('a', 'initializing');
    registry.setState('a', 'ready');
    assert.equal(registry.getState('a'), 'ready');
  });

  it('snapshot() reports a stable, read-only diagnostic view', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('a', { criticality: 'optional', capabilities: ['a.capability'], dependencies: [{ moduleId: 'b', optional: true }] }));
    registry.register(testModule('b'));

    const snapshot = registry.snapshot();
    assert.deepEqual(snapshot[0], {
      id: 'a',
      version: '1.0.0',
      state: 'registered',
      required: false,
      dependencies: [{ moduleId: 'b', optional: true }],
      capabilities: ['a.capability'],
    });
  });

  it('asView() exposes get/list but not register/setState', () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register(testModule('a'));
    const view = registry.asView();

    assert.equal(view.get('a')?.descriptor.id, 'a');
    assert.equal(view.list().length, 1);
    assert.equal((view as unknown as Record<string, unknown>).register, undefined);
    assert.equal((view as unknown as Record<string, unknown>).setState, undefined);
  });
});
