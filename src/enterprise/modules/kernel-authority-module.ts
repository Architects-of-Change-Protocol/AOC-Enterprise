import { AOC_KERNEL_AUTHORITY_RUNTIME_VERSION } from '../kernel-authority/contracts.js';
import type { KernelAuthorityStore } from '../kernel-authority/kernel-authority-store.js';
import type { EnterpriseModule, EnterpriseModuleHealth } from './enterprise-module.js';

export const KERNEL_AUTHORITY_MODULE_ID = 'aoc.enterprise.kernel-authority';

/**
 * The Kernel Authority Runtime module: the durable, operator-provisioned
 * recognition/authority world the Kernel decides against.
 *
 * `criticality` defaults to `required` for this module, unlike its Passport
 * and Assurance siblings, and the asymmetry is deliberate. Those two degrade
 * gracefully because a deployment can still evaluate governance without them.
 * This one cannot: if the authority source is unreadable, every evaluation
 * would be answered out of a world that no longer reflects what operators
 * provisioned. Reporting `ready` in that state would be reporting a healthy
 * service that has quietly lost its authority -- so a deployment that
 * configured durable authority is not ready without it.
 *
 * It declares no dependency on the Governance Store. Evaluation history and
 * authority source-of-truth are separate concerns living in separate stores,
 * and neither needs the other to come online.
 */
export function createKernelAuthorityModule(store: KernelAuthorityStore, now: () => string, required: boolean): EnterpriseModule {
  return {
    descriptor: {
      id: KERNEL_AUTHORITY_MODULE_ID,
      version: AOC_KERNEL_AUTHORITY_RUNTIME_VERSION,
      displayName: 'Kernel Authority Runtime',
      description: 'Durable, operator-provisioned recognition and authority state restored into the world AocKernel evaluates against.',
      criticality: required ? 'required' : 'optional',
      capabilities: [
        'kernel-authority.provision',
        'kernel-authority.revoke',
        'kernel-authority.hydrate',
        'kernel-authority.external-subject-binding',
        'kernel-authority.audit-trail',
      ],
    },
    async initialize() {
      const health = await store.health();
      if (!health.writable) {
        throw new Error(`KernelAuthorityStore (${store.providerKind}) is not writable (migrationState: ${health.migrationState}).`);
      }
    },
    async health(): Promise<EnterpriseModuleHealth> {
      const health = await store.health();
      return {
        status: health.status,
        checkedAt: now(),
        ...(health.status !== 'healthy' ? { message: `KernelAuthorityStore is ${health.status}.` } : {}),
        details: {
          // Deliberately shape and counts only: never an actor id, a capability,
          // a resource scope, or any other authority content.
          provider: store.providerKind,
          durable: store.providerKind === 'sqlite',
          writable: health.writable,
          readable: health.readable,
          schemaVersion: health.schemaVersion,
          migrationState: health.migrationState,
          recordCount: health.recordCount,
        },
      };
    },
    async shutdown() {
      await store.close();
    },
  };
}
