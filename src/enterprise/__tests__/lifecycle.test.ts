import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseModuleRegistry } from '../registry/enterprise-module-registry.js';
import { createEnterpriseLifecycleController } from '../lifecycle/enterprise-lifecycle-controller.js';
import { EnterpriseModuleInitializationError, EnterpriseModuleShutdownError, EnterpriseModuleStateError } from '../lifecycle/lifecycle-errors.js';
import { loadEnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import { createEnterpriseTelemetry } from '../telemetry/enterprise-telemetry.js';
import { createEnterpriseLogger } from '../telemetry/enterprise-logger.js';
import { createInProcessEventPublisher, type EnterpriseEvent } from '../events/enterprise-events.js';
import type { EnterpriseModule } from '../modules/enterprise-module.js';

const NOOP_SINK = { write: () => {} };

function buildRecordingModule(
  id: string,
  order: string[],
  overrides: Partial<{
    criticality: 'required' | 'optional';
    dependencies: EnterpriseModule['descriptor']['dependencies'];
    failInit: boolean;
    failShutdown: boolean;
  }> = {},
): EnterpriseModule {
  return {
    descriptor: { id, version: '1.0.0', criticality: overrides.criticality ?? 'required', ...(overrides.dependencies !== undefined ? { dependencies: overrides.dependencies } : {}) },
    async initialize() {
      order.push(`init:${id}`);
      if (overrides.failInit) throw new Error(`${id} init failed`);
    },
    async health() {
      return { status: 'healthy', checkedAt: '2026-01-01T00:00:00.000Z' };
    },
    async shutdown() {
      order.push(`stop:${id}`);
      if (overrides.failShutdown) throw new Error(`${id} shutdown failed`);
    },
  };
}

function buildController(modules: readonly EnterpriseModule[]) {
  const registry = createEnterpriseModuleRegistry();
  for (const module of modules) registry.register(module);
  registry.freeze();

  return createEnterpriseLifecycleController({
    registry,
    logger: createEnterpriseLogger('error', NOOP_SINK),
    telemetry: createEnterpriseTelemetry(),
    eventPublisher: createInProcessEventPublisher(),
    configuration: loadEnterpriseConfiguration({}),
    enterpriseVersion: '1.0.0',
    now: () => '2026-01-01T00:00:00.000Z',
    nextId: (prefix) => `${prefix}-1`,
  });
}

describe('EnterpriseLifecycleController', () => {
  it('starts in "created" and is neither live nor ready', () => {
    const controller = buildController([]);
    assert.equal(controller.lifecycleState(), 'created');
    assert.equal(controller.isLive(), true);
    assert.equal(controller.isReady(), false);
  });

  it('initializes modules in dependency order and becomes ready', async () => {
    const order: string[] = [];
    const controller = buildController([
      buildRecordingModule('c', order, { dependencies: [{ moduleId: 'b' }] }),
      buildRecordingModule('b', order, { dependencies: [{ moduleId: 'a' }] }),
      buildRecordingModule('a', order),
    ]);

    await controller.start();

    assert.deepEqual(order, ['init:a', 'init:b', 'init:c']);
    assert.equal(controller.lifecycleState(), 'ready');
    assert.equal(controller.isReady(), true);
    assert.equal(controller.isLive(), true);
  });

  it('concurrent start() calls run initialization exactly once', async () => {
    const order: string[] = [];
    const controller = buildController([buildRecordingModule('a', order)]);

    await Promise.all([controller.start(), controller.start(), controller.start()]);

    assert.deepEqual(order, ['init:a']);
    assert.equal(controller.lifecycleState(), 'ready');
  });

  it('start() is idempotent once already ready', async () => {
    const controller = buildController([buildRecordingModule('a', [])]);
    await controller.start();
    await controller.start(); // must not throw or re-run
    assert.equal(controller.lifecycleState(), 'ready');
  });

  it('a failed optional module degrades the Host but does not block readiness', async () => {
    const order: string[] = [];
    const controller = buildController([buildRecordingModule('required-a', order), buildRecordingModule('optional-b', order, { criticality: 'optional', failInit: true })]);

    await controller.start();

    assert.equal(controller.lifecycleState(), 'degraded');
    assert.equal(controller.isReady(), true, 'optional degradation must not block readiness');
    const modules = controller.modules();
    assert.equal(modules.find((m) => m.id === 'optional-b')?.state, 'degraded');
  });

  it('a failed required module fails startup and rolls back already-initialized modules in reverse order', async () => {
    const order: string[] = [];
    const controller = buildController([buildRecordingModule('a', order), buildRecordingModule('b', order, { failInit: true, dependencies: [{ moduleId: 'a' }] })]);

    await assert.rejects(() => controller.start(), EnterpriseModuleInitializationError);

    assert.deepEqual(order, ['init:a', 'init:b', 'stop:a']);
    assert.equal(controller.lifecycleState(), 'failed');
    assert.equal(controller.isReady(), false);
  });

  it('shutdown runs in reverse initialization order', async () => {
    const order: string[] = [];
    const controller = buildController([
      buildRecordingModule('c', order, { dependencies: [{ moduleId: 'b' }] }),
      buildRecordingModule('b', order, { dependencies: [{ moduleId: 'a' }] }),
      buildRecordingModule('a', order),
    ]);

    await controller.start();
    order.length = 0;
    await controller.shutdown();

    assert.deepEqual(order, ['stop:c', 'stop:b', 'stop:a']);
    assert.equal(controller.lifecycleState(), 'stopped');
    assert.equal(controller.isLive(), false);
    assert.equal(controller.isReady(), false);
  });

  it('shutdown continues attempting remaining modules and aggregates failures', async () => {
    const order: string[] = [];
    const controller = buildController([
      buildRecordingModule('a', order),
      buildRecordingModule('b', order, { failShutdown: true }),
      buildRecordingModule('c', order),
    ]);

    await controller.start();
    order.length = 0;

    await assert.rejects(
      () => controller.shutdown(),
      (error: unknown) => {
        assert.ok(error instanceof EnterpriseModuleShutdownError);
        assert.equal(error.failures.length, 1);
        assert.equal(error.failures[0]?.moduleId, 'b');
        return true;
      },
    );

    assert.deepEqual(order, ['stop:c', 'stop:b', 'stop:a'], 'a shutdown failure for one module must not skip the rest');
    assert.equal(controller.lifecycleState(), 'stopped');
  });

  it('shutdown is idempotent -- calling it twice does not re-run module shutdown', async () => {
    const order: string[] = [];
    const controller = buildController([buildRecordingModule('a', order)]);
    await controller.start();
    order.length = 0;

    await controller.shutdown();
    await controller.shutdown();

    assert.deepEqual(order, ['stop:a']);
  });

  it('concurrent shutdown() calls run shutdown exactly once', async () => {
    const order: string[] = [];
    const controller = buildController([buildRecordingModule('a', order)]);
    await controller.start();
    order.length = 0;

    await Promise.all([controller.shutdown(), controller.shutdown(), controller.shutdown()]);

    assert.deepEqual(order, ['stop:a']);
  });

  it('shutdown after a failed startup is a safe no-op (rollback already ran)', async () => {
    const order: string[] = [];
    const controller = buildController([buildRecordingModule('a', order), buildRecordingModule('b', order, { failInit: true })]);

    await assert.rejects(() => controller.start());
    order.length = 0;
    await controller.shutdown();

    assert.deepEqual(order, [], 'no module should be shut down twice');
    assert.equal(controller.lifecycleState(), 'stopped');
  });

  it('start() rejects once the Host has stopped', async () => {
    const controller = buildController([buildRecordingModule('a', [])]);
    await controller.start();
    await controller.shutdown();

    await assert.rejects(() => controller.start(), EnterpriseModuleStateError);
  });

  it('healthSnapshot() reports every module, aggregated readiness, and required/optional flags', async () => {
    const controller = buildController([buildRecordingModule('required-a', []), buildRecordingModule('optional-b', [], { criticality: 'optional' })]);
    await controller.start();

    const snapshot = await controller.healthSnapshot();
    assert.equal(snapshot.ready, true);
    assert.equal(snapshot.live, true);
    assert.equal(snapshot.lifecycleState, 'ready');
    assert.equal(snapshot.modules['required-a']?.required, true);
    assert.equal(snapshot.modules['optional-b']?.required, false);
    assert.equal(snapshot.modules['required-a']?.health.status, 'healthy');
  });

  it('healthSnapshot() reports a module whose health() throws as unhealthy rather than failing the whole call', async () => {
    const registry = createEnterpriseModuleRegistry();
    registry.register({
      descriptor: { id: 'a', version: '1.0.0', criticality: 'required' },
      async initialize() {},
      async health() {
        throw new Error('boom');
      },
      async shutdown() {},
    });
    registry.freeze();
    const controller = createEnterpriseLifecycleController({
      registry,
      logger: createEnterpriseLogger('error', NOOP_SINK),
      telemetry: createEnterpriseTelemetry(),
      eventPublisher: createInProcessEventPublisher(),
      configuration: loadEnterpriseConfiguration({}),
      enterpriseVersion: '1.0.0',
      now: () => '2026-01-01T00:00:00.000Z',
      nextId: (prefix) => `${prefix}-1`,
    });
    await controller.start();

    const snapshot = await controller.healthSnapshot();
    assert.equal(snapshot.modules['a']?.health.status, 'unhealthy');
    assert.ok(snapshot.modules['a']?.health.message?.includes('boom'));
  });

  it('emits lifecycle events with no secrets, through the Enterprise event publisher', async () => {
    const received: EnterpriseEvent[] = [];
    const eventPublisher = createInProcessEventPublisher();
    eventPublisher.subscribe((event) => received.push(event));

    const registry = createEnterpriseModuleRegistry();
    registry.register(buildRecordingModule('a', []));
    registry.freeze();
    const controller = createEnterpriseLifecycleController({
      registry,
      logger: createEnterpriseLogger('error', NOOP_SINK),
      telemetry: createEnterpriseTelemetry(),
      eventPublisher,
      configuration: loadEnterpriseConfiguration({}),
      enterpriseVersion: '1.0.0',
      now: () => '2026-01-01T00:00:00.000Z',
      nextId: (prefix) => `${prefix}-1`,
    });

    await controller.start();
    await controller.shutdown();

    const types = received.map((event) => event.type);
    assert.deepEqual(types, [
      'EnterpriseStartupRequested',
      'EnterpriseModuleInitializationStarted',
      'EnterpriseModuleReady',
      'EnterpriseReady',
      'EnterpriseShutdownRequested',
      'EnterpriseModuleShutdownStarted',
      'EnterpriseModuleStopped',
      'EnterpriseStopped',
    ]);
    assert.ok(!JSON.stringify(received).toLowerCase().includes('secret'));
  });
});
