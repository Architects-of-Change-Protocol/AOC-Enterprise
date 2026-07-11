import type { GovernanceStore } from '../governance-store/governance-store.js';
import { AOC_GOVERNANCE_STORE_VERSION } from '../governance-store/contracts.js';
import type { EnterpriseModule, EnterpriseModuleHealth } from './enterprise-module.js';

/**
 * PR-004: the PR-003 Persistence module (`aoc.enterprise.persistence`)
 * evolved into the Governance Store module. Same lifecycle position
 * (required; readiness-gating), new identity and capabilities — see
 * `docs/enterprise/GOVERNANCE_STORE_MIGRATION_V1.md` for the documented
 * module-id migration.
 */
export const GOVERNANCE_STORE_MODULE_ID = 'aoc.enterprise.governance-store';

/** @deprecated PR-004 renamed the Persistence module; this alias points at the new id so `registry.get(PERSISTENCE_MODULE_ID)` keeps resolving the same module. */
export const PERSISTENCE_MODULE_ID = GOVERNANCE_STORE_MODULE_ID;

/**
 * Wraps the Governance Store as a required module: every evaluation the
 * Host returns must be durably recorded, so readiness requires an
 * *writable* store — read-only access is not enough (PR-004 section 68).
 * `initialize()` verifies connectivity, schema, and writability;
 * `shutdown()` releases the store's resources in reverse dependency order.
 */
export function createGovernanceStoreModule(store: GovernanceStore, now: () => string): EnterpriseModule {
  return {
    descriptor: {
      id: GOVERNANCE_STORE_MODULE_ID,
      version: AOC_GOVERNANCE_STORE_VERSION,
      displayName: 'Governance Store',
      description: 'Append-oriented, integrity-verifiable durable record of every governance evaluation.',
      criticality: 'required',
      capabilities: [
        'governance-store.append',
        'governance-store.query',
        'governance-store.reconstruct',
        'governance-store.verify',
        'governance-store.references',
        // Retained PR-002/PR-003 capability name so existing capability lookups keep working.
        'persistence.governance-decisions',
      ],
    },
    async initialize() {
      const connected = await store.checkConnectivity();
      if (!connected) {
        throw new Error(`GovernanceStore (${store.providerKind}) is not reachable.`);
      }
      const health = await store.health();
      if (!health.writable) {
        throw new Error(`GovernanceStore (${store.providerKind}) is not writable; evaluations cannot be durably recorded (migrationState: ${health.migrationState}).`);
      }
    },
    async health(): Promise<EnterpriseModuleHealth> {
      const connected = await store.checkConnectivity();
      if (!connected) {
        return { status: 'unhealthy', checkedAt: now(), message: 'GovernanceStore is unreachable.', details: { provider: store.providerKind } };
      }
      const health = await store.health();
      return {
        status: health.status,
        checkedAt: now(),
        ...(health.status !== 'healthy' ? { message: `GovernanceStore is ${health.status}.` } : {}),
        details: {
          provider: store.providerKind,
          writable: health.writable,
          readable: health.readable,
          schemaVersion: health.schemaVersion,
          migrationState: health.migrationState,
        },
      };
    },
    async shutdown() {
      await store.close();
    },
  };
}

/** @deprecated Use `createGovernanceStoreModule`. */
export const createPersistenceModule = createGovernanceStoreModule;
