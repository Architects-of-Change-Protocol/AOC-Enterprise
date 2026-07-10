import type { EnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import type { EnterpriseEvent, EnterpriseEventPublisher } from '../events/enterprise-events.js';
import type { EnterpriseLogger } from '../telemetry/enterprise-logger.js';
import type { EnterpriseTelemetry } from '../telemetry/enterprise-telemetry.js';
import type { EnterpriseModuleRegistry } from '../registry/enterprise-module-registry.js';
import type { EnterpriseLifecycleState, EnterpriseModuleContext, EnterpriseModuleHealth, EnterpriseModuleId, EnterpriseModuleSnapshot } from '../modules/enterprise-module.js';
import { isValidHostTransition } from './lifecycle-state.js';
import {
  EnterpriseModuleDependencyError,
  EnterpriseModuleInitializationError,
  EnterpriseModuleShutdownError,
  EnterpriseModuleStateError,
  type EnterpriseModuleShutdownFailure,
} from './lifecycle-errors.js';
import type { EnterpriseLifecycleEventType } from './lifecycle-events.js';

export interface EnterpriseModuleHealthEntry {
  readonly version: string;
  readonly state: string;
  readonly health: EnterpriseModuleHealth;
  readonly required: boolean;
}

export interface EnterpriseLifecycleSnapshot {
  readonly lifecycleState: EnterpriseLifecycleState;
  readonly live: boolean;
  readonly ready: boolean;
  readonly modules: Readonly<Record<EnterpriseModuleId, EnterpriseModuleHealthEntry>>;
}

export interface EnterpriseLifecycleControllerDependencies {
  readonly registry: EnterpriseModuleRegistry;
  readonly logger: EnterpriseLogger;
  readonly telemetry: EnterpriseTelemetry;
  readonly eventPublisher: EnterpriseEventPublisher;
  readonly configuration: EnterpriseConfiguration;
  readonly enterpriseVersion: string;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
}

export interface EnterpriseLifecycleController {
  start(): Promise<void>;
  shutdown(): Promise<void>;
  isLive(): boolean;
  isReady(): boolean;
  lifecycleState(): EnterpriseLifecycleState;
  modules(): readonly EnterpriseModuleSnapshot[];
  healthSnapshot(): Promise<EnterpriseLifecycleSnapshot>;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeoutMessage: string): Promise<T> {
  if (timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(onTimeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Orchestrates registration -> validation -> ordered initialization ->
 * readiness, and ordered shutdown, over an `EnterpriseModuleRegistry`. Owns
 * exactly the state this mission asks for: Host-level lifecycle state,
 * per-module state, readiness/liveness, health aggregation, and lifecycle
 * events/telemetry. It never reinterprets a Kernel decision and never holds
 * governance policy -- it only sequences the modules the composition root
 * registered.
 */
export function createEnterpriseLifecycleController(deps: EnterpriseLifecycleControllerDependencies): EnterpriseLifecycleController {
  const { registry, logger, telemetry, eventPublisher, configuration, enterpriseVersion, now, nextId } = deps;

  let hostState: EnterpriseLifecycleState = 'created';
  let startupPromise: Promise<void> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let initializedOrder: EnterpriseModuleId[] = [];
  const lifecycleCorrelationId = nextId('lifecycle');

  function setHostState(next: EnterpriseLifecycleState): void {
    if (!isValidHostTransition(hostState, next)) {
      throw new EnterpriseModuleStateError(`Invalid Enterprise lifecycle transition: '${hostState}' -> '${next}'.`);
    }
    hostState = next;
  }

  function emit(type: EnterpriseLifecycleEventType, fields: Partial<EnterpriseEvent> = {}): void {
    const event = {
      eventId: nextId('lifecycle-event'),
      type,
      occurredAt: now(),
      enterpriseVersion,
      lifecycleCorrelationId,
      ...fields,
    } as EnterpriseEvent;
    logger.info(`enterprise.lifecycle.${type}`, {});
    void eventPublisher.publish(event);
  }

  function buildModuleContext(): EnterpriseModuleContext {
    return { enterpriseVersion, configuration, logger, telemetry, registry: registry.asView() };
  }

  async function shutdownModules(order: readonly EnterpriseModuleId[]): Promise<readonly EnterpriseModuleShutdownFailure[]> {
    const failures: EnterpriseModuleShutdownFailure[] = [];
    for (const moduleId of order) {
      const module = registry.get(moduleId);
      if (module === undefined) continue;
      const state = registry.getState(moduleId);
      if (state !== 'ready' && state !== 'degraded' && state !== 'failed') continue;
      registry.setState(moduleId, 'stopping');
      emit('EnterpriseModuleShutdownStarted', { moduleId, moduleVersion: module.descriptor.version });
      try {
        await withTimeout(module.shutdown(), configuration.lifecycle.shutdownTimeoutMs, `Module '${moduleId}' shutdown timed out.`);
        registry.setState(moduleId, 'stopped');
        emit('EnterpriseModuleStopped', { moduleId, moduleVersion: module.descriptor.version });
      } catch (error) {
        failures.push({ moduleId, error });
        logger.error('enterprise.lifecycle.module_shutdown_failed', {});
      }
    }
    return failures;
  }

  async function doStart(): Promise<void> {
    if (hostState === 'ready' || hostState === 'degraded') return; // already started -- idempotent no-op.
    if (hostState === 'stopping' || hostState === 'stopped') {
      throw new EnterpriseModuleStateError(`Cannot start: Enterprise lifecycle is '${hostState}'.`);
    }
    if (hostState === 'failed') {
      throw new EnterpriseModuleStateError('Cannot start: Enterprise previously failed to start; construct a new Enterprise instance.');
    }

    setHostState('validating');
    const validation = registry.validate();
    if (!validation.valid) {
      hostState = 'failed';
      throw new EnterpriseModuleDependencyError(validation.errors);
    }

    const order = registry.resolveInitializationOrder(); // may throw EnterpriseModuleCycleError

    setHostState('starting');
    emit('EnterpriseStartupRequested');

    let requiredFailure: { readonly moduleId: EnterpriseModuleId; readonly error: unknown } | undefined;
    let anyOptionalDegraded = false;

    for (const moduleId of order) {
      const module = registry.get(moduleId);
      if (module === undefined) continue;
      registry.setState(moduleId, 'validating');
      registry.setState(moduleId, 'initializing');
      emit('EnterpriseModuleInitializationStarted', { moduleId, moduleVersion: module.descriptor.version });
      const startedAtMs = Date.now();
      try {
        await withTimeout(module.initialize(buildModuleContext()), configuration.lifecycle.startupTimeoutMs, `Module '${moduleId}' initialization timed out.`);
        registry.setState(moduleId, 'ready');
        initializedOrder.push(moduleId);
        emit('EnterpriseModuleReady', { moduleId, moduleVersion: module.descriptor.version, durationMs: Date.now() - startedAtMs });
      } catch (error) {
        if (module.descriptor.criticality === 'required') {
          registry.setState(moduleId, 'failed');
          emit('EnterpriseModuleFailed', { moduleId, moduleVersion: module.descriptor.version, failureCode: 'MODULE_INITIALIZATION_FAILED' });
          telemetry.recordModuleFailure(moduleId);
          requiredFailure = { moduleId, error };
          break;
        }
        registry.setState(moduleId, 'degraded');
        emit('EnterpriseModuleDegraded', { moduleId, moduleVersion: module.descriptor.version });
        anyOptionalDegraded = true;
      }
    }

    if (requiredFailure) {
      const rollbackFailures = await shutdownModules([...initializedOrder].reverse());
      hostState = 'failed';
      emit('EnterpriseStartupFailed', { failureCode: 'MODULE_INITIALIZATION_FAILED', moduleId: requiredFailure.moduleId });
      telemetry.recordStartup(false);
      throw new EnterpriseModuleInitializationError(requiredFailure.moduleId, requiredFailure.error, initializedOrder, rollbackFailures);
    }

    setHostState(anyOptionalDegraded ? 'degraded' : 'ready');
    telemetry.recordStartup(true);
    emit('EnterpriseReady');
  }

  async function doShutdown(): Promise<void> {
    if (hostState === 'stopped') return; // idempotent.
    if (hostState === 'created' || hostState === 'validating') {
      hostState = 'stopped';
      return;
    }
    if (hostState === 'failed') {
      // Rollback already ran inline in doStart(); nothing further to shut down.
      hostState = 'stopped';
      emit('EnterpriseStopped');
      return;
    }

    setHostState('stopping');
    emit('EnterpriseShutdownRequested');
    const failures = await shutdownModules([...initializedOrder].reverse());
    hostState = 'stopped';
    telemetry.recordShutdown(failures.length === 0);
    emit('EnterpriseStopped');

    if (failures.length > 0) throw new EnterpriseModuleShutdownError(failures);
  }

  return {
    start(): Promise<void> {
      // Terminal states are re-checked on every call, not just the first --
      // `startupPromise` only dedupes calls that arrive *while* a startup is
      // in flight or already succeeded. Once the Host has moved to
      // 'failed'/'stopped' (necessarily *after* that cached promise settled),
      // every subsequent start() must keep rejecting, not replay the stale
      // cached result.
      if (hostState === 'ready' || hostState === 'degraded') return Promise.resolve();
      if (hostState === 'stopping' || hostState === 'stopped') {
        return Promise.reject(new EnterpriseModuleStateError(`Cannot start: Enterprise lifecycle is '${hostState}'.`));
      }
      if (hostState === 'failed') {
        return Promise.reject(new EnterpriseModuleStateError('Cannot start: Enterprise previously failed to start; construct a new Enterprise instance.'));
      }
      if (startupPromise === undefined) startupPromise = doStart();
      return startupPromise;
    },
    shutdown(): Promise<void> {
      if (shutdownPromise === undefined) shutdownPromise = doShutdown();
      return shutdownPromise;
    },
    isLive: () => hostState !== 'stopped',
    isReady: () => hostState === 'ready' || hostState === 'degraded',
    lifecycleState: () => hostState,
    modules: () => registry.snapshot(),
    async healthSnapshot(): Promise<EnterpriseLifecycleSnapshot> {
      const registrations = registry.list();
      const entries = await Promise.all(
        registrations.map(async ({ descriptor, state }): Promise<readonly [EnterpriseModuleId, EnterpriseModuleHealthEntry]> => {
          const module = registry.get(descriptor.id);
          let health: EnterpriseModuleHealth;
          try {
            health =
              module === undefined
                ? { status: 'unhealthy', checkedAt: now(), message: 'Module not found in registry.' }
                : await withTimeout(module.health(), configuration.lifecycle.healthCheckTimeoutMs, `Module '${descriptor.id}' health check timed out.`);
          } catch (error) {
            health = { status: 'unhealthy', checkedAt: now(), message: error instanceof Error ? error.message : String(error) };
          }
          return [descriptor.id, { version: descriptor.version, state, health, required: descriptor.criticality === 'required' }];
        }),
      );
      return {
        lifecycleState: hostState,
        live: hostState !== 'stopped',
        ready: hostState === 'ready' || hostState === 'degraded',
        modules: Object.fromEntries(entries),
      };
    },
  };
}
