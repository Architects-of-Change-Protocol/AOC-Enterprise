import type { RuntimeAuthoritySigner } from './crypto.js';
import { DEFAULT_LEASE_TTL_SECONDS, PROHIBITED_CAPABILITIES } from './contracts.js';
import type {
  AuthorityLeasePayload,
  RuntimeCapabilityGrant,
  CapabilityGrantStatus,
  GovernedAgent,
  GovernedAgentStatus,
  GovernedRuntime,
  GovernedRuntimeState,
  LeaseRecord,
  RuntimeControlRequest,
  SignedAuthorityLease,
} from './contracts.js';
import { computeDigest } from '../governance-store/digest.js';
import { RuntimeAuthorityError } from './errors.js';
import type { RuntimeEvidenceEvent } from './contracts.js';
import type { RuntimeEvidenceChainVerificationResult, RuntimeEvidenceLog } from './evidence.js';
import { assertRuntimeTransition, RuntimeStateTransitionError } from './state-machine.js';
import {
  assertTenantAccess,
  type CapabilityGrantStore,
  type GovernedAgentStore,
  type GovernedRuntimeStore,
  type LeaseStore,
  type RuntimeAuthorityAccessContext,
  requireTenantScope,
} from './stores.js';

/** Agent-lifecycle events (`AGENT_REGISTERED`/`AGENT_SUSPENDED`/`AGENT_REVOKED`) occur before any `GovernedRuntime` exists, but `RuntimeEvidenceEvent.runtimeId` is a required field (mission section 7). Each agent gets a stable pseudo-chain for its own lifecycle history, distinct from any runtime's chain. */
function agentEvidenceScope(agentId: string): string {
  return `agent-scope:${agentId}`;
}

export interface RegisterGovernedAgentInput {
  readonly agentId: string;
  readonly tenantId: string;
  readonly displayName: string;
  readonly agentType: string;
  readonly ownerAuthorityId: string;
  readonly publicKey?: string;
  readonly passportId?: string;
}

export interface CreateGovernedRuntimeInput {
  readonly tenantId: string;
  readonly agentId: string;
  readonly environmentId: string;
  readonly policyVersion: string;
  readonly riskScore?: number;
}

export interface GrantCapabilityInput {
  readonly tenantId: string;
  readonly runtimeId: string;
  readonly agentId: string;
  readonly capability: string;
  readonly resourceScope?: Readonly<Record<string, unknown>>;
  readonly constraints?: Readonly<Record<string, unknown>>;
  readonly issuedBy: string;
  readonly expiresAt?: string;
}

export interface IssueLeaseInput {
  readonly tenantId: string;
  readonly runtimeId: string;
  readonly agentId: string;
  readonly capabilities: readonly string[];
  readonly issuedBy: string;
  readonly ttlSeconds?: number;
}

export interface RuntimeControlOutcome {
  readonly runtime: GovernedRuntime;
  readonly revokedLeaseIds: readonly string[];
  readonly evidenceEventId: string;
}

export interface ResumeOutcome extends RuntimeControlOutcome {
  readonly lease: SignedAuthorityLease;
}

export interface QuarantineOutcome extends RuntimeControlOutcome {
  readonly forensicSnapshot: Readonly<Record<string, unknown>>;
}

export interface TerminateOutcome extends RuntimeControlOutcome {
  readonly revokedGrantIds: readonly string[];
}

export interface CreateRuntimeAuthorityServiceOptions {
  readonly agents: GovernedAgentStore;
  readonly runtimes: GovernedRuntimeStore;
  readonly grants: CapabilityGrantStore;
  readonly leases: LeaseStore;
  readonly evidence: RuntimeEvidenceLog;
  readonly signer: RuntimeAuthoritySigner;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
  readonly defaultLeaseTtlSeconds?: number;
}

export interface RuntimeAuthorityService {
  registerAgent(context: RuntimeAuthorityAccessContext, input: RegisterGovernedAgentInput, actorId: string): GovernedAgent;
  suspendAgent(context: RuntimeAuthorityAccessContext, tenantId: string, agentId: string, control: RuntimeControlRequest): GovernedAgent;
  revokeAgent(context: RuntimeAuthorityAccessContext, tenantId: string, agentId: string, control: RuntimeControlRequest): GovernedAgent;

  createRuntime(context: RuntimeAuthorityAccessContext, input: CreateGovernedRuntimeInput, actorId: string): GovernedRuntime;
  authorizeRuntime(context: RuntimeAuthorityAccessContext, runtimeId: string, actorId: string): GovernedRuntime;
  startRuntime(context: RuntimeAuthorityAccessContext, runtimeId: string, actorId: string): GovernedRuntime;

  grantCapability(context: RuntimeAuthorityAccessContext, input: GrantCapabilityInput): RuntimeCapabilityGrant;
  revokeCapability(context: RuntimeAuthorityAccessContext, runtimeId: string, capability: string, control: RuntimeControlRequest): readonly RuntimeCapabilityGrant[];

  issueLease(context: RuntimeAuthorityAccessContext, input: IssueLeaseInput): SignedAuthorityLease;
  renewLease(context: RuntimeAuthorityAccessContext, leaseId: string, issuedBy: string): SignedAuthorityLease;
  revokeLease(context: RuntimeAuthorityAccessContext, leaseId: string, control: RuntimeControlRequest): LeaseRecord;

  pause(context: RuntimeAuthorityAccessContext, runtimeId: string, control: RuntimeControlRequest): RuntimeControlOutcome;
  resume(context: RuntimeAuthorityAccessContext, runtimeId: string, control: RuntimeControlRequest, capabilities?: readonly string[]): ResumeOutcome;
  isolate(context: RuntimeAuthorityAccessContext, runtimeId: string, control: RuntimeControlRequest): RuntimeControlOutcome;
  quarantine(context: RuntimeAuthorityAccessContext, runtimeId: string, control: RuntimeControlRequest): QuarantineOutcome;
  terminate(context: RuntimeAuthorityAccessContext, runtimeId: string, control: RuntimeControlRequest): TerminateOutcome;

  getAgent(context: RuntimeAuthorityAccessContext, tenantId: string, agentId: string): GovernedAgent | undefined;
  getRuntime(context: RuntimeAuthorityAccessContext, runtimeId: string): GovernedRuntime | undefined;
  listCapabilities(context: RuntimeAuthorityAccessContext, runtimeId: string): readonly RuntimeCapabilityGrant[];
  listEvidence(context: RuntimeAuthorityAccessContext, runtimeId: string): readonly RuntimeEvidenceEvent[];
  verifyEvidence(context: RuntimeAuthorityAccessContext, runtimeId: string): RuntimeEvidenceChainVerificationResult;
}

export function createRuntimeAuthorityService(options: CreateRuntimeAuthorityServiceOptions): RuntimeAuthorityService {
  const { agents, runtimes, grants, leases, evidence, signer, now, nextId } = options;
  const defaultTtl = options.defaultLeaseTtlSeconds ?? DEFAULT_LEASE_TTL_SECONDS;

  function requireRuntime(runtimeId: string): GovernedRuntime {
    const runtime = runtimes.get(runtimeId);
    if (runtime === undefined) throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_RUNTIME_NOT_FOUND', `No GovernedRuntime '${runtimeId}'.`);
    return runtime;
  }

  function requireAgent(tenantId: string, agentId: string): GovernedAgent {
    const agent = agents.get(tenantId, agentId);
    if (agent === undefined) throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_AGENT_NOT_FOUND', `No GovernedAgent '${agentId}' in tenant '${tenantId}'.`);
    return agent;
  }

  function requireLease(leaseId: string): LeaseRecord {
    const lease = leases.get(leaseId);
    if (lease === undefined) throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_LEASE_NOT_FOUND', `No lease '${leaseId}'.`);
    return lease;
  }

  function revokeAllActiveLeases(runtimeId: string, actorId: string, reason: string, correlationId: string | undefined): readonly string[] {
    const active = leases.listActiveByRuntime(runtimeId);
    const ids: string[] = [];
    for (const lease of active) {
      lease.status = 'REVOKED';
      lease.revokedAt = now();
      lease.revokedBy = actorId;
      lease.revokedReason = reason;
      ids.push(lease.leaseId);
      evidence.append({
        tenantId: lease.payload.tenantId,
        runtimeId,
        agentId: lease.payload.agentId,
        eventType: 'LEASE_REVOKED',
        actorType: 'HUMAN',
        actorId,
        reason,
        leaseId: lease.leaseId,
        correlationId: correlationId ?? nextId('correlation'),
        payload: {},
      });
    }
    return ids;
  }

  function transitionRuntime(runtimeId: string, to: GovernedRuntimeState): GovernedRuntime {
    const current = requireRuntime(runtimeId);
    try {
      assertRuntimeTransition(runtimeId, current.state, to);
    } catch (error) {
      if (error instanceof RuntimeStateTransitionError) {
        throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_INVALID_STATE_TRANSITION', error.message, { from: error.from, to: error.to, runtimeId: error.runtimeId });
      }
      throw error;
    }
    return runtimes.update(runtimeId, (existing) => ({
      ...existing,
      state: to,
      updatedAt: now(),
      ...(to === 'TERMINATED' ? { terminatedAt: now() } : {}),
    }));
  }

  function recordControlAction(runtimeId: string, action: string, control: RuntimeControlRequest): GovernedRuntime {
    return runtimes.update(runtimeId, (existing) => ({
      ...existing,
      lastControlAction: { action, actorId: control.requestedBy, reason: control.reason, severity: control.severity, occurredAt: now() },
    }));
  }

  function issueLeaseInternal(input: IssueLeaseInput): SignedAuthorityLease {
    const runtime = requireRuntime(input.runtimeId);
    assertTenantAccess({ system: true, tenantId: input.tenantId }, runtime.tenantId);
    if (runtime.state !== 'RUNNING' && runtime.state !== 'AUTHORIZED') {
      throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_LEASE_ISSUANCE_DENIED', `Cannot issue a lease for runtime '${input.runtimeId}' in state '${runtime.state}'.`);
    }
    const agent = requireAgent(input.tenantId, input.agentId);
    if (agent.status !== 'ACTIVE') {
      throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_LEASE_ISSUANCE_DENIED', `Cannot issue a lease: agent '${input.agentId}' is ${agent.status}.`);
    }
    for (const capability of input.capabilities) {
      if (PROHIBITED_CAPABILITIES.includes(capability)) {
        throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_LEASE_ISSUANCE_DENIED', `Capability '${capability}' is unconditionally prohibited and can never be leased.`);
      }
      const activeGrants = grants.findActive(input.runtimeId, capability);
      if (activeGrants.length === 0) {
        throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_LEASE_ISSUANCE_DENIED', `No active RuntimeCapabilityGrant for '${capability}' on runtime '${input.runtimeId}'; a lease cannot exceed granted capabilities.`);
      }
    }

    const issuedAt = now();
    const ttlSeconds = input.ttlSeconds ?? defaultTtl;
    const expiresAt = new Date(Date.parse(issuedAt) + ttlSeconds * 1000).toISOString();
    const leaseId = nextId('lease');
    const payload: AuthorityLeasePayload = {
      leaseId,
      tenantId: input.tenantId,
      runtimeId: input.runtimeId,
      agentId: input.agentId,
      capabilities: [...input.capabilities],
      policyVersion: runtime.policyVersion,
      issuedAt,
      expiresAt,
      nonce: nextId('nonce'),
      keyId: signer.keyId,
    };
    const signedLease = signer.signLease(payload);
    const leaseDigest = computeDigest(signedLease);

    leases.put({ leaseId, payload, leaseDigest, status: 'ACTIVE', issuedBy: input.issuedBy, consumedNonces: new Set() });
    runtimes.update(input.runtimeId, (existing) => ({ ...existing, lastLeaseIssuedBy: input.issuedBy, updatedAt: now() }));

    evidence.append({
      tenantId: input.tenantId,
      runtimeId: input.runtimeId,
      agentId: input.agentId,
      eventType: 'LEASE_ISSUED',
      actorType: 'SYSTEM',
      actorId: input.issuedBy,
      capability: input.capabilities.join(','),
      policyVersion: runtime.policyVersion,
      leaseId,
      correlationId: nextId('correlation'),
      payload: { capabilities: input.capabilities, expiresAt, leaseDigest },
    });

    return signedLease;
  }

  return {
    registerAgent(context, input, actorId) {
      requireTenantScope({ system: context.system, tenantId: input.tenantId });
      if (agents.get(input.tenantId, input.agentId) !== undefined) {
        throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_AGENT_ALREADY_EXISTS', `GovernedAgent '${input.agentId}' already registered in tenant '${input.tenantId}'.`);
      }
      const timestamp = now();
      const agent: GovernedAgent = {
        agentId: input.agentId,
        tenantId: input.tenantId,
        displayName: input.displayName,
        agentType: input.agentType,
        ownerAuthorityId: input.ownerAuthorityId,
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(input.publicKey !== undefined ? { publicKey: input.publicKey } : {}),
        ...(input.passportId !== undefined ? { passportId: input.passportId } : {}),
      };
      agents.put(agent);
      evidence.append({
        tenantId: input.tenantId,
        runtimeId: agentEvidenceScope(input.agentId),
        agentId: input.agentId,
        eventType: 'AGENT_REGISTERED',
        actorType: 'HUMAN',
        actorId,
        correlationId: nextId('correlation'),
        payload: { agentType: input.agentType, ownerAuthorityId: input.ownerAuthorityId },
      });
      return agent;
    },

    suspendAgent(context, tenantId, agentId, control) {
      assertTenantAccess(context, tenantId);
      const updated = agents.update(tenantId, agentId, (current) => ({ ...current, status: 'SUSPENDED' as GovernedAgentStatus, suspendedReason: control.reason, updatedAt: now() }));
      evidence.append({
        tenantId,
        runtimeId: agentEvidenceScope(agentId),
        agentId,
        eventType: 'AGENT_SUSPENDED',
        actorType: 'HUMAN',
        actorId: control.requestedBy,
        reason: control.reason,
        correlationId: control.correlationId ?? nextId('correlation'),
        payload: { severity: control.severity },
      });
      return updated;
    },

    revokeAgent(context, tenantId, agentId, control) {
      assertTenantAccess(context, tenantId);
      const updated = agents.update(tenantId, agentId, (current) => ({ ...current, status: 'REVOKED' as GovernedAgentStatus, revokedReason: control.reason, updatedAt: now() }));
      evidence.append({
        tenantId,
        runtimeId: agentEvidenceScope(agentId),
        agentId,
        eventType: 'AGENT_REVOKED',
        actorType: 'HUMAN',
        actorId: control.requestedBy,
        reason: control.reason,
        correlationId: control.correlationId ?? nextId('correlation'),
        payload: { severity: control.severity },
      });
      return updated;
    },

    createRuntime(context, input, actorId) {
      requireTenantScope({ system: context.system, tenantId: input.tenantId });
      requireAgent(input.tenantId, input.agentId);
      const timestamp = now();
      const runtimeId = nextId('runtime');
      const runtime: GovernedRuntime = {
        runtimeId,
        tenantId: input.tenantId,
        agentId: input.agentId,
        environmentId: input.environmentId,
        state: 'CREATED',
        policyVersion: input.policyVersion,
        riskScore: input.riskScore ?? 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      runtimes.put(runtime);
      evidence.append({
        tenantId: input.tenantId,
        runtimeId,
        agentId: input.agentId,
        eventType: 'RUNTIME_CREATED',
        actorType: 'HUMAN',
        actorId,
        policyVersion: input.policyVersion,
        correlationId: nextId('correlation'),
        payload: { environmentId: input.environmentId },
      });
      return runtime;
    },

    authorizeRuntime(context, runtimeId, actorId) {
      const runtime = requireRuntime(runtimeId);
      assertTenantAccess(context, runtime.tenantId);
      const updated = transitionRuntime(runtimeId, 'AUTHORIZED');
      evidence.append({
        tenantId: runtime.tenantId,
        runtimeId,
        agentId: runtime.agentId,
        eventType: 'RUNTIME_AUTHORIZED',
        actorType: 'HUMAN',
        actorId,
        correlationId: nextId('correlation'),
        payload: {},
      });
      return updated;
    },

    startRuntime(context, runtimeId, actorId) {
      const runtime = requireRuntime(runtimeId);
      assertTenantAccess(context, runtime.tenantId);
      const updated = transitionRuntime(runtimeId, 'RUNNING');
      evidence.append({
        tenantId: runtime.tenantId,
        runtimeId,
        agentId: runtime.agentId,
        eventType: 'RUNTIME_STARTED',
        actorType: 'SYSTEM',
        actorId,
        correlationId: nextId('correlation'),
        payload: {},
      });
      return updated;
    },

    grantCapability(context, input) {
      const runtime = requireRuntime(input.runtimeId);
      assertTenantAccess(context, runtime.tenantId);
      const timestamp = now();
      const grant: RuntimeCapabilityGrant = {
        grantId: nextId('grant'),
        tenantId: input.tenantId,
        runtimeId: input.runtimeId,
        agentId: input.agentId,
        capability: input.capability,
        resourceScope: input.resourceScope ?? {},
        constraints: input.constraints ?? {},
        issuedBy: input.issuedBy,
        issuedAt: timestamp,
        status: 'ACTIVE',
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      };
      grants.put(grant);
      evidence.append({
        tenantId: input.tenantId,
        runtimeId: input.runtimeId,
        agentId: input.agentId,
        eventType: 'CAPABILITY_GRANTED',
        actorType: 'HUMAN',
        actorId: input.issuedBy,
        capability: input.capability,
        resource: input.resourceScope ?? {},
        correlationId: nextId('correlation'),
        payload: { grantId: grant.grantId, constraints: input.constraints ?? {} },
      });
      return grant;
    },

    revokeCapability(context, runtimeId, capability, control) {
      const runtime = requireRuntime(runtimeId);
      assertTenantAccess(context, runtime.tenantId);
      const active = grants.listByRuntime(runtimeId).filter((grant) => grant.capability === capability && grant.status === 'ACTIVE');
      const updated: RuntimeCapabilityGrant[] = [];
      for (const grant of active) {
        const next = grants.update(grant.grantId, (current) => ({ ...current, status: 'REVOKED' as CapabilityGrantStatus, revokedAt: now(), revokedBy: control.requestedBy, revokedReason: control.reason }));
        updated.push(next);
        evidence.append({
          tenantId: runtime.tenantId,
          runtimeId,
          agentId: runtime.agentId,
          eventType: 'CAPABILITY_REVOKED',
          actorType: 'HUMAN',
          actorId: control.requestedBy,
          capability,
          reason: control.reason,
          correlationId: control.correlationId ?? nextId('correlation'),
          payload: { grantId: grant.grantId, severity: control.severity },
        });
      }
      return updated;
    },

    issueLease(context, input) {
      assertTenantAccess(context, input.tenantId);
      return issueLeaseInternal(input);
    },

    renewLease(context, leaseId, issuedBy) {
      const current = requireLease(leaseId);
      assertTenantAccess(context, current.payload.tenantId);
      if (current.status !== 'ACTIVE') {
        throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_LEASE_ISSUANCE_DENIED', `Cannot renew lease '${leaseId}': status is '${current.status}', not ACTIVE.`);
      }
      const renewed = issueLeaseInternal({
        tenantId: current.payload.tenantId,
        runtimeId: current.payload.runtimeId,
        agentId: current.payload.agentId,
        capabilities: current.payload.capabilities,
        issuedBy,
      });
      // The old lease is immediately superseded -- never reactivatable, even
      // if the caller still holds a copy of it (mission section 3.4: "never
      // reactivate a previously revoked lease").
      current.status = 'SUPERSEDED';
      current.supersededBy = renewed.payload.leaseId;
      evidence.append({
        tenantId: current.payload.tenantId,
        runtimeId: current.payload.runtimeId,
        agentId: current.payload.agentId,
        eventType: 'LEASE_RENEWED',
        actorType: 'SYSTEM',
        actorId: issuedBy,
        leaseId: renewed.payload.leaseId,
        correlationId: nextId('correlation'),
        payload: { supersededLeaseId: leaseId },
      });
      return renewed;
    },

    revokeLease(context, leaseId, control) {
      const lease = requireLease(leaseId);
      assertTenantAccess(context, lease.payload.tenantId);
      lease.status = 'REVOKED';
      lease.revokedAt = now();
      lease.revokedBy = control.requestedBy;
      lease.revokedReason = control.reason;
      evidence.append({
        tenantId: lease.payload.tenantId,
        runtimeId: lease.payload.runtimeId,
        agentId: lease.payload.agentId,
        eventType: 'LEASE_REVOKED',
        actorType: 'HUMAN',
        actorId: control.requestedBy,
        reason: control.reason,
        leaseId,
        correlationId: control.correlationId ?? nextId('correlation'),
        payload: { severity: control.severity },
      });
      return lease;
    },

    pause(context, runtimeId, control) {
      const before = requireRuntime(runtimeId);
      assertTenantAccess(context, before.tenantId);
      const runtime = transitionRuntime(runtimeId, 'PAUSED');
      recordControlAction(runtimeId, 'pause', control);
      const revokedLeaseIds = revokeAllActiveLeases(runtimeId, control.requestedBy, control.reason, control.correlationId);
      const event = evidence.append({
        tenantId: runtime.tenantId,
        runtimeId,
        agentId: runtime.agentId,
        eventType: 'RUNTIME_PAUSED',
        actorType: 'HUMAN',
        actorId: control.requestedBy,
        reason: control.reason,
        correlationId: control.correlationId ?? nextId('correlation'),
        payload: { severity: control.severity, revokedLeaseIds },
      });
      return { runtime, revokedLeaseIds, evidenceEventId: event.eventId };
    },

    resume(context, runtimeId, control, capabilities) {
      const before = requireRuntime(runtimeId);
      assertTenantAccess(context, before.tenantId);
      const agent = requireAgent(before.tenantId, before.agentId);
      if (agent.status !== 'ACTIVE') {
        throw new RuntimeAuthorityError('RUNTIME_AUTHORITY_LEASE_ISSUANCE_DENIED', `Cannot resume runtime '${runtimeId}': agent '${before.agentId}' is ${agent.status}.`);
      }
      const runtime = transitionRuntime(runtimeId, 'RUNNING');
      recordControlAction(runtimeId, 'resume', control);
      const effectiveCapabilities = capabilities ?? [...new Set(grants.listByRuntime(runtimeId).filter((g) => g.status === 'ACTIVE').map((g) => g.capability))];
      const lease = issueLeaseInternal({ tenantId: runtime.tenantId, runtimeId, agentId: runtime.agentId, capabilities: effectiveCapabilities, issuedBy: control.requestedBy });
      const event = evidence.append({
        tenantId: runtime.tenantId,
        runtimeId,
        agentId: runtime.agentId,
        eventType: 'RUNTIME_RESUMED',
        actorType: 'HUMAN',
        actorId: control.requestedBy,
        reason: control.reason,
        leaseId: lease.payload.leaseId,
        correlationId: control.correlationId ?? nextId('correlation'),
        payload: { severity: control.severity },
      });
      return { runtime, revokedLeaseIds: [], lease, evidenceEventId: event.eventId };
    },

    isolate(context, runtimeId, control) {
      const before = requireRuntime(runtimeId);
      assertTenantAccess(context, before.tenantId);
      const runtime = transitionRuntime(runtimeId, 'ISOLATED');
      recordControlAction(runtimeId, 'isolate', control);
      const revokedLeaseIds = revokeAllActiveLeases(runtimeId, control.requestedBy, control.reason, control.correlationId);
      const event = evidence.append({
        tenantId: runtime.tenantId,
        runtimeId,
        agentId: runtime.agentId,
        eventType: 'RUNTIME_ISOLATED',
        actorType: 'HUMAN',
        actorId: control.requestedBy,
        reason: control.reason,
        correlationId: control.correlationId ?? nextId('correlation'),
        payload: { severity: control.severity, revokedLeaseIds, note: 'Outbound-connection severance is out of scope for this vertical slice; see ADR known limitations.' },
      });
      return { runtime, revokedLeaseIds, evidenceEventId: event.eventId };
    },

    quarantine(context, runtimeId, control) {
      const before = requireRuntime(runtimeId);
      assertTenantAccess(context, before.tenantId);
      const runtime = transitionRuntime(runtimeId, 'QUARANTINED');
      recordControlAction(runtimeId, 'quarantine', control);
      const revokedLeaseIds = revokeAllActiveLeases(runtimeId, control.requestedBy, control.reason, control.correlationId);
      const activeGrants = grants.listByRuntime(runtimeId).filter((g) => g.status === 'ACTIVE');
      const forensicSnapshot = {
        capturedAt: now(),
        runtime,
        agent: agents.get(runtime.tenantId, runtime.agentId),
        activeGrantsAtCapture: activeGrants,
        recentEvidence: evidence.list(runtimeId).slice(-50),
      };
      const event = evidence.append({
        tenantId: runtime.tenantId,
        runtimeId,
        agentId: runtime.agentId,
        eventType: 'RUNTIME_QUARANTINED',
        actorType: 'HUMAN',
        actorId: control.requestedBy,
        reason: control.reason,
        correlationId: control.correlationId ?? nextId('correlation'),
        payload: { severity: control.severity, revokedLeaseIds, forensicEventCount: forensicSnapshot.recentEvidence.length },
      });
      return { runtime, revokedLeaseIds, forensicSnapshot, evidenceEventId: event.eventId };
    },

    terminate(context, runtimeId, control) {
      const before = requireRuntime(runtimeId);
      assertTenantAccess(context, before.tenantId);
      const runtime = transitionRuntime(runtimeId, 'TERMINATED');
      recordControlAction(runtimeId, 'terminate', control);
      const revokedLeaseIds = revokeAllActiveLeases(runtimeId, control.requestedBy, control.reason, control.correlationId);
      const activeGrants = grants.listByRuntime(runtimeId).filter((g) => g.status === 'ACTIVE');
      const revokedGrantIds: string[] = [];
      for (const grant of activeGrants) {
        grants.update(grant.grantId, (current) => ({ ...current, status: 'REVOKED' as CapabilityGrantStatus, revokedAt: now(), revokedBy: control.requestedBy, revokedReason: 'Runtime terminated.' }));
        revokedGrantIds.push(grant.grantId);
      }
      const event = evidence.append({
        tenantId: runtime.tenantId,
        runtimeId,
        agentId: runtime.agentId,
        eventType: 'RUNTIME_TERMINATED',
        actorType: 'HUMAN',
        actorId: control.requestedBy,
        reason: control.reason,
        correlationId: control.correlationId ?? nextId('correlation'),
        payload: { severity: control.severity, revokedLeaseIds, revokedGrantIds, irreversible: true },
      });
      return { runtime, revokedLeaseIds, revokedGrantIds, evidenceEventId: event.eventId };
    },

    getAgent(context, tenantId, agentId) {
      assertTenantAccess(context, tenantId);
      return agents.get(tenantId, agentId);
    },
    getRuntime(context, runtimeId) {
      const runtime = runtimes.get(runtimeId);
      if (runtime !== undefined) assertTenantAccess(context, runtime.tenantId);
      return runtime;
    },
    listCapabilities(context, runtimeId) {
      const runtime = requireRuntime(runtimeId);
      assertTenantAccess(context, runtime.tenantId);
      return grants.listByRuntime(runtimeId);
    },
    listEvidence(context, runtimeId) {
      const runtime = runtimes.get(runtimeId);
      if (runtime !== undefined) assertTenantAccess(context, runtime.tenantId);
      return evidence.list(runtimeId);
    },
    verifyEvidence(context, runtimeId) {
      const runtime = runtimes.get(runtimeId);
      if (runtime !== undefined) assertTenantAccess(context, runtime.tenantId);
      return evidence.verify(runtimeId);
    },
  };
}
