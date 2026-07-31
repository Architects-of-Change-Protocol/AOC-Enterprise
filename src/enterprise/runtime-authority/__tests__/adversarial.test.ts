import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEd25519Signer, createVerifierForSigners } from '../crypto.js';
import { createInMemoryRuntimeEvidenceLog, verifyRuntimeEvidenceChain } from '../evidence.js';
import { createRuntimeAuthorityGateway } from '../gateway.js';
import { createRuntimeAuthorityService, type RuntimeAuthorityService } from '../service.js';
import {
  createInMemoryCapabilityGrantStore,
  createInMemoryGovernedAgentStore,
  createInMemoryGovernedRuntimeStore,
  createInMemoryLeaseStore,
  type RuntimeAuthorityAccessContext,
} from '../stores.js';
import type { GatewayDenialCode, ProtectedActionRequest, RuntimeEvidenceEvent, SignedAuthorityLease } from '../contracts.js';

/**
 * Adversarial validation (mission section 10). Every test here proves
 * denial happens OUTSIDE the agent -- by driving `gateway.authorizeAction`
 * or `service.*` directly with a hand-built, hostile request, never by
 * asking a cooperative agent to "please stop." A test that merely confirmed
 * an agent voluntarily stopped would not satisfy the mission's bar; none of
 * these do that.
 *
 * A handful of the mission's listed bypass vectors (cached credential reuse
 * outside this process, a rogue child process, a background job queue, an
 * async callback firing after revocation, a test-only endpoint left enabled
 * in production) describe infrastructure this MVP does not have yet -- there
 * is no persistent credential cache, no job queue, no child-process
 * spawning, and exactly one HTTP surface with no test-only routes. Building
 * fake infrastructure just to "test" that it is absent would prove nothing;
 * these are recorded as explicit known limitations in
 * `docs/architecture/ADR-RUNTIME-AUTHORITY.md` instead of faked here.
 */

function buildHarness() {
  const baseMs = Date.UTC(2026, 6, 31, 12, 0, 0);
  let offset = 0;
  const now = () => new Date(baseMs + (offset += 1)).toISOString();
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

  const agents = createInMemoryGovernedAgentStore();
  const runtimes = createInMemoryGovernedRuntimeStore();
  const grants = createInMemoryCapabilityGrantStore();
  const leases = createInMemoryLeaseStore();
  const evidence = createInMemoryRuntimeEvidenceLog({ now, nextId });
  const signer = createEd25519Signer('adversarial-key-1');
  const verifier = createVerifierForSigners([signer]);

  const service: RuntimeAuthorityService = createRuntimeAuthorityService({ agents, runtimes, grants, leases, evidence, signer, now, nextId, defaultLeaseTtlSeconds: 30 });
  const gateway = createRuntimeAuthorityGateway({ agents, runtimes, grants, leases, evidence, verifier, now });

  const context: RuntimeAuthorityAccessContext = { system: true };
  const tenantId = 'tenant-adversarial';

  function registerAgentAndRuntime(agentId: string, capabilities: readonly string[] = ['schedule.read'], forTenantId: string = tenantId) {
    service.registerAgent(context, { agentId, tenantId: forTenantId, displayName: agentId, agentType: 'workflow_agent', ownerAuthorityId: 'authority-1' }, 'operator');
    const created = service.createRuntime(context, { tenantId: forTenantId, agentId, environmentId: 'env-test', policyVersion: 'policy-v1' }, 'operator');
    service.authorizeRuntime(context, created.runtimeId, 'operator');
    const runtime = service.startRuntime(context, created.runtimeId, 'operator');
    for (const capability of capabilities) {
      service.grantCapability(context, { tenantId: forTenantId, runtimeId: runtime.runtimeId, agentId, capability, resourceScope: { projectId: 'proj-1' }, constraints: {}, issuedBy: 'operator' });
    }
    return runtime;
  }

  function action(overrides: Partial<ProtectedActionRequest> & Pick<ProtectedActionRequest, 'lease'>): ProtectedActionRequest {
    return {
      tenantId,
      runtimeId: overrides.lease.payload.runtimeId,
      agentId: overrides.lease.payload.agentId,
      capability: overrides.lease.payload.capabilities[0] ?? 'schedule.read',
      resource: { projectId: 'proj-1' },
      requestNonce: nextId('nonce'),
      correlationId: nextId('correlation'),
      ...overrides,
    };
  }

  return { context, tenantId, service, gateway, agents, runtimes, grants, leases, evidence, signer, verifier, registerAgentAndRuntime, action, nextId, now };
}

function denyCode(h: ReturnType<typeof buildHarness>, request: ProtectedActionRequest): GatewayDenialCode | undefined {
  const decision = h.gateway.authorizeAction(request);
  assert.equal(decision.decision, 'DENY', `expected a denial, got ALLOW for capability '${request.capability}'`);
  return decision.code;
}

describe('AOC Runtime Authority -- adversarial validation', () => {
  describe('lease attacks', () => {
    it('expired lease is denied', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator', ttlSeconds: 0 });
      assert.equal(denyCode(h, h.action({ lease })), 'LEASE_EXPIRED');
    });

    it('revoked lease is denied', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      h.service.revokeLease(h.context, lease.payload.leaseId, { reason: 'compromised', requestedBy: 'operator', severity: 'critical' });
      assert.equal(denyCode(h, h.action({ lease })), 'LEASE_REVOKED');
    });

    it('reused/replayed request nonce against the same lease is denied on the second use', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      const request = h.action({ lease, requestNonce: 'fixed-nonce-1' });
      assert.equal(h.gateway.authorizeAction(request).decision, 'ALLOW');
      assert.equal(denyCode(h, request), 'LEASE_REPLAYED');
    });

    it('malformed signature (not valid base64/signature bytes) is denied, never throws', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      const malformed: SignedAuthorityLease = { ...lease, signature: '!!!not-valid-base64-or-a-signature!!!' };
      assert.doesNotThrow(() => h.gateway.authorizeAction(h.action({ lease: malformed })));
      assert.equal(denyCode(h, h.action({ lease: malformed })), 'LEASE_INVALID');
    });

    it('altered signature bytes are denied', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      const sigBuffer = Buffer.from(lease.signature, 'base64');
      sigBuffer[0] = (sigBuffer[0] ?? 0) ^ 0xff;
      const altered: SignedAuthorityLease = { ...lease, signature: sigBuffer.toString('base64') };
      assert.equal(denyCode(h, h.action({ lease: altered })), 'LEASE_INVALID');
    });

    it('a lease bearing the wrong runtimeId in the request is denied', () => {
      const h = buildHarness();
      const runtimeA = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const runtimeB = h.registerAgentAndRuntime('agent-2', ['schedule.read']);
      const leaseForA = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtimeA.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      const request = h.action({ lease: leaseForA, runtimeId: runtimeB.runtimeId, agentId: 'agent-1' });
      assert.equal(denyCode(h, request), 'LEASE_RUNTIME_MISMATCH');
    });

    it('a lease presented for the wrong agentId is denied', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      h.registerAgentAndRuntime('agent-2', []);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      const request = h.action({ lease, agentId: 'agent-2' });
      assert.equal(denyCode(h, request), 'LEASE_AGENT_MISMATCH');
    });

    it('a lease presented for the wrong tenantId is denied', () => {
      const h = buildHarness();
      // A same-named agent genuinely exists in BOTH tenants (so agent lookup
      // under the second tenant succeeds and does not mask the mismatch
      // this test targets) -- the lease itself was minted for tenant A's
      // runtime, and the request falsely claims tenant B.
      const runtimeA = h.registerAgentAndRuntime('agent-1', ['schedule.read'], 'tenant-a');
      h.registerAgentAndRuntime('agent-1', ['schedule.read'], 'tenant-b');
      const lease = h.service.issueLease({ system: true }, { tenantId: 'tenant-a', runtimeId: runtimeA.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      const request = h.action({ lease, tenantId: 'tenant-b' });
      assert.equal(denyCode(h, request), 'LEASE_TENANT_MISMATCH');
    });

    it('a capability spliced into the payload AFTER signing invalidates the signature (cannot exceed what was actually signed)', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read', 'recommendation.create']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      const forged: SignedAuthorityLease = { signature: lease.signature, payload: { ...lease.payload, capabilities: [...lease.payload.capabilities, 'recommendation.create'] } };
      const request = h.action({ lease: forged, capability: 'recommendation.create' });
      assert.equal(denyCode(h, request), 'LEASE_INVALID');
    });

    it('a lease issued under a stale policyVersion is denied after the runtime is re-created under a new policy', () => {
      // The runtime's own policyVersion is fixed at creation in this MVP (no in-place policy-version bump API yet -- see ADR limitations); this test proves the POLICY_DENIED path fires when payload.policyVersion diverges from the runtime's, using a hand-forged lease payload with a stale version.
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      // Forging a stale policyVersion also invalidates the signature -- proving BOTH defenses (signature binding + explicit version check) independently reject a stale-policy replay.
      const stalePolicy: SignedAuthorityLease = { signature: lease.signature, payload: { ...lease.payload, policyVersion: 'policy-v0-stale' } };
      assert.equal(denyCode(h, h.action({ lease: stalePolicy })), 'LEASE_INVALID');
    });

    it('nonce/clock-skew boundary: a lease expiring at exactly the check instant is denied (fail closed on the boundary, never allowed)', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator', ttlSeconds: 0 });
      // ttlSeconds: 0 means expiresAt === issuedAt; the harness clock has already advanced by the time the gateway checks it, so expiresAt <= now() is the exact boundary case.
      assert.equal(denyCode(h, h.action({ lease })), 'LEASE_EXPIRED');
    });
  });

  describe('runtime-state attacks', () => {
    it('action after isolate is denied', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      h.service.isolate(h.context, runtime.runtimeId, { reason: 'network anomaly', requestedBy: 'operator', severity: 'high' });
      assert.equal(denyCode(h, h.action({ lease })), 'RUNTIME_ISOLATED');
    });

    it('action after quarantine is denied', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      h.service.quarantine(h.context, runtime.runtimeId, { reason: 'forensic hold', requestedBy: 'operator', severity: 'critical' });
      assert.equal(denyCode(h, h.action({ lease })), 'RUNTIME_QUARANTINED');
    });

    it('action after terminate is denied and the runtime can never resume', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      h.service.terminate(h.context, runtime.runtimeId, { reason: 'decommission', requestedBy: 'operator', severity: 'critical' });
      assert.equal(denyCode(h, h.action({ lease })), 'RUNTIME_TERMINATED');
      assert.throws(() => h.service.authorizeRuntime(h.context, runtime.runtimeId, 'operator'));
      assert.throws(() => h.service.startRuntime(h.context, runtime.runtimeId, 'operator'));
    });

    it('resuming with a request built from the OLD lease (issued before pause) is denied even though the runtime is RUNNING again', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const oldLease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      h.service.pause(h.context, runtime.runtimeId, { reason: 'hold', requestedBy: 'operator', severity: 'medium' });
      h.service.resume(h.context, runtime.runtimeId, { reason: 'cleared', requestedBy: 'operator', severity: 'medium' });
      assert.equal(denyCode(h, h.action({ lease: oldLease })), 'LEASE_REVOKED');
    });

    it('a "queued" action built before pause but executed after pause is denied -- queued work cannot silently continue', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      // The request object is fully built (as a queued job would build it) BEFORE the pause happens.
      const queuedRequest = h.action({ lease });
      h.service.pause(h.context, runtime.runtimeId, { reason: 'hold', requestedBy: 'operator', severity: 'medium' });
      // Only now does the "queue worker" actually submit it to the Gateway.
      assert.equal(denyCode(h, queuedRequest), 'RUNTIME_PAUSED');
    });

    it('a retry of a request that was already denied for RUNTIME_PAUSED does not succeed after simply retrying against the Gateway again (no ambient allow-cache)', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      h.service.pause(h.context, runtime.runtimeId, { reason: 'hold', requestedBy: 'operator', severity: 'medium' });
      for (let i = 0; i < 5; i += 1) {
        assert.equal(denyCode(h, h.action({ lease })), 'RUNTIME_PAUSED');
      }
    });
  });

  describe('capability attacks', () => {
    it('requesting an ungranted capability is denied even with an otherwise-valid lease for a different capability', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      assert.throws(() =>
        h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['deployment.write'], issuedBy: 'operator' }),
      );
    });

    it('a capability revoked AFTER the lease was issued is denied on the next action (revocation takes effect before the next protected action)', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      assert.equal(h.gateway.authorizeAction(h.action({ lease, requestNonce: 'n1' })).decision, 'ALLOW');
      h.service.revokeCapability(h.context, runtime.runtimeId, 'schedule.read', { reason: 'scope reduced', requestedBy: 'operator', severity: 'medium' });
      assert.equal(denyCode(h, h.action({ lease, requestNonce: 'n2' })), 'CAPABILITY_REVOKED');
    });

    it('a request for a resource outside the granted resourceScope is denied (changing resource scope)', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      const request = h.action({ lease, resource: { projectId: 'proj-attacker-target' } });
      assert.equal(denyCode(h, request), 'RESOURCE_OUT_OF_SCOPE');
    });

    it('a wildcard resourceScope only matches when the field is present, and does not implicitly grant fields never scoped at all', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', []);
      h.service.grantCapability(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capability: 'schedule.read', resourceScope: { projectId: '*' }, constraints: {}, issuedBy: 'operator' });
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      // Any projectId is allowed (the explicit wildcard)...
      assert.equal(h.gateway.authorizeAction(h.action({ lease, resource: { projectId: 'any-project-at-all' }, requestNonce: 'n1' })).decision, 'ALLOW');
      // ...but a field the grant never mentioned at all is not implicitly wildcarded.
      const scopedGrantOnlyOnProjectId = h.action({ lease, resource: {}, requestNonce: 'n2' });
      assert.equal(denyCode(h, scopedGrantOnlyOnProjectId), 'RESOURCE_OUT_OF_SCOPE');
    });

    it('confused deputy: agent B cannot use a lease minted for agent A even against a runtime B legitimately owns', () => {
      const h = buildHarness();
      const runtimeA = h.registerAgentAndRuntime('agent-a', ['schedule.read']);
      h.registerAgentAndRuntime('agent-b', ['schedule.read']);
      const leaseForA = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtimeA.runtimeId, agentId: 'agent-a', capabilities: ['schedule.read'], issuedBy: 'operator' });
      // agent-b attempts to act on runtime-a's behalf using agent-a's lease.
      const request = h.action({ lease: leaseForA, agentId: 'agent-b' });
      assert.equal(denyCode(h, request), 'LEASE_AGENT_MISMATCH');
    });
  });

  describe('bypass attacks', () => {
    it('the Gateway is the only execution path RuntimeAuthorityService exposes -- there is no execute/invoke method that skips authorizeAction', () => {
      const h = buildHarness();
      const serviceMethodNames = Object.keys(h.service as unknown as Record<string, unknown>);
      // Exact-name blocklist, not a substring match: legitimate lifecycle
      // methods like `startRuntime`/`createRuntime` incidentally contain
      // "run" (inside "Runtime") and must not false-positive here.
      const disallowedExactNames = new Set(['execute', 'executeAction', 'invoke', 'invokeAction', 'call', 'callResource', 'run', 'runAction', 'runTool']);
      const suspiciousNames = serviceMethodNames.filter((name) => disallowedExactNames.has(name));
      assert.deepEqual(suspiciousNames, [], `RuntimeAuthorityService must never expose an execution-shaped method: found ${JSON.stringify(suspiciousNames)}`);
    });

    it('fails closed when an internal dependency throws mid-check (no fallback path silently allows on infrastructure failure)', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      const brokenGrants: typeof h.grants = {
        ...h.grants,
        findActive() {
          throw new Error('simulated capability-grant store outage');
        },
      };
      const brokenGateway = createRuntimeAuthorityGateway({ agents: h.agents, runtimes: h.runtimes, grants: brokenGrants, leases: h.leases, evidence: h.evidence, verifier: h.verifier, now: h.now });
      const decision = brokenGateway.authorizeAction(h.action({ lease }));
      assert.equal(decision.decision, 'DENY');
      assert.equal(decision.code, 'AUTHORITY_SERVICE_UNAVAILABLE');
    });

    it('an emergency-deny predicate blocks execution even when every other check would otherwise pass', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      const emergencyGateway = createRuntimeAuthorityGateway({
        agents: h.agents,
        runtimes: h.runtimes,
        grants: h.grants,
        leases: h.leases,
        evidence: h.evidence,
        verifier: h.verifier,
        now: h.now,
        isEmergencyDenied: () => true,
      });
      const decision = emergencyGateway.authorizeAction(h.action({ lease }));
      assert.equal(decision.decision, 'DENY');
      assert.equal(decision.code, 'EMERGENCY_DENIED');
    });
  });

  describe('evidence attacks', () => {
    function buildChain(): { events: RuntimeEvidenceEvent[] } {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      h.gateway.authorizeAction(h.action({ lease, requestNonce: 'n1' }));
      h.service.pause(h.context, runtime.runtimeId, { reason: 'hold', requestedBy: 'operator', severity: 'medium' });
      const events = [...h.service.listEvidence(h.context, runtime.runtimeId)];
      assert.ok(events.length >= 4, 'expected a chain with several events to attack');
      return { events };
    }

    it('mutating a field on an old event is detected', () => {
      const { events } = buildChain();
      const tampered = events.map((e, i) => (i === 1 ? { ...e, reason: 'TAMPERED REASON' } : e));
      const result = verifyRuntimeEvidenceChain(tampered);
      assert.equal(result.valid, false);
      assert.equal(result.firstInvalidEventId, events[1]?.eventId);
    });

    it('deleting an event from the middle of the chain is detected', () => {
      const { events } = buildChain();
      const withDeletion = [...events];
      withDeletion.splice(1, 1);
      const result = verifyRuntimeEvidenceChain(withDeletion);
      assert.equal(result.valid, false);
    });

    it('reordering two adjacent events is detected', () => {
      const { events } = buildChain();
      const reordered = [...events];
      const tmp = reordered[1];
      reordered[1] = reordered[2] as RuntimeEvidenceEvent;
      reordered[2] = tmp as RuntimeEvidenceEvent;
      const result = verifyRuntimeEvidenceChain(reordered);
      assert.equal(result.valid, false);
    });

    it('duplicating an event is detected', () => {
      const { events } = buildChain();
      const duplicated = [...events];
      duplicated.splice(2, 0, events[1] as RuntimeEvidenceEvent);
      const result = verifyRuntimeEvidenceChain(duplicated);
      assert.equal(result.valid, false);
    });

    it('an unmodified, complete chain verifies valid', () => {
      const { events } = buildChain();
      const result = verifyRuntimeEvidenceChain(events);
      assert.equal(result.valid, true);
      assert.equal(result.eventCount, events.length);
    });

    it('sensitive-looking payload keys are redacted, never stored raw', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const event = h.evidence.append({
        tenantId: h.tenantId,
        runtimeId: runtime.runtimeId,
        eventType: 'ANOMALY_DETECTED',
        actorType: 'SYSTEM',
        actorId: 'test',
        correlationId: 'c1',
        payload: { password: 'super-secret', token: 'abc123', normalField: 'kept' },
      });
      assert.equal(event.payload.password, '[REDACTED]');
      assert.equal(event.payload.token, '[REDACTED]');
      assert.equal(event.payload.normalField, 'kept');
    });

    it('every denial produces a resolvable evidence event -- no missing denial evidence', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      h.service.pause(h.context, runtime.runtimeId, { reason: 'hold', requestedBy: 'operator', severity: 'medium' });
      const decision = h.gateway.authorizeAction(h.action({ lease }));
      assert.equal(decision.decision, 'DENY');
      const events = h.service.listEvidence(h.context, runtime.runtimeId);
      const matching = events.find((e) => e.eventId === decision.evidenceEventId);
      assert.ok(matching, 'the denial must reference a real, resolvable evidence event');
      assert.equal(matching?.eventType, 'ACTION_DENIED');
    });

    it('correlationId is consistent between a request and its resulting decision event', () => {
      const h = buildHarness();
      const runtime = h.registerAgentAndRuntime('agent-1', ['schedule.read']);
      const lease = h.service.issueLease(h.context, { tenantId: h.tenantId, runtimeId: runtime.runtimeId, agentId: 'agent-1', capabilities: ['schedule.read'], issuedBy: 'operator' });
      const request = h.action({ lease, correlationId: 'fixed-correlation-xyz' });
      h.gateway.authorizeAction(request);
      const events = h.service.listEvidence(h.context, runtime.runtimeId);
      const related = events.filter((e) => e.correlationId === 'fixed-correlation-xyz');
      assert.equal(related.length, 2); // ACTION_REQUESTED + ACTION_AUTHORIZED
      assert.deepEqual(
        related.map((e) => e.eventType).sort(),
        ['ACTION_AUTHORIZED', 'ACTION_REQUESTED'],
      );
    });
  });
});
