import { AOC_KERNEL_VERSION } from '../../kernel/index.js';
import type { EnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import { computeConfigurationChecksum } from '../configuration/enterprise-configuration.js';
import type { GovernanceStore } from '../persistence/governance-store.js';

export type EnterpriseHealthState = 'healthy' | 'degraded' | 'unhealthy';

/**
 * The mission's suggested field names are `enterpriseVersion`/`kernelVersion`/
 * `status`/`persistence.status`/`providers.loaded`. This report keeps that
 * shape but retains the richer `persistence.provider`/`persistence.connected`
 * detail already exposed in PR-002 -- `persistence.status` is derived from
 * `connected`, not a replacement for it.
 */
export interface EnterpriseHealthReport {
  readonly status: EnterpriseHealthState;
  readonly enterpriseVersion: string;
  readonly kernelVersion: string;
  readonly buildVersion: string;
  readonly persistence: {
    readonly provider: GovernanceStore['providerKind'];
    readonly connected: boolean;
    readonly status: 'connected' | 'unreachable';
  };
  readonly providers: {
    readonly loaded: readonly string[];
  };
  readonly configurationChecksum: string;
  readonly checkedAt: string;
}

export interface EnterpriseHealthDependencies {
  readonly configuration: EnterpriseConfiguration;
  readonly store: GovernanceStore;
  readonly hasPolicyPackProvider: boolean;
  readonly eventPublishingEnabled: boolean;
  readonly now: () => string;
}

/**
 * `/health` never returns provider internals, connection strings, or API
 * keys -- only booleans, an explicit `loaded` provider list, and version
 * identifiers, per the mission's "No sensitive information" requirement.
 * `enterpriseVersion`/`kernelVersion` are reported separately and are never
 * confused with `src/runtime/`'s own, unrelated versioning.
 */
export async function computeEnterpriseHealth(deps: EnterpriseHealthDependencies): Promise<EnterpriseHealthReport> {
  const connected = await deps.store.checkConnectivity();
  const status: EnterpriseHealthState = !connected ? 'unhealthy' : 'healthy';

  const loaded: string[] = ['recognitionProvider'];
  if (deps.hasPolicyPackProvider) loaded.push('policyPackProvider');
  if (deps.eventPublishingEnabled) loaded.push('eventPublisher');

  return {
    status,
    enterpriseVersion: deps.configuration.enterpriseVersion,
    kernelVersion: AOC_KERNEL_VERSION,
    buildVersion: process.env.npm_package_version ?? deps.configuration.enterpriseVersion,
    persistence: {
      provider: deps.store.providerKind,
      connected,
      status: connected ? 'connected' : 'unreachable',
    },
    providers: {
      loaded,
    },
    configurationChecksum: computeConfigurationChecksum(deps.configuration),
    checkedAt: deps.now(),
  };
}
