import type { KernelProviderSet } from '../providers/kernel-provider-composition.js';
import { AOC_ENTERPRISE_HOST_VERSION } from '../version.js';
import type { EnterpriseModule } from './enterprise-module.js';

export const PROVIDERS_MODULE_ID = 'aoc.enterprise.providers';

/**
 * Wraps the already-composed `KernelProviderSet` (Recognition/Authority/
 * Approval/Handshake runtimes bridged into a `RecognitionProvider` --
 * `providers/kernel-provider-composition.ts`) as a required Enterprise
 * module. It does not construct anything itself and it implements no
 * decision logic -- it only confirms the provider set the composition root
 * already built is present, and reports which provider contracts are loaded.
 */
export function createProvidersModule(kernelProviders: KernelProviderSet, now: () => string, hasPolicyPackProvider: boolean): EnterpriseModule {
  const capabilities = ['providers.recognition', 'providers.authority', 'providers.approval', 'providers.handshake'];
  if (hasPolicyPackProvider) capabilities.push('providers.policy-pack');

  return {
    descriptor: {
      id: PROVIDERS_MODULE_ID,
      version: AOC_ENTERPRISE_HOST_VERSION,
      displayName: 'Providers',
      description: 'Recognition/Authority/Approval/Handshake providers the Kernel is wired to.',
      criticality: 'required',
      capabilities,
    },
    async initialize() {
      if (kernelProviders.recognitionProvider === undefined) {
        throw new Error('KernelProviderSet.recognitionProvider is missing.');
      }
    },
    async health() {
      return { status: 'healthy', checkedAt: now() };
    },
    async shutdown() {
      // In-memory runtimes; nothing to release.
    },
  };
}
