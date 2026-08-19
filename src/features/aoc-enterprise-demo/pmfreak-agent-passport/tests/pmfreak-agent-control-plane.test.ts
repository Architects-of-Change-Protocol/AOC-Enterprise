import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePMFreakAgentPassportAction } from '../pmfreak-passport-resolver.js';
import { createPMFreakAgentPassportControlPlaneSummary, PMFREAK_CONTROL_PLANE_SAFE_LABELS } from '../pmfreak-control-plane-summary.js';
import { buildPMFreakActionAttemptFixture, buildPMFreakAgentPassportRegistryFixture } from '../pmfreak-agent-passport-fixtures.js';
import { assertNoPolicyPackOverclaim } from '../../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';

const UNSAFE_LABELS = ['Fully trusted agent', 'Autonomous approval granted', 'Certified enterprise compliant', 'Risk-free execution', 'Legally approved', 'Compliance passed'];

function buildBillingMarkReadyResolution() {
  const registry = buildPMFreakAgentPassportRegistryFixture();
  return resolvePMFreakAgentPassportAction(
    buildPMFreakActionAttemptFixture({
      actionAttemptId: 'attempt-control-plane-summary',
      agentId: 'pmfreak.agent.billing_readiness',
      passportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
      actionId: 'pmfreak.action.billing.mark_ready',
      projectPhase: 'billing',
      evidenceIds: ['pmfreak.evidence.deliverable_evidence'],
      approvalIds: ['pmfreak.approval.pm_approval'],
    }),
    registry,
  );
}

describe('PMFreak Agent Passport Control Plane summary', () => {
  it('32. the Control Plane summary is safe and includes every required safe label', () => {
    const resolution = buildBillingMarkReadyResolution();
    const summary = createPMFreakAgentPassportControlPlaneSummary(resolution);

    for (const label of PMFREAK_CONTROL_PLANE_SAFE_LABELS) assert.ok(summary.safeDisplayLabels.includes(label), `expected safe label "${label}"`);
    assert.ok(summary.safeDisplayLabels.includes('PMFreak agent passport'));
    assert.ok(summary.safeDisplayLabels.includes('Soberanía-governed agent'));
    assert.ok(summary.safeDisplayLabels.includes('Not production integration'));

    for (const label of UNSAFE_LABELS) assert.ok(!summary.safeDisplayLabels.includes(label), `must not include "${label}"`);

    assertNoPolicyPackOverclaim(summary);
  });

  it('carries the agent, passport, and decision fields through from the resolution', () => {
    const resolution = buildBillingMarkReadyResolution();
    const summary = createPMFreakAgentPassportControlPlaneSummary(resolution);

    assert.equal(summary.agentId, resolution.agentId);
    assert.equal(summary.passportId, resolution.passportId);
    assert.equal(summary.role, 'billing_readiness_agent');
    assert.equal(summary.decision, resolution.decision);
    assert.deepEqual(summary.missingEvidenceIds, resolution.missingEvidenceIds);
    assert.deepEqual(summary.missingApprovalIds, resolution.missingApprovalIds);
  });
});
