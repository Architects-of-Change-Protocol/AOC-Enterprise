import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPmfreakScenario, PMFREAK_EXPLICITLY_PROHIBITED_CAPABILITIES } from '../pmfreak/scenario.js';
import { runScheduleHealthAnalysis, attemptNextProtectedAction } from '../pmfreak/schedule-health-agent.js';
import { PmfreakAccessDeniedError } from '../pmfreak/pmfreak-resource.js';

/**
 * The mission's primary MVP acceptance test (section 8 + the "ultimate
 * acceptance test" in section 13):
 *
 *   Given a governed PMFreak agent with an active runtime and lease,
 *   when an authorized external authority pauses the runtime,
 *   then every subsequent protected action is denied before reaching the
 *   target system, even when the agent continues attempting execution,
 *   and complete tamper-evident evidence is produced.
 *
 * Every assertion below observes state from OUTSIDE the agent's own driver
 * function (`scenario.service`, `scenario.resource.recommendationCount()`,
 * the evidence chain) -- this proves the denial is enforced by the Gateway
 * and the Resource, not merely that the agent "voluntarily stopped."
 */
describe('PMFreak Schedule Health Agent vertical slice (mission section 8 acceptance flow)', () => {
  it('runs the complete governed flow: register -> runtime -> grants -> lease -> run -> pause -> deny -> resume -> new lease', () => {
    const scenario = buildPmfreakScenario();

    // Steps 1-4: agent registered, runtime created+authorized+started, four capabilities granted, lease issued.
    assert.equal(scenario.service.getAgent(scenario.context, scenario.tenantId, scenario.agentId)?.status, 'ACTIVE');
    assert.equal(scenario.runtime.state, 'RUNNING');
    assert.equal(scenario.service.listCapabilities(scenario.context, scenario.runtimeId).length, 4);
    assert.ok(scenario.lease.payload.leaseId.length > 0);
    assert.equal(scenario.lease.payload.capabilities.length, 4);

    // Steps 5-6: the multi-step schedule analysis runs entirely through the Gateway.
    const firstRun = runScheduleHealthAnalysis(scenario.agentDeps(), scenario.lease);
    assert.equal(firstRun.completed, true);
    assert.equal(firstRun.steps.length, 4);
    for (const step of firstRun.steps) {
      assert.equal(step.decision.decision, 'ALLOW', `capability '${step.capability}' should have been allowed`);
      assert.equal(step.executed, true);
    }
    assert.equal(scenario.resource.recommendationCount(), 1);

    // Step 7: the runtime is observably RUNNING (what a dashboard would show).
    assert.equal(scenario.service.getRuntime(scenario.context, scenario.runtimeId)?.state, 'RUNNING');

    // Step 8: an authorized human pauses the runtime.
    const pauseOutcome = scenario.service.pause(scenario.context, scenario.runtimeId, {
      reason: 'Suspicious anomaly flagged by monitoring.',
      requestedBy: 'human-operator-bob',
      severity: 'high',
      correlationId: 'incident-42',
    });
    assert.equal(pauseOutcome.runtime.state, 'PAUSED');

    // Step 9: active leases were revoked as part of pause.
    assert.deepEqual(pauseOutcome.revokedLeaseIds, [scenario.lease.payload.leaseId]);

    // Steps 10-12: the agent attempts its next protected action with the SAME lease it already held -- it does not "know" it was paused and keeps trying, exactly like the mission's acceptance criterion.
    const recommendationsBeforeDenial = scenario.resource.recommendationCount();
    const deniedAttempt = attemptNextProtectedAction(scenario.agentDeps(), scenario.lease, 'recommendation.create');
    assert.equal(deniedAttempt.decision.decision, 'DENY');
    assert.equal(deniedAttempt.executed, false);
    assert.ok(['RUNTIME_PAUSED', 'LEASE_REVOKED'].includes(deniedAttempt.decision.code ?? ''), `expected a runtime-paused/lease-revoked denial, got '${deniedAttempt.decision.code}'`);
    // The target PMFreak system received NO side effect from the denied action.
    assert.equal(scenario.resource.recommendationCount(), recommendationsBeforeDenial);

    // Even repeated retries with the stale lease keep failing -- "the agent continues attempting execution" and it never succeeds.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const retry = attemptNextProtectedAction(scenario.agentDeps(), scenario.lease, 'schedule.read');
      assert.equal(retry.decision.decision, 'DENY');
      assert.equal(retry.executed, false);
    }

    // Step 13: complete tamper-evident evidence exists for the request, the denial, the revocation, the actor, the reason, the policy version, and a correlation chain.
    const events = scenario.service.listEvidence(scenario.context, scenario.runtimeId);
    const pausedEvent = events.find((e) => e.eventType === 'RUNTIME_PAUSED');
    assert.ok(pausedEvent, 'expected a RUNTIME_PAUSED evidence event');
    assert.equal(pausedEvent?.actorId, 'human-operator-bob');
    assert.equal(pausedEvent?.reason, 'Suspicious anomaly flagged by monitoring.');
    assert.equal(pausedEvent?.correlationId, 'incident-42');

    const leaseRevokedEvent = events.find((e) => e.eventType === 'LEASE_REVOKED' && e.leaseId === scenario.lease.payload.leaseId);
    assert.ok(leaseRevokedEvent, 'expected a LEASE_REVOKED evidence event for the paused lease');

    const deniedEvents = events.filter((e) => e.eventType === 'ACTION_DENIED');
    assert.ok(deniedEvents.length >= 1, 'expected at least one ACTION_DENIED evidence event');
    assert.equal(deniedEvents[0]?.policyVersion, undefined); // denials before the policy check never reach it -- absence itself is evidence of exactly which check failed
    assert.equal(deniedEvents[0]?.decision, 'DENY');

    const requestedEvents = events.filter((e) => e.eventType === 'ACTION_REQUESTED');
    assert.ok(requestedEvents.length >= firstRun.steps.length + 1, 'every attempted action, allowed or denied, must be recorded');

    const verification = scenario.service.verifyEvidence(scenario.context, scenario.runtimeId);
    assert.equal(verification.valid, true);

    // Step 14: an authorized human resumes the runtime.
    const resumeOutcome = scenario.service.resume(scenario.context, scenario.runtimeId, {
      reason: 'Anomaly investigated and cleared.',
      requestedBy: 'human-operator-bob',
      severity: 'medium',
      correlationId: 'incident-42-resolution',
    });
    assert.equal(resumeOutcome.runtime.state, 'RUNNING');

    // Steps 15-16: policy was reevaluated and a brand-new lease was issued.
    assert.notEqual(resumeOutcome.lease.payload.leaseId, scenario.lease.payload.leaseId);
    assert.ok(Date.parse(resumeOutcome.lease.payload.expiresAt) > Date.parse(resumeOutcome.lease.payload.issuedAt));

    // Step 17: the agent resumes work from a safe checkpoint using the new lease.
    const secondRun = runScheduleHealthAnalysis(scenario.agentDeps(), resumeOutcome.lease);
    assert.equal(secondRun.completed, true);
    assert.equal(scenario.resource.recommendationCount(), 2);

    // Step 18: the previous, paused-and-revoked lease remains permanently unusable, even now that the runtime is RUNNING again.
    const staleLeaseAttempt = attemptNextProtectedAction(scenario.agentDeps(), scenario.lease, 'project.read');
    assert.equal(staleLeaseAttempt.decision.decision, 'DENY');
    assert.equal(staleLeaseAttempt.decision.code, 'LEASE_REVOKED');
  });

  it('a forged ALLOW decision is rejected by the resource boundary (direct-bypass demonstration)', () => {
    const scenario = buildPmfreakScenario();
    const forgedDecision = {
      decision: 'ALLOW' as const,
      reason: 'forged',
      correlationId: 'forged-correlation',
      evidenceEventId: 'evidence-does-not-exist',
      checkedAt: new Date().toISOString(),
    };
    assert.throws(
      () => scenario.resource.readProject({ runtimeId: scenario.runtimeId, capability: 'project.read', resource: { projectId: scenario.projectId }, decision: forgedDecision }),
      PmfreakAccessDeniedError,
    );
    assert.equal(scenario.resource.recommendationCount(), 0);
  });

  it('explicitly prohibited capabilities can never be granted a usable lease', () => {
    const scenario = buildPmfreakScenario();
    for (const capability of PMFREAK_EXPLICITLY_PROHIBITED_CAPABILITIES.slice(0, 3)) {
      assert.throws(() =>
        scenario.service.issueLease(scenario.context, {
          tenantId: scenario.tenantId,
          runtimeId: scenario.runtimeId,
          agentId: scenario.agentId,
          capabilities: [capability],
          issuedBy: 'human-operator-alice',
        }),
      );
    }
  });

  it('terminate is irreversible: a terminated runtime cannot resume and rejects every subsequent action', () => {
    const scenario = buildPmfreakScenario();
    scenario.service.terminate(scenario.context, scenario.runtimeId, { reason: 'Decommissioned.', requestedBy: 'human-operator-bob', severity: 'critical' });

    assert.throws(() => scenario.service.resume(scenario.context, scenario.runtimeId, { reason: 'attempt to resurrect', requestedBy: 'human-operator-bob', severity: 'high' }));

    const attempt = attemptNextProtectedAction(scenario.agentDeps(), scenario.lease, 'project.read');
    assert.equal(attempt.decision.decision, 'DENY');
    assert.equal(attempt.decision.code, 'RUNTIME_TERMINATED');
  });
});
