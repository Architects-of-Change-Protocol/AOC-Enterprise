import type { GovernanceStore } from '../persistence/governance-store.js';
import { AOC_ENTERPRISE_HOST_VERSION } from '../version.js';
import type { EnterpriseModule } from './enterprise-module.js';

export const PERSISTENCE_MODULE_ID = 'aoc.enterprise.persistence';

/**
 * Wraps the current `GovernanceStore` (`persistence/governance-store.ts`) as
 * a required module: every evaluation the current Host promises to persist
 * depends on it. `initialize()` verifies connectivity (mirroring what
 * `/health` already checked ad hoc); `shutdown()` releases the store's
 * resources (`store.close()`) -- the one real cleanup call this system had
 * before this PR, now run in dependency-reverse order alongside every other
 * module instead of being the Host's only close step.
 */
export function createPersistenceModule(store: GovernanceStore, now: () => string): EnterpriseModule {
  return {
    descriptor: {
      id: PERSISTENCE_MODULE_ID,
      version: AOC_ENTERPRISE_HOST_VERSION,
      displayName: 'Persistence',
      description: 'Durable (or in-memory) governance decision store.',
      criticality: 'required',
      capabilities: ['persistence.governance-decisions'],
    },
    async initialize() {
      const connected = await store.checkConnectivity();
      if (!connected) {
        throw new Error(`GovernanceStore (${store.providerKind}) is not reachable.`);
      }
    },
    async health() {
      const connected = await store.checkConnectivity();
      return connected
        ? { status: 'healthy', checkedAt: now(), details: { provider: store.providerKind } }
        : { status: 'unhealthy', checkedAt: now(), message: 'GovernanceStore is unreachable.', details: { provider: store.providerKind } };
    },
    async shutdown() {
      await store.close();
    },
  };
}
