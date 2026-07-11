import type { AssuranceStore } from '../assurance/assurance-store.js';
import type { AssuranceFrameworkRegistry } from '../assurance/framework-registry.js';
import { AOC_ASSURANCE_RUNTIME_VERSION } from '../assurance/contracts.js';
import { GOVERNANCE_STORE_MODULE_ID } from './governance-store-module.js';
import { EVENTS_MODULE_ID } from './events-module.js';
import type { EnterpriseModule, EnterpriseModuleHealth } from './enterprise-module.js';

/**
 * PR-007: the Assurance Runtime module (mission sections 55-57). Assurance
 * is generally OPTIONAL for core governance evaluation -- its failure
 * degrades Enterprise without making `POST /api/governance/evaluate`
 * unavailable. Deployments that treat Assurance as mandatory set
 * `AOC_ENTERPRISE_ASSURANCE_REQUIRED=true` (`criticality: 'required'`);
 * criticality is never hardcoded.
 *
 * Dependencies on the Governance Store and events are `optional: true`: the
 * Assurance Runtime consumes evidence when those modules are ready, and
 * degrades to `unknown` evidence resolutions when they are not. The Kernel
 * never depends on this module (mission section 77).
 */
export const ASSURANCE_MODULE_ID = 'aoc.enterprise.assurance';

export function createAssuranceModule(store: AssuranceStore, registry: AssuranceFrameworkRegistry, now: () => string, required: boolean): EnterpriseModule {
  return {
    descriptor: {
      id: ASSURANCE_MODULE_ID,
      version: AOC_ASSURANCE_RUNTIME_VERSION,
      displayName: 'Assurance Runtime',
      description: 'Versioned, evidence-driven Assurance control evaluation, findings, deterministic scoring, eligibility, and continuous signals.',
      criticality: required ? 'required' : 'optional',
      dependencies: [
        { moduleId: GOVERNANCE_STORE_MODULE_ID, optional: true },
        { moduleId: EVENTS_MODULE_ID, optional: true },
      ],
      capabilities: [
        'assurance.frameworks',
        'assurance.assess',
        'assurance.evidence.resolve',
        'assurance.controls.evaluate',
        'assurance.findings',
        'assurance.scoring',
        'assurance.eligibility',
        'assurance.signals',
        'assurance.verify',
        'assurance.reassess',
        'assurance.report',
      ],
    },
    async initialize() {
      const health = await store.health();
      if (!health.writable) {
        throw new Error(`AssuranceStore (${store.providerKind}) is not writable (migrationState: ${health.migrationState}).`);
      }
      // Registration freezes when Enterprise startup completes (mission
      // section 46): no framework may register after this point.
      registry.freeze();
      const registered = registry.list();
      if (registered.length === 0) {
        throw new Error('The Assurance Framework Registry is empty; at least one validated framework must be registered at composition time.');
      }
    },
    async health(): Promise<EnterpriseModuleHealth> {
      const health = await store.health();
      return {
        status: health.status,
        checkedAt: now(),
        ...(health.status !== 'healthy' ? { message: `AssuranceStore is ${health.status}.` } : {}),
        details: {
          provider: store.providerKind,
          writable: health.writable,
          readable: health.readable,
          schemaVersion: health.schemaVersion,
          migrationState: health.migrationState,
          registeredFrameworks: registry.list().length,
        },
      };
    },
    async shutdown() {
      await store.close();
    },
  };
}
