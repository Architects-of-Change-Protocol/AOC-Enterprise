import type { AgentPassportStore } from '../passport/passport-store.js';
import { AOC_AGENT_PASSPORT_RUNTIME_VERSION } from '../passport/contracts.js';
import { GOVERNANCE_STORE_MODULE_ID } from './governance-store-module.js';
import type { EnterpriseModule, EnterpriseModuleHealth } from './enterprise-module.js';

/**
 * PR-006: the Agent Passport Runtime module (mission section 38). Its
 * `dependencies` on the Governance Store are declared `optional: true` --
 * the Passport Runtime can identify and lifecycle-manage an agent with zero
 * Governance References (mission: "Evidence dependency may be optional if
 * Passport can exist before Evidence references"), it only *benefits* from
 * the Governance Store being ready when a caller links a reference. The
 * Kernel never depends on this module, and this module never appears in the
 * Kernel's own dependency graph (mission section 71: "Kernel must not
 * import Passport").
 */
export const AGENT_PASSPORT_MODULE_ID = 'aoc.enterprise.agent-passport';

/**
 * Wraps the Agent Passport Store as an Enterprise module. `criticality` is
 * caller-supplied (mission section 52: "Support module criticality through
 * configuration. Do not hardcode one deployment model.") -- a deployment
 * that treats Passport-backed agent recognition as mandatory sets
 * `AOC_ENTERPRISE_PASSPORT_REQUIRED=true` (`required`); the default is
 * `optional`, so a Passport Store outage degrades this module without
 * blocking governance evaluation readiness.
 */
export function createAgentPassportModule(store: AgentPassportStore, now: () => string, required: boolean): EnterpriseModule {
  return {
    descriptor: {
      id: AGENT_PASSPORT_MODULE_ID,
      version: AOC_AGENT_PASSPORT_RUNTIME_VERSION,
      displayName: 'Agent Passport Runtime',
      description: 'Governed identity, authority, status, provenance, and evidence-reference record for agents operating within an organization.',
      criticality: required ? 'required' : 'optional',
      dependencies: [{ moduleId: GOVERNANCE_STORE_MODULE_ID, optional: true }],
      capabilities: [
        'passport.issue',
        'passport.reconstruct',
        'passport.verify',
        'passport.suspend',
        'passport.reactivate',
        'passport.revoke',
        'passport.retire',
        'passport.reference-evidence',
        'passport.reference-governance',
        'passport.project-view',
      ],
    },
    async initialize() {
      const health = await store.health();
      if (!health.writable) {
        throw new Error(`AgentPassportStore (${store.providerKind}) is not writable (migrationState: ${health.migrationState}).`);
      }
    },
    async health(): Promise<EnterpriseModuleHealth> {
      const health = await store.health();
      return {
        status: health.status,
        checkedAt: now(),
        ...(health.status !== 'healthy' ? { message: `AgentPassportStore is ${health.status}.` } : {}),
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
