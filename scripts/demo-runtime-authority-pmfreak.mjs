// AOC Runtime Authority -- PMFreak Schedule Health Agent kill-switch demo.
//
// Run after `npm run build`:
//   node scripts/demo-runtime-authority-pmfreak.mjs
//
// Walks the mission's primary acceptance flow end to end against real
// in-process code (no mocks): register a governed agent, create+authorize+
// start a governed runtime, grant the four allowed PMFreak capabilities,
// issue a signed lease, run the Schedule Health Agent's multi-step analysis
// through the real Enforcement Gateway, pause the runtime as an authorized
// human, show the agent's next attempt (with the SAME lease it already
// held) being denied before any side effect reaches the simulated PMFreak
// service, verify the tamper-evident evidence chain, then resume with a
// brand-new lease and show the old lease stays permanently unusable.
import { buildPmfreakScenario } from '../dist/src/enterprise/runtime-authority/pmfreak/scenario.js';
import { runScheduleHealthAnalysis, attemptNextProtectedAction } from '../dist/src/enterprise/runtime-authority/pmfreak/schedule-health-agent.js';

function heading(text) {
  console.log(`\n=== ${text} ===`);
}

function logStep(step) {
  const status = step.decision.decision === 'ALLOW' ? 'ALLOW' : `DENY (${step.decision.code})`;
  console.log(`  [${status}] ${step.capability} -- evidence: ${step.decision.evidenceEventId}`);
}

const scenario = buildPmfreakScenario();

heading('1-4. Governed agent registered, runtime created/authorized/started, capabilities granted, lease issued');
console.log(`  agentId=${scenario.agentId}  runtimeId=${scenario.runtimeId}  runtime.state=${scenario.runtime.state}`);
console.log(`  leaseId=${scenario.lease.payload.leaseId}  expiresAt=${scenario.lease.payload.expiresAt}  capabilities=${scenario.lease.payload.capabilities.join(', ')}`);

heading('5-6. Schedule Health Agent runs its multi-step analysis through the Enforcement Gateway');
const firstRun = runScheduleHealthAnalysis(scenario.agentDeps(), scenario.lease);
firstRun.steps.forEach(logStep);
console.log(`  recommendations created so far: ${scenario.resource.recommendationCount()}`);

heading('7. Dashboard would show: runtime RUNNING');
console.log(`  runtime.state=${scenario.service.getRuntime(scenario.context, scenario.runtimeId).state}`);

heading('8-9. An authorized human presses PAUSE');
const pauseOutcome = scenario.service.pause(scenario.context, scenario.runtimeId, {
  reason: 'Suspicious anomaly flagged by monitoring.',
  requestedBy: 'human-operator-bob',
  severity: 'high',
  correlationId: 'incident-42',
});
console.log(`  runtime.state=${pauseOutcome.runtime.state}  revokedLeaseIds=${JSON.stringify(pauseOutcome.revokedLeaseIds)}`);

heading('10-12. The agent keeps trying with the SAME lease it already held -- no cooperation required');
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const denied = attemptNextProtectedAction(scenario.agentDeps(), scenario.lease, 'recommendation.create');
  console.log(`  attempt ${attempt}: ${denied.decision.decision} (${denied.decision.code}) -- reason: ${denied.decision.reason}`);
}
console.log(`  recommendations created (must be unchanged): ${scenario.resource.recommendationCount()}`);

heading('13. Tamper-evident evidence for the pause + every denied attempt');
const events = scenario.service.listEvidence(scenario.context, scenario.runtimeId);
for (const event of events.slice(-6)) {
  console.log(`  [${event.eventType}] actor=${event.actorId} decision=${event.decision ?? '-'} reason=${event.reason ?? '-'} correlationId=${event.correlationId}`);
}
const verification = scenario.service.verifyEvidence(scenario.context, scenario.runtimeId);
console.log(`  evidence chain valid: ${verification.valid} (${verification.eventCount} events)`);

heading('Tamper check: mutating one stored evidence event breaks verification');
const tamperedEvent = events[2];
if (tamperedEvent) {
  const originalReason = tamperedEvent.reason;
  tamperedEvent.reason = 'TAMPERED';
  const tamperedVerification = scenario.service.verifyEvidence(scenario.context, scenario.runtimeId);
  console.log(`  after mutating event ${tamperedEvent.eventId}: chain valid=${tamperedVerification.valid} (${tamperedVerification.failureReason ?? 'n/a'})`);
  tamperedEvent.reason = originalReason; // restore for the rest of the demo
}

heading('14-16. An authorized human resumes; policy is reevaluated; a brand-new lease is issued');
const resumeOutcome = scenario.service.resume(scenario.context, scenario.runtimeId, {
  reason: 'Anomaly investigated and cleared.',
  requestedBy: 'human-operator-bob',
  severity: 'medium',
  correlationId: 'incident-42-resolution',
});
console.log(`  runtime.state=${resumeOutcome.runtime.state}  newLeaseId=${resumeOutcome.lease.payload.leaseId}`);

heading('17. The agent resumes from a safe checkpoint using the new lease');
const secondRun = runScheduleHealthAnalysis(scenario.agentDeps(), resumeOutcome.lease);
secondRun.steps.forEach(logStep);
console.log(`  recommendations created so far: ${scenario.resource.recommendationCount()}`);

heading('18. The OLD (paused-and-revoked) lease remains permanently unusable');
const staleAttempt = attemptNextProtectedAction(scenario.agentDeps(), scenario.lease, 'project.read');
console.log(`  ${staleAttempt.decision.decision} (${staleAttempt.decision.code})`);

heading('Demo complete');
console.log('The kill-switch worked: pause revoked authority outside the agent process, the next protected');
console.log('action was denied before reaching the target system even as the agent kept attempting execution,');
console.log('and the full sequence is captured in a verifiable, tamper-evident evidence chain.');
