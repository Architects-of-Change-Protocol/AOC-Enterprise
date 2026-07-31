import { RuntimeAuthorityError } from './errors.js';
import type {
  RuntimeCapabilityGrant,
  GovernedAgent,
  GovernedRuntime,
  LeaseRecord,
} from './contracts.js';

/**
 * In-memory current-state stores for the vertical slice. Deliberately
 * *not* event-sourced like `../passport/` or `../governance-store/` --
 * `RuntimeEvidenceLog` (`evidence.ts`) is the append-only, tamper-evident
 * record of what happened; these stores hold only the current projection
 * needed for a Gateway check to be a single, fast, synchronous-looking
 * lookup. See `docs/architecture/ADR-RUNTIME-AUTHORITY.md`, "Known
 * limitations", for why a future iteration might converge these onto the
 * same event-sourced discipline as Passport/Governance Store.
 */

export interface RuntimeAuthorityAccessContext {
  readonly system: boolean;
  readonly tenantId?: string;
}

export function requireTenantScope(context: RuntimeAuthorityAccessContext): string {
  if (context.system) return context.tenantId ?? '__system__';
  if (context.tenantId === undefined || context.tenantId.length === 0) {
    throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_TENANT_SCOPE_REQUIRED', 'A non-system caller must provide a tenant scope for Runtime Authority access.');
  }
  return context.tenantId;
}

export function assertTenantAccess(context: RuntimeAuthorityAccessContext, recordTenantId: string): void {
  if (context.system) return;
  if (context.tenantId !== recordTenantId) {
    throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_ACCESS_SCOPE_VIOLATION', `The caller is not authorized to access Runtime Authority data for tenant '${recordTenantId}'.`);
  }
}

export interface GovernedAgentStore {
  put(agent: GovernedAgent): void;
  get(tenantId: string, agentId: string): GovernedAgent | undefined;
  update(tenantId: string, agentId: string, patch: (current: GovernedAgent) => GovernedAgent): GovernedAgent;
  list(tenantId: string): readonly GovernedAgent[];
}

export function createInMemoryGovernedAgentStore(): GovernedAgentStore {
  const byKey = new Map<string, GovernedAgent>();
  const key = (tenantId: string, agentId: string) => `${tenantId}::${agentId}`;

  return {
    put(agent) {
      byKey.set(key(agent.tenantId, agent.agentId), agent);
    },
    get(tenantId, agentId) {
      return byKey.get(key(tenantId, agentId));
    },
    update(tenantId, agentId, patch) {
      const current = byKey.get(key(tenantId, agentId));
      if (current === undefined) throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_AGENT_NOT_FOUND', `No GovernedAgent '${agentId}' in tenant '${tenantId}'.`);
      const next = patch(current);
      byKey.set(key(tenantId, agentId), next);
      return next;
    },
    list(tenantId) {
      return [...byKey.values()].filter((agent) => agent.tenantId === tenantId);
    },
  };
}

export interface GovernedRuntimeStore {
  put(runtime: GovernedRuntime): void;
  get(runtimeId: string): GovernedRuntime | undefined;
  update(runtimeId: string, patch: (current: GovernedRuntime) => GovernedRuntime): GovernedRuntime;
  list(tenantId: string): readonly GovernedRuntime[];
}

export function createInMemoryGovernedRuntimeStore(): GovernedRuntimeStore {
  const byId = new Map<string, GovernedRuntime>();

  return {
    put(runtime) {
      byId.set(runtime.runtimeId, runtime);
    },
    get(runtimeId) {
      return byId.get(runtimeId);
    },
    update(runtimeId, patch) {
      const current = byId.get(runtimeId);
      if (current === undefined) throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_RUNTIME_NOT_FOUND', `No GovernedRuntime '${runtimeId}'.`);
      const next = patch(current);
      byId.set(runtimeId, next);
      return next;
    },
    list(tenantId) {
      return [...byId.values()].filter((runtime) => runtime.tenantId === tenantId);
    },
  };
}

export interface CapabilityGrantStore {
  put(grant: RuntimeCapabilityGrant): void;
  get(grantId: string): RuntimeCapabilityGrant | undefined;
  update(grantId: string, patch: (current: RuntimeCapabilityGrant) => RuntimeCapabilityGrant): RuntimeCapabilityGrant;
  listByRuntime(runtimeId: string): readonly RuntimeCapabilityGrant[];
  /** Active grants for `runtimeId` covering `capability`, most-recently-issued first. */
  findActive(runtimeId: string, capability: string): readonly RuntimeCapabilityGrant[];
}

export function createInMemoryCapabilityGrantStore(): CapabilityGrantStore {
  const byId = new Map<string, RuntimeCapabilityGrant>();

  return {
    put(grant) {
      byId.set(grant.grantId, grant);
    },
    get(grantId) {
      return byId.get(grantId);
    },
    update(grantId, patch) {
      const current = byId.get(grantId);
      if (current === undefined) throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_GRANT_NOT_FOUND', `No RuntimeCapabilityGrant '${grantId}'.`);
      const next = patch(current);
      byId.set(grantId, next);
      return next;
    },
    listByRuntime(runtimeId) {
      return [...byId.values()].filter((grant) => grant.runtimeId === runtimeId);
    },
    findActive(runtimeId, capability) {
      return [...byId.values()]
        .filter((grant) => grant.runtimeId === runtimeId && grant.capability === capability && grant.status === 'ACTIVE')
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    },
  };
}

export interface LeaseStore {
  put(lease: LeaseRecord): void;
  get(leaseId: string): LeaseRecord | undefined;
  /** Every currently-ACTIVE lease for a runtime -- what pause/isolate/quarantine/terminate must revoke. */
  listActiveByRuntime(runtimeId: string): readonly LeaseRecord[];
  markNonceConsumed(leaseId: string, nonce: string): boolean; // false => nonce was already consumed (replay)
}

export function createInMemoryLeaseStore(): LeaseStore {
  const byId = new Map<string, LeaseRecord>();
  const byRuntime = new Map<string, Set<string>>();

  return {
    put(lease) {
      byId.set(lease.leaseId, lease);
      const set = byRuntime.get(lease.payload.runtimeId) ?? new Set<string>();
      set.add(lease.leaseId);
      byRuntime.set(lease.payload.runtimeId, set);
    },
    get(leaseId) {
      return byId.get(leaseId);
    },
    listActiveByRuntime(runtimeId) {
      const ids = byRuntime.get(runtimeId) ?? new Set<string>();
      const leases: LeaseRecord[] = [];
      for (const id of ids) {
        const lease = byId.get(id);
        if (lease !== undefined && lease.status === 'ACTIVE') leases.push(lease);
      }
      return leases;
    },
    markNonceConsumed(leaseId, nonce) {
      const lease = byId.get(leaseId);
      if (lease === undefined) return false;
      if (lease.consumedNonces.has(nonce)) return false;
      lease.consumedNonces.add(nonce);
      return true;
    },
  };
}
