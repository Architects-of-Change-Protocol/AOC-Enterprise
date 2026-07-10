import { AOC_KERNEL_VERSION } from '../../kernel/index.js';
import type { RuntimeConfiguration } from '../configuration/runtime-configuration.js';
import { computeConfigurationChecksum } from '../configuration/runtime-configuration.js';
import type { GovernanceStore } from '../persistence/governance-store.js';

export type RuntimeHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface RuntimeHealthReport {
  readonly status: RuntimeHealthStatus;
  readonly runtimeVersion: string;
  readonly kernelVersion: string;
  readonly buildVersion: string;
  readonly database: {
    readonly provider: GovernanceStore['providerKind'];
    readonly connected: boolean;
  };
  readonly providers: {
    readonly recognitionProvider: boolean;
    readonly policyPackProvider: boolean;
    readonly eventPublisher: boolean;
  };
  readonly configurationChecksum: string;
  readonly checkedAt: string;
}

export interface RuntimeHealthDependencies {
  readonly configuration: RuntimeConfiguration;
  readonly store: GovernanceStore;
  readonly hasPolicyPackProvider: boolean;
  readonly eventPublishingEnabled: boolean;
  readonly now: () => string;
}

/**
 * `/health` never returns provider internals, connection strings, or API
 * keys -- only booleans and version identifiers, per the mission's "No
 * sensitive information" requirement.
 */
export async function computeRuntimeHealth(deps: RuntimeHealthDependencies): Promise<RuntimeHealthReport> {
  const connected = await deps.store.checkConnectivity();

  const status: RuntimeHealthStatus = !connected ? 'unhealthy' : 'healthy';

  return {
    status,
    runtimeVersion: deps.configuration.runtimeVersion,
    kernelVersion: AOC_KERNEL_VERSION,
    buildVersion: process.env.npm_package_version ?? deps.configuration.runtimeVersion,
    database: {
      provider: deps.store.providerKind,
      connected,
    },
    providers: {
      recognitionProvider: true,
      policyPackProvider: deps.hasPolicyPackProvider,
      eventPublisher: deps.eventPublishingEnabled,
    },
    configurationChecksum: computeConfigurationChecksum(deps.configuration),
    checkedAt: deps.now(),
  };
}
