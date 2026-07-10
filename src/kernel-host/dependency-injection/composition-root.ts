import { randomUUID } from 'node:crypto';

import { AOC_KERNEL_VERSION, createAocKernel, type AocKernel, type KernelIdGenerator, type PolicyPackProvider } from '../../kernel/index.js';
import { computeRuntimeHealth, type RuntimeHealthReport } from '../health/health-check.js';
import { loadRuntimeConfiguration, type RuntimeConfiguration } from '../configuration/runtime-configuration.js';
import { createInProcessEventPublisher, type RuntimeEventPublisher } from '../events/runtime-events.js';
import { evaluateGovernanceRequest, type EvaluateGovernanceRequestInput, type EvaluateGovernanceRequestOutcome } from '../orchestration/evaluate-governance-request.js';
import { createInMemoryGovernanceStore } from '../persistence/in-memory-governance-store.js';
import { createSqliteGovernanceStore } from '../persistence/sqlite-governance-store.js';
import type { GovernanceStore } from '../persistence/governance-store.js';
import { createDefaultKernelProviders, type KernelProviderSet } from '../providers/kernel-provider-composition.js';
import { createRuntimeLogger, type RuntimeLogger } from '../telemetry/runtime-logger.js';
import { createRuntimeTelemetry, type RuntimeTelemetry } from '../telemetry/runtime-telemetry.js';

/**
 * Every field a caller may substitute for the composition root's own
 * default construction. Tests use this to inject the same real,
 * fully-composed `KernelProviderSet` the Kernel's own characterization
 * suite uses (`bridgeRecognitionRuntime` over a seeded world) instead of
 * the Runtime Host's fail-closed empty default, and to swap in an
 * in-memory store even when `AOC_RUNTIME_PERSISTENCE_PROVIDER=sqlite` is
 * set in the ambient environment.
 */
export interface RuntimeHostOverrides {
  readonly configuration?: RuntimeConfiguration;
  readonly kernelProviders?: KernelProviderSet;
  readonly policyPackProvider?: PolicyPackProvider;
  readonly store?: GovernanceStore;
  readonly eventPublisher?: RuntimeEventPublisher;
  readonly telemetry?: RuntimeTelemetry;
  readonly logger?: RuntimeLogger;
}

export interface RuntimeHost {
  readonly configuration: RuntimeConfiguration;
  readonly kernel: AocKernel;
  readonly kernelProviders: KernelProviderSet;
  readonly store: GovernanceStore;
  readonly eventPublisher: RuntimeEventPublisher;
  readonly telemetry: RuntimeTelemetry;
  readonly logger: RuntimeLogger;
  readonly bootId: string;
  handleGovernanceEvaluate(input: EvaluateGovernanceRequestInput): Promise<EvaluateGovernanceRequestOutcome>;
  getHealth(): Promise<RuntimeHealthReport>;
  close(): Promise<void>;
}

async function buildStore(configuration: RuntimeConfiguration): Promise<GovernanceStore> {
  if (configuration.persistence.provider === 'sqlite') {
    return createSqliteGovernanceStore(configuration.persistence.sqlitePath);
  }
  return createInMemoryGovernanceStore();
}

/** A dedicated id source for Runtime-internal bookkeeping (event ids, boot id) -- independent of the Kernel's own `idGenerator`, so Runtime bookkeeping never perturbs the Kernel's internal id sequence. */
function createRuntimeIdGenerator(): KernelIdGenerator {
  return { nextId: (prefix: string) => `${prefix}-${randomUUID()}` };
}

/**
 * The Runtime Host's single composition root (mission: "Create one Runtime
 * composition root"). Every dependency `AocKernel` is handed -- and every
 * dependency the Runtime itself needs -- is constructed exactly once, here.
 * The Kernel only ever receives the narrow interfaces it defines in
 * `kernel/contracts/ports.ts`; it never sees `RuntimeConfiguration`, the
 * `GovernanceStore`, the event publisher, or any other Runtime concern.
 */
export async function buildRuntimeHost(overrides: RuntimeHostOverrides = {}): Promise<RuntimeHost> {
  const configuration = overrides.configuration ?? loadRuntimeConfiguration();
  const kernelProviders = overrides.kernelProviders ?? createDefaultKernelProviders();
  const store = overrides.store ?? (await buildStore(configuration));
  const eventPublisher = overrides.eventPublisher ?? createInProcessEventPublisher();
  const telemetry = overrides.telemetry ?? createRuntimeTelemetry();
  const logger = overrides.logger ?? createRuntimeLogger(configuration.logLevel);
  const eventIdGenerator = createRuntimeIdGenerator();

  const kernel = createAocKernel({
    recognitionProvider: kernelProviders.recognitionProvider,
    clock: kernelProviders.clock,
    idGenerator: kernelProviders.idGenerator,
    ...(overrides.policyPackProvider !== undefined ? { policyPackProvider: overrides.policyPackProvider } : {}),
  });

  const bootId = eventIdGenerator.nextId('boot');
  await store.recordRuntimeVersion({
    bootId,
    runtimeVersion: configuration.runtimeVersion,
    kernelVersion: AOC_KERNEL_VERSION,
    recordedAt: kernelProviders.clock.now(),
  });

  return {
    configuration,
    kernel,
    kernelProviders,
    store,
    eventPublisher,
    telemetry,
    logger,
    bootId,
    handleGovernanceEvaluate(input) {
      return evaluateGovernanceRequest(input, {
        kernel,
        clock: kernelProviders.clock,
        idGenerator: kernelProviders.idGenerator,
        eventIdGenerator,
        store,
        eventPublisher,
        telemetry,
        logger,
        configuration,
      });
    },
    getHealth() {
      return computeRuntimeHealth({
        configuration,
        store,
        hasPolicyPackProvider: overrides.policyPackProvider !== undefined,
        eventPublishingEnabled: configuration.eventPublishing.enabled,
        now: kernelProviders.clock.now,
      });
    },
    async close() {
      await store.close();
    },
  };
}
