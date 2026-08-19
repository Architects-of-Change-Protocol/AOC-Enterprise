import { AOC_KERNEL_VERSION, type AocKernel } from '../../kernel/index.js';
import type { EnterpriseModule } from './enterprise-module.js';
import { PROVIDERS_MODULE_ID } from './providers-module.js';

export const KERNEL_MODULE_ID = 'aoc.kernel';

/**
 * Reports Kernel readiness/version -- never re-implements or reinterprets
 * Kernel decisions. `kernel` is already fully constructed by the composition
 * root before this module exists (the Kernel's own construction is
 * synchronous and has no I/O); `initialize()` here only confirms the
 * instance is present and depends on the providers module because
 * `AocKernel` is constructed from `KernelProviderSet`.
 */
export function createKernelModule(kernel: AocKernel, now: () => string): EnterpriseModule {
  return {
    descriptor: {
      id: KERNEL_MODULE_ID,
      version: AOC_KERNEL_VERSION,
      displayName: 'Soberanía Kernel',
      description: 'The governance decision engine hosted by Soberanía Enterprise.',
      criticality: 'required',
      dependencies: [{ moduleId: PROVIDERS_MODULE_ID }],
      capabilities: ['kernel.evaluate'],
    },
    async initialize() {
      if (kernel === undefined) {
        throw new Error('AocKernel instance is missing.');
      }
    },
    async health() {
      return { status: 'healthy', checkedAt: now(), details: { kernelVersion: AOC_KERNEL_VERSION } };
    },
    async shutdown() {
      // AocKernel owns no external resources.
    },
  };
}
