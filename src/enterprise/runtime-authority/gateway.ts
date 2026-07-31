import type { RuntimeAuthorityVerifier } from './crypto.js';
import { GOVERNED_RUNTIME_ACTIONABLE_STATES, PROHIBITED_CAPABILITIES } from './contracts.js';
import type {
  RuntimeCapabilityGrant,
  GatewayDecision,
  GatewayDenialCode,
  GovernedRuntimeState,
  ProtectedActionRequest,
} from './contracts.js';
import type { RuntimeEvidenceLog } from './evidence.js';
import type { CapabilityGrantStore, GovernedAgentStore, GovernedRuntimeStore, LeaseStore } from './stores.js';

/**
 * The AOC Enforcement Gateway (mission section 4) -- the single authoritative
 * path a protected action must cross. `authorizeAction` is the entire public
 * surface: there is no partial-check / fast-path helper a caller could use
 * to skip a step. Every one of the mission's 15 checks runs, in order, on
 * every call; the first failing check produces the decision and every
 * subsequent check is skipped (a denial never depends on which later checks
 * *would* have also failed).
 *
 * Fail-closed (mission section 2.3): `authorizeAction` never throws. Any
 * unexpected failure -- a store throwing, a verifier throwing, a defensive
 * assertion failing -- is caught and converted into
 * `AUTHORITY_SERVICE_UNAVAILABLE`. Uncertainty is never interpreted as
 * permission.
 */
export interface RuntimeAuthorityGatewayDeps {
  readonly agents: GovernedAgentStore;
  readonly runtimes: GovernedRuntimeStore;
  readonly grants: CapabilityGrantStore;
  readonly leases: LeaseStore;
  readonly evidence: RuntimeEvidenceLog;
  readonly verifier: RuntimeAuthorityVerifier;
  readonly now: () => string;
  /** Global/tenant emergency kill switch, independent of any single runtime's state (mission section 4, check 15). Defaults to "never". */
  readonly isEmergencyDenied?: (tenantId: string) => boolean;
}

function runtimeStateDenialCode(state: GovernedRuntimeState): GatewayDenialCode {
  switch (state) {
    case 'PAUSED':
      return 'RUNTIME_PAUSED';
    case 'ISOLATED':
      return 'RUNTIME_ISOLATED';
    case 'QUARANTINED':
      return 'RUNTIME_QUARANTINED';
    case 'TERMINATED':
      return 'RUNTIME_TERMINATED';
    default:
      return 'RUNTIME_NOT_RUNNING';
  }
}

/** True when every key in `scope` is satisfied by the corresponding value in `resource`. `'*'` in `scope` matches any present value for that key (an explicit, auditable wildcard -- never an implicit one). */
function resourceWithinScope(scope: Readonly<Record<string, unknown>>, resource: Readonly<Record<string, unknown>>): boolean {
  for (const [key, scopedValue] of Object.entries(scope)) {
    if (scopedValue === '*') {
      if (!(key in resource)) return false;
      continue;
    }
    if (resource[key] !== scopedValue) return false;
  }
  return true;
}

export function createRuntimeAuthorityGateway(deps: RuntimeAuthorityGatewayDeps): { authorizeAction(request: ProtectedActionRequest): GatewayDecision } {
  function deny(request: ProtectedActionRequest, code: GatewayDenialCode, reason: string): GatewayDecision {
    const checkedAt = deps.now();
    let evidenceEventId = 'unrecorded';
    try {
      const event = deps.evidence.append({
        tenantId: request.tenantId,
        runtimeId: request.runtimeId,
        agentId: request.agentId,
        eventType: 'ACTION_DENIED',
        actorType: 'SYSTEM',
        actorId: 'aoc.runtime-authority.gateway',
        capability: request.capability,
        resource: request.resource,
        decision: 'DENY',
        reason,
        leaseId: request.lease.payload.leaseId,
        correlationId: request.correlationId,
        payload: { code },
      });
      evidenceEventId = event.eventId;
    } catch {
      // Evidence emission must never turn a denial into an unhandled throw
      // that a caller could misread as "no decision" -- the denial itself is
      // still returned; `evidenceEventId` records that evidence emission
      // itself failed (a fact worth surfacing, never worth hiding).
    }
    return { decision: 'DENY', code, reason, correlationId: request.correlationId, evidenceEventId, checkedAt };
  }

  function allow(request: ProtectedActionRequest, grant: RuntimeCapabilityGrant): GatewayDecision {
    const checkedAt = deps.now();
    const event = deps.evidence.append({
      tenantId: request.tenantId,
      runtimeId: request.runtimeId,
      agentId: request.agentId,
      eventType: 'ACTION_AUTHORIZED',
      actorType: 'SYSTEM',
      actorId: 'aoc.runtime-authority.gateway',
      capability: request.capability,
      resource: request.resource,
      decision: 'ALLOW',
      reason: 'All enforcement checks passed.',
      policyVersion: request.lease.payload.policyVersion,
      leaseId: request.lease.payload.leaseId,
      correlationId: request.correlationId,
      payload: { grantId: grant.grantId },
    });
    return { decision: 'ALLOW', reason: 'authorized', correlationId: request.correlationId, evidenceEventId: event.eventId, checkedAt };
  }

  return {
    authorizeAction(request: ProtectedActionRequest): GatewayDecision {
      try {
        deps.evidence.append({
          tenantId: request.tenantId,
          runtimeId: request.runtimeId,
          agentId: request.agentId,
          eventType: 'ACTION_REQUESTED',
          actorType: 'AGENT',
          actorId: request.agentId,
          capability: request.capability,
          resource: request.resource,
          leaseId: request.lease.payload.leaseId,
          correlationId: request.correlationId,
          payload: {},
        });

        // 1. Does the runtime exist?
        const runtime = deps.runtimes.get(request.runtimeId);
        if (runtime === undefined) return deny(request, 'RUNTIME_NOT_FOUND', `No GovernedRuntime '${request.runtimeId}'.`);

        // 2. Is the runtime state RUNNING?
        if (!GOVERNED_RUNTIME_ACTIONABLE_STATES.includes(runtime.state)) {
          return deny(request, runtimeStateDenialCode(runtime.state), `Runtime '${request.runtimeId}' is '${runtime.state}', not RUNNING.`);
        }

        // 3. Is the governed agent active?
        const agent = deps.agents.get(request.tenantId, request.agentId);
        if (agent === undefined) return deny(request, 'AGENT_NOT_FOUND', `No GovernedAgent '${request.agentId}' in tenant '${request.tenantId}'.`);
        if (agent.status === 'SUSPENDED') return deny(request, 'AGENT_SUSPENDED', `GovernedAgent '${request.agentId}' is SUSPENDED.`);
        if (agent.status === 'REVOKED') return deny(request, 'AGENT_REVOKED', `GovernedAgent '${request.agentId}' is REVOKED.`);

        // 4. Is the lease signature valid?
        if (!deps.verifier.verifyLease(request.lease)) {
          return deny(request, 'LEASE_INVALID', 'The Authority Lease signature does not verify against any trusted key.');
        }

        // 5. Is the lease unexpired?
        if (Date.parse(request.lease.payload.expiresAt) <= Date.parse(deps.now())) {
          return deny(request, 'LEASE_EXPIRED', `Lease '${request.lease.payload.leaseId}' expired at ${request.lease.payload.expiresAt}.`);
        }

        // 6. Is the lease unrevoked?
        const leaseRecord = deps.leases.get(request.lease.payload.leaseId);
        if (leaseRecord === undefined || leaseRecord.status !== 'ACTIVE') {
          return deny(
            request,
            'LEASE_REVOKED',
            leaseRecord === undefined
              ? `Lease '${request.lease.payload.leaseId}' is not on record; it was never issued by this Authority or the record was lost.`
              : `Lease '${request.lease.payload.leaseId}' status is '${leaseRecord.status}', not ACTIVE.`,
          );
        }

        // 7/8/9. Tenant/runtime/agent binding.
        if (leaseRecord.payload.tenantId !== request.tenantId) return deny(request, 'LEASE_TENANT_MISMATCH', 'Lease tenantId does not match the request.');
        if (leaseRecord.payload.runtimeId !== request.runtimeId) return deny(request, 'LEASE_RUNTIME_MISMATCH', 'Lease runtimeId does not match the request.');
        if (leaseRecord.payload.agentId !== request.agentId) return deny(request, 'LEASE_AGENT_MISMATCH', 'Lease agentId does not match the request.');

        // 10. Does the requested capability exist in the lease?
        if (!leaseRecord.payload.capabilities.includes(request.capability)) {
          return deny(request, 'CAPABILITY_NOT_GRANTED', `Lease '${request.lease.payload.leaseId}' does not include capability '${request.capability}'.`);
        }

        // 11. Is the capability grant still active?
        const activeGrants = deps.grants.findActive(request.runtimeId, request.capability);
        const grant = activeGrants[0];
        if (grant === undefined) {
          return deny(request, 'CAPABILITY_REVOKED', `No active RuntimeCapabilityGrant for '${request.capability}' on runtime '${request.runtimeId}'.`);
        }

        // 12. Is the requested resource within scope?
        if (!resourceWithinScope(grant.resourceScope, request.resource)) {
          return deny(request, 'RESOURCE_OUT_OF_SCOPE', `Requested resource is outside grant '${grant.grantId}' resourceScope.`);
        }

        // 13. Does the applicable policy allow the action?
        if (PROHIBITED_CAPABILITIES.includes(request.capability)) {
          return deny(request, 'POLICY_DENIED', `Capability '${request.capability}' is unconditionally prohibited by policy.`);
        }
        if (leaseRecord.payload.policyVersion !== runtime.policyVersion) {
          return deny(request, 'POLICY_DENIED', `Lease was issued under policyVersion '${leaseRecord.payload.policyVersion}' but runtime is now on '${runtime.policyVersion}'; re-issue a lease.`);
        }

        // 14. Has the request nonce already been consumed (replay)?
        if (!deps.leases.markNonceConsumed(leaseRecord.leaseId, request.requestNonce)) {
          return deny(request, 'LEASE_REPLAYED', `requestNonce '${request.requestNonce}' was already consumed against lease '${leaseRecord.leaseId}'.`);
        }

        // 15. Has any emergency control invalidated this execution?
        if (deps.isEmergencyDenied?.(request.tenantId) === true) {
          return deny(request, 'EMERGENCY_DENIED', `An active emergency control denies all actions for tenant '${request.tenantId}'.`);
        }

        return allow(request, grant);
      } catch (error) {
        // Fail closed (mission section 2.3) -- an unexpected failure of any
        // kind is a denial, never a throw a caller might interpret as "try
        // direct access instead."
        return deny(request, 'AUTHORITY_SERVICE_UNAVAILABLE', `The Enforcement Gateway failed unexpectedly: ${error instanceof Error ? error.message : String(error)}.`);
      }
    },
  };
}
