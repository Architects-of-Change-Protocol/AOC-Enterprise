import { AOC_RUNTIME_AUTHORITY_VERSION } from '../runtime-authority/contracts.js';
import type { EnterpriseModule, EnterpriseModuleHealth } from './enterprise-module.js';

/**
 * AOC Runtime Authority module (see `docs/architecture/ADR-RUNTIME-AUTHORITY.md`).
 * Deliberately has no declared dependency on the Governance Store or Agent
 * Passport modules: Runtime Authority owns its own independent stores and
 * evidence chain (mirroring the Passport/Evidence/Assurance precedent of
 * "own store, never persisted inside another module's store"), and can
 * govern a runtime with zero Passport records present -- a `GovernedAgent`
 * may optionally cross-reference a `passportId`, but nothing in the
 * enforcement path requires the Passport module to be healthy.
 */
export const RUNTIME_AUTHORITY_MODULE_ID = 'aoc.enterprise.runtime-authority';

export function createRuntimeAuthorityModule(now: () => string, required: boolean): EnterpriseModule {
  return {
    descriptor: {
      id: RUNTIME_AUTHORITY_MODULE_ID,
      version: AOC_RUNTIME_AUTHORITY_VERSION,
      displayName: 'AOC Runtime Authority',
      description: 'External governance and enforcement layer: governed agent/runtime identity, capability grants, short-lived signed leases, the Enforcement Gateway, the emergency control plane, and tamper-evident evidence.',
      criticality: required ? 'required' : 'optional',
      dependencies: [],
      capabilities: [
        'runtime-authority.agent.register',
        'runtime-authority.agent.suspend',
        'runtime-authority.agent.revoke',
        'runtime-authority.runtime.create',
        'runtime-authority.runtime.authorize',
        'runtime-authority.runtime.start',
        'runtime-authority.capability.grant',
        'runtime-authority.capability.revoke',
        'runtime-authority.lease.issue',
        'runtime-authority.lease.renew',
        'runtime-authority.lease.revoke',
        'runtime-authority.gateway.authorize-action',
        'runtime-authority.control.pause',
        'runtime-authority.control.resume',
        'runtime-authority.control.isolate',
        'runtime-authority.control.quarantine',
        'runtime-authority.control.terminate',
        'runtime-authority.evidence.verify',
      ],
    },
    async initialize() {
      // Stores are constructed eagerly by the composition root (in-memory,
      // nothing to connect to). Nothing to validate at initialize time in
      // this MVP -- a future durable store would check writability here,
      // mirroring `createAgentPassportModule`.
    },
    async health(): Promise<EnterpriseModuleHealth> {
      return { status: 'healthy', checkedAt: now() };
    },
    async shutdown() {
      // No external resources held.
    },
  };
}
