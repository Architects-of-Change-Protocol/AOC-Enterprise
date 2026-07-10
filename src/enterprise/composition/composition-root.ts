import { randomUUID } from 'node:crypto';

import { AOC_KERNEL_VERSION, createAocKernel, type AocKernel, type KernelIdGenerator, type PolicyPackProvider } from '../../kernel/index.js';
import { computeEnterpriseHealth, type EnterpriseHealthReport } from '../health/health-check.js';
import { loadEnterpriseConfiguration, type EnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import { createInProcessEventPublisher, type EnterpriseEventPublisher } from '../events/enterprise-events.js';
import {
  evaluateGovernanceRequest,
  type EnterpriseEvaluationResponse,
  type EvaluateGovernanceRequestInput,
} from '../orchestration/evaluate-governance-request.js';
import { createInMemoryGovernanceStore } from '../persistence/in-memory-governance-store.js';
import { createSqliteGovernanceStore } from '../persistence/sqlite-governance-store.js';
import type { GovernanceStore } from '../persistence/governance-store.js';
import { createDefaultKernelProviders, type KernelProviderSet } from '../providers/kernel-provider-composition.js';
import { createEnterpriseLogger, type EnterpriseLogger } from '../telemetry/enterprise-logger.js';
import { createEnterpriseTelemetry, type EnterpriseTelemetry } from '../telemetry/enterprise-telemetry.js';
import { EnterpriseHttpErrors } from '../api/enterprise-http-errors.js';
import { AOC_ENTERPRISE_HOST_VERSION } from '../version.js';
import { createEnterpriseModuleRegistry } from '../registry/enterprise-module-registry.js';
import { createEnterpriseLifecycleController } from '../lifecycle/enterprise-lifecycle-controller.js';
import type { EnterpriseLifecycleState, EnterpriseModule, EnterpriseModuleSnapshot } from '../modules/enterprise-module.js';
import { createTelemetryModule } from '../modules/telemetry-module.js';
import { createEventsModule } from '../modules/events-module.js';
import { createPersistenceModule } from '../modules/persistence-module.js';
import { createProvidersModule } from '../modules/providers-module.js';
import { createKernelModule } from '../modules/kernel-module.js';

/** Transport-level input to `AocEnterprise.evaluate()` -- the not-yet-validated wire payload. Validated internally against `GovernanceEvaluateRequestBody`; see `EnterpriseRequestContext` for the side-channel (auth header) that travels alongside it. */
export type EnterpriseEvaluationRequest = unknown;

/** Side-channel request context `AocEnterprise.evaluate()` accepts alongside the request body -- today, only the caller's `Authorization` header. */
export interface EnterpriseRequestContext {
  readonly authorizationHeader?: string;
}

/**
 * Every field a caller may substitute for the composition root's own
 * default construction. Tests inject the same real, fully-composed
 * `KernelProviderSet` the Kernel's own characterization suite uses
 * (`bridgeRecognitionRuntime` over a seeded world) instead of the
 * Enterprise Host's fail-closed empty default, and can swap in an
 * in-memory store even when `AOC_ENTERPRISE_PERSISTENCE_PROVIDER=sqlite` is
 * set in the ambient environment. `kernel`, when supplied, is used verbatim
 * instead of constructing one from `kernelProviders` -- this is the
 * "already-built Kernel" shape the mission's example interface describes;
 * `kernelProviders` remains the way to supply the Kernel's *own*
 * dependencies (recognitionProvider/clock/idGenerator) when no
 * already-built `AocKernel` instance is available. `modules`, when
 * supplied, are registered in addition to (never instead of) the built-in
 * modules -- there is no way to opt out of the built-in modules, since they
 * formalize capabilities this Host already unconditionally provides.
 */
export interface CreateEnterpriseOptions {
  readonly configuration?: EnterpriseConfiguration;
  readonly kernel?: AocKernel;
  readonly kernelProviders?: KernelProviderSet;
  readonly policyPackProvider?: PolicyPackProvider;
  readonly persistence?: GovernanceStore;
  readonly eventPublisher?: EnterpriseEventPublisher;
  readonly telemetry?: EnterpriseTelemetry;
  readonly logger?: EnterpriseLogger;
  readonly modules?: readonly EnterpriseModule[];
}

/**
 * The AOC Enterprise Host's stable application-level boundary. The HTTP
 * server (`host/enterprise-server.ts`) consumes exactly this interface and
 * nothing more of the composition root's internals. `evaluate()` is the
 * only place governance requests reach the Kernel; `health()` reports
 * operational status.
 *
 * `createEnterprise()` auto-starts the module lifecycle before resolving
 * (mission section 20, "Option A -- Auto-start compatibility"): existing
 * PR-002 consumers call `createEnterprise()` then `evaluate()` immediately,
 * with no intervening `start()` call, and that must keep working unchanged.
 * `start()` is still exposed, and is a safe idempotent no-op when the
 * instance is already `ready`/`degraded` -- it exists for callers that want
 * to observe/await the lifecycle explicitly, not because callers are
 * required to invoke it.
 */
export interface AocEnterprise {
  readonly configuration: EnterpriseConfiguration;
  readonly kernel: AocKernel;
  readonly kernelProviders: KernelProviderSet;
  readonly persistence: GovernanceStore;
  readonly eventPublisher: EnterpriseEventPublisher;
  readonly telemetry: EnterpriseTelemetry;
  readonly logger: EnterpriseLogger;
  readonly bootId: string;
  evaluate(request: EnterpriseEvaluationRequest, context?: EnterpriseRequestContext): Promise<EnterpriseEvaluationResponse>;
  health(): Promise<EnterpriseHealthReport>;
  /** Idempotent: resolves immediately if already started; rejects if the instance previously failed to start or has been stopped. */
  start(): Promise<void>;
  /** Is the Enterprise process running and capable of responding at all? True until `close()`/`stop()` completes -- a live process may still be `degraded` or not `ready`. */
  isLive(): boolean;
  /** Can the Enterprise Host safely accept governance evaluations right now? False before startup completes, during shutdown, after stop, or if a required module failed. */
  isReady(): boolean;
  lifecycleState(): EnterpriseLifecycleState;
  /** Read-only diagnostic snapshot of every registered module -- see `docs/enterprise/AOC_ENTERPRISE_MODULE_LIFECYCLE.md`. */
  modules(): readonly EnterpriseModuleSnapshot[];
  close(): Promise<void>;
  /** Alias for `close()` -- some callers find `stop()` more consistent with `start()`. */
  stop(): Promise<void>;
}

async function buildStore(configuration: EnterpriseConfiguration): Promise<GovernanceStore> {
  if (configuration.persistence.provider === 'sqlite') {
    return createSqliteGovernanceStore(configuration.persistence.sqlitePath);
  }
  return createInMemoryGovernanceStore();
}

/** A dedicated id source for Enterprise-internal bookkeeping (event ids, boot id) -- independent of the Kernel's own `idGenerator`, so Enterprise bookkeeping never perturbs the Kernel's internal id sequence. */
function createEnterpriseIdGenerator(): KernelIdGenerator {
  return { nextId: (prefix: string) => `${prefix}-${randomUUID()}` };
}

/**
 * The AOC Enterprise Host's single composition root (mission: "Create one
 * Enterprise composition root"). Every dependency `AocKernel` is handed --
 * and every dependency the Enterprise Host itself needs -- is constructed
 * exactly once, here. The Kernel only ever receives the narrow interfaces
 * it defines in `kernel/contracts/ports.ts`; it never sees
 * `EnterpriseConfiguration`, the `GovernanceStore`, the event publisher, or
 * any other Enterprise concern.
 *
 * The Enterprise layer hosts; it does not decide. It may validate
 * transport-level requests, authenticate callers, compose providers, call
 * the Kernel, persist decisions, emit events, expose health, collect
 * telemetry, and map errors to HTTP -- it may not evaluate authority,
 * decide policy outcomes, invent reason codes, reinterpret Kernel results,
 * bypass the Kernel, or duplicate governance semantics.
 *
 * PR-003 evolves this from a flat sequence of `const` bindings
 * (`docs/enterprise/AOC_ENTERPRISE_CURRENT_COMPOSITION_MODEL.md`) into:
 * register built-in real modules -> register any caller-supplied modules ->
 * freeze the registry -> run the lifecycle controller -> return a ready
 * `AocEnterprise`. Every dependency below is still constructed exactly the
 * same way it always was; only the *sequencing/observability* of bringing
 * them online is new.
 */
export async function createEnterprise(options: CreateEnterpriseOptions = {}): Promise<AocEnterprise> {
  const configuration = options.configuration ?? loadEnterpriseConfiguration();
  const kernelProviders = options.kernelProviders ?? createDefaultKernelProviders();
  const persistence = options.persistence ?? (await buildStore(configuration));
  const eventPublisher = options.eventPublisher ?? createInProcessEventPublisher();
  const telemetry = options.telemetry ?? createEnterpriseTelemetry();
  const logger = options.logger ?? createEnterpriseLogger(configuration.logLevel);
  const eventIdGenerator = createEnterpriseIdGenerator();

  const kernel =
    options.kernel ??
    createAocKernel({
      recognitionProvider: kernelProviders.recognitionProvider,
      clock: kernelProviders.clock,
      idGenerator: kernelProviders.idGenerator,
      ...(options.policyPackProvider !== undefined ? { policyPackProvider: options.policyPackProvider } : {}),
    });

  const bootId = eventIdGenerator.nextId('boot');
  await persistence.recordEnterpriseVersion({
    bootId,
    enterpriseVersion: configuration.enterpriseVersion,
    kernelVersion: AOC_KERNEL_VERSION,
    recordedAt: kernelProviders.clock.now(),
  });

  const registry = createEnterpriseModuleRegistry();
  registry.register(createTelemetryModule(telemetry, configuration.telemetry.enabled, kernelProviders.clock.now));
  registry.register(createEventsModule(eventPublisher, configuration.eventPublishing.enabled, kernelProviders.clock.now));
  registry.register(createPersistenceModule(persistence, kernelProviders.clock.now));
  registry.register(createProvidersModule(kernelProviders, kernelProviders.clock.now, options.policyPackProvider !== undefined));
  registry.register(createKernelModule(kernel, kernelProviders.clock.now));
  for (const module of options.modules ?? []) registry.register(module);
  registry.freeze();

  const lifecycle = createEnterpriseLifecycleController({
    registry,
    logger,
    telemetry,
    eventPublisher,
    configuration,
    enterpriseVersion: configuration.enterpriseVersion,
    now: kernelProviders.clock.now,
    nextId: eventIdGenerator.nextId,
  });

  // Auto-start (mission section 20, Option A): existing consumers expect
  // `createEnterprise()` to return a fully usable instance with no
  // additional `start()` call.
  await lifecycle.start();

  const enterprise: AocEnterprise = {
    configuration,
    kernel,
    kernelProviders,
    persistence,
    eventPublisher,
    telemetry,
    logger,
    bootId,
    evaluate(request, context) {
      if (!lifecycle.isReady()) {
        return Promise.reject(EnterpriseHttpErrors.enterpriseNotReady(lifecycle.lifecycleState()));
      }
      const input: EvaluateGovernanceRequestInput = {
        rawBody: request,
        ...(context?.authorizationHeader !== undefined ? { authorizationHeader: context.authorizationHeader } : {}),
      };
      return evaluateGovernanceRequest(input, {
        kernel,
        clock: kernelProviders.clock,
        idGenerator: kernelProviders.idGenerator,
        eventIdGenerator,
        store: persistence,
        eventPublisher,
        telemetry,
        logger,
        configuration,
      });
    },
    async health() {
      const lifecycleSnapshot = await lifecycle.healthSnapshot();
      return computeEnterpriseHealth({
        configuration,
        store: persistence,
        hasPolicyPackProvider: options.policyPackProvider !== undefined,
        eventPublishingEnabled: configuration.eventPublishing.enabled,
        now: kernelProviders.clock.now,
        lifecycle: lifecycleSnapshot,
      });
    },
    start: () => lifecycle.start(),
    isLive: () => lifecycle.isLive(),
    isReady: () => lifecycle.isReady(),
    lifecycleState: () => lifecycle.lifecycleState(),
    modules: () => lifecycle.modules(),
    close: () => lifecycle.shutdown(),
    stop: () => lifecycle.shutdown(),
  };

  return enterprise;
}

/**
 * Convenience zero-configuration factory: `createEnterprise({configuration})`
 * with every other dependency defaulted. Real use: local development and
 * `scripts/run-enterprise-host.mjs`, where nothing needs to be injected.
 */
export function createDefaultEnterprise(configuration?: EnterpriseConfiguration): Promise<AocEnterprise> {
  return createEnterprise(configuration !== undefined ? { configuration } : {});
}
