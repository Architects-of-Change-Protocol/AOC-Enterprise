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
import { createInMemoryGovernanceStore } from '../governance-store/in-memory-governance-store.js';
import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import type { GovernanceEnterpriseContext } from '../governance-store/contracts.js';
import { createGovernanceReadService, type GovernanceReadService } from '../orchestration/governance-read-service.js';
import { createInMemoryEvidenceStore, type EvidenceStore } from '../evidence/evidence-store.js';
import { createEvidenceService, type EvidenceService } from '../evidence/evidence-service.js';
import { createInMemoryPassportStore } from '../passport/in-memory-passport-store.js';
import { createSqlitePassportStore } from '../passport/sqlite-passport-store.js';
import type { AgentPassportStore } from '../passport/passport-store.js';
import { createAgentPassportService, type AgentPassportService } from '../passport/service.js';
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
import { createGovernanceStoreModule } from '../modules/governance-store-module.js';
import { createProvidersModule } from '../modules/providers-module.js';
import { createKernelModule } from '../modules/kernel-module.js';
import { createAgentPassportModule } from '../modules/passport-module.js';

/** Transport-level input to `AocEnterprise.evaluate()` -- the not-yet-validated wire payload. Validated internally against `GovernanceEvaluateRequestBody`; see `EnterpriseRequestContext` for the side-channel (auth header) that travels alongside it. */
export type EnterpriseEvaluationRequest = unknown;

/** Side-channel request context `AocEnterprise.evaluate()` accepts alongside the request body: the caller's `Authorization` header and (PR-004) the `Idempotency-Key` header value. */
export interface EnterpriseRequestContext {
  readonly authorizationHeader?: string;
  readonly idempotencyKey?: string;
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
  /** PR-005: the Evidence Bundle Store. Independent of `persistence` (the Governance Store) by design -- Bundles are never stored inside the Governance Store. */
  readonly evidenceStore?: EvidenceStore;
  /** PR-006: the Agent Passport Store. Independent of `persistence` and `evidenceStore` -- Passport events are never stored inside the Governance Store or the Evidence Bundle Store. */
  readonly passportStore?: AgentPassportStore;
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
  /** Authenticated, tenant-scoped read/verify surface over the Governance Store (PR-004). HTTP handlers and embedders consume this instead of building store queries directly. */
  readonly governanceReads: GovernanceReadService;
  /** PR-005: the Evidence Bundle Store, independent of the Governance Store. */
  readonly evidenceStore: EvidenceStore;
  /** PR-005: build/read/verify surface for Evidence Bundles. HTTP handlers and embedders consume this instead of calling the projector/verifier directly. */
  readonly evidence: EvidenceService;
  /** PR-006: the Agent Passport Store, independent of the Governance Store and Evidence Bundle Store. */
  readonly passportStore: AgentPassportStore;
  /** PR-006: issue/lifecycle/reference/verify/view surface for Agent Passports. HTTP handlers and embedders consume this instead of calling the Passport Store directly. */
  readonly passports: AgentPassportService;
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

async function buildStore(configuration: EnterpriseConfiguration, now: () => string): Promise<GovernanceStore> {
  const storeOptions = {
    now,
    limits: configuration.persistence.limits,
    enterpriseVersion: configuration.enterpriseVersion,
  };
  if (configuration.persistence.provider === 'sqlite') {
    return createSqliteGovernanceStore(configuration.persistence.sqlitePath, { ...storeOptions, busyTimeoutMs: configuration.persistence.busyTimeoutMs });
  }
  return createInMemoryGovernanceStore(storeOptions);
}

/** Mirrors `buildStore`, but for the independent Passport Store (mission section 9) -- a distinct on-disk file from the Governance Store even when both use `sqlite`. */
async function buildPassportStore(configuration: EnterpriseConfiguration, now: () => string, nextId: (prefix: string) => string): Promise<AgentPassportStore> {
  const storeOptions = { now, nextId, enterpriseVersion: configuration.enterpriseVersion };
  if (configuration.persistence.provider === 'sqlite') {
    return createSqlitePassportStore(configuration.passport.sqlitePath, { ...storeOptions, busyTimeoutMs: configuration.persistence.busyTimeoutMs });
  }
  return createInMemoryPassportStore(storeOptions);
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
  const eventIdGenerator = createEnterpriseIdGenerator();
  const persistence = options.persistence ?? (await buildStore(configuration, kernelProviders.clock.now));
  const evidenceStore = options.evidenceStore ?? createInMemoryEvidenceStore({ now: kernelProviders.clock.now });
  const passportStore = options.passportStore ?? (await buildPassportStore(configuration, kernelProviders.clock.now, eventIdGenerator.nextId));
  const eventPublisher = options.eventPublisher ?? createInProcessEventPublisher();
  const telemetry = options.telemetry ?? createEnterpriseTelemetry();
  const logger = options.logger ?? createEnterpriseLogger(configuration.logLevel);

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

  // Durable lifecycle history (PR-004 section 6): every lifecycle/module
  // event published from here on is appended to the Governance Store as a
  // standalone event record (linked by correlation, never by foreign key).
  // Best-effort by design — operational history must never block or fail
  // startup/shutdown, and events raced past `close()` are dropped silently.
  const unsubscribeLifecyclePersistence = eventPublisher.subscribe((event) => {
    if ('lifecycleCorrelationId' in event) {
      void persistence.appendLifecycleEvent(event).catch(() => {});
    }
  });

  const registry = createEnterpriseModuleRegistry();
  registry.register(createTelemetryModule(telemetry, configuration.telemetry.enabled, kernelProviders.clock.now));
  registry.register(createEventsModule(eventPublisher, configuration.eventPublishing.enabled, kernelProviders.clock.now));
  registry.register(createGovernanceStoreModule(persistence, kernelProviders.clock.now));
  registry.register(createProvidersModule(kernelProviders, kernelProviders.clock.now, options.policyPackProvider !== undefined));
  registry.register(createKernelModule(kernel, kernelProviders.clock.now));
  registry.register(createAgentPassportModule(passportStore, kernelProviders.clock.now, configuration.passport.required));
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

  /** Live Enterprise context captured into every appended governance aggregate (PR-004 section 7): lifecycle state, module snapshot, provider snapshot, environment. Bounded — never configuration, credentials, or connection strings. */
  const enterpriseContext = (): GovernanceEnterpriseContext => ({
    enterpriseVersion: configuration.enterpriseVersion,
    lifecycleState: lifecycle.lifecycleState(),
    modules: lifecycle.modules(),
    providers: [
      { providerType: 'recognition', ready: true },
      ...(options.policyPackProvider !== undefined ? [{ providerType: 'policy-pack', ready: true }] : []),
    ],
    environment: configuration.environment,
  });

  const governanceReads = createGovernanceReadService(persistence, configuration, telemetry);
  const evidence = createEvidenceService({
    governanceStore: persistence,
    evidenceStore,
    configuration,
    now: kernelProviders.clock.now,
    nextId: eventIdGenerator.nextId,
  });
  const passports = createAgentPassportService({
    store: passportStore,
    governanceStore: persistence,
    evidenceStore,
    telemetry,
    now: kernelProviders.clock.now,
    nextId: eventIdGenerator.nextId,
  });

  const enterprise: AocEnterprise = {
    configuration,
    kernel,
    kernelProviders,
    persistence,
    governanceReads,
    evidenceStore,
    evidence,
    passportStore,
    passports,
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
        ...(context?.idempotencyKey !== undefined ? { idempotencyKey: context.idempotencyKey } : {}),
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
        enterpriseContext,
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
    close: async () => {
      await lifecycle.shutdown();
      unsubscribeLifecyclePersistence();
      await evidenceStore.close();
    },
    stop: async () => {
      await lifecycle.shutdown();
      unsubscribeLifecyclePersistence();
      await evidenceStore.close();
    },
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
