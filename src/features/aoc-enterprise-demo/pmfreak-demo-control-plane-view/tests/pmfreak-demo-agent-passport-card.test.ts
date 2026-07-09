import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { PMFreakAgentPassportResolution, PMFreakAgentPassportStatus } from '../../pmfreak-agent-passport/index.js';
import { createPMFreakDemoAgentPassportCard } from '../pmfreak-demo-agent-passport-card.js';

function buildResolution(passportStatus: PMFreakAgentPassportStatus, overrides?: Partial<PMFreakAgentPassportResolution>): PMFreakAgentPassportResolution {
  return {
    actionAttemptId: 'attempt.demo.1',
    agentId: 'pmfreak.agent.billing_readiness',
    passportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
    actionId: 'pmfreak.action.billing.mark_ready',
    role: 'billing_readiness_agent',
    passportStatus,
    decision: passportStatus === 'active' ? 'allow' : passportStatus === 'suspended' ? 'hold' : 'deny',
    allowedByPassport: passportStatus === 'active',
    allowedByCapability: passportStatus === 'active',
    allowedByAuthorityScope: passportStatus === 'active',
    evidenceSatisfied: true,
    approvalsSatisfied: true,
    missingEvidenceIds: [],
    missingApprovalIds: [],
    requiredEvidenceIds: [],
    requiredApprovalIds: [],
    appliedPolicyPackIds: ['aoc.demo.pmfreak.agent_passport.v1'],
    jurisdictionPackIds: [],
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe('createPMFreakDemoAgentPassportCard', () => {
  it('8. reflects an active passport as success', () => {
    const card = createPMFreakDemoAgentPassportCard(buildResolution('active'));

    assert.equal(card.passportStatus, 'active');
    assert.equal(card.statusSeverity, 'success');
    assert.equal(card.allowedByPassport, true);
  });

  it('9. reflects a revoked passport as danger', () => {
    const card = createPMFreakDemoAgentPassportCard(buildResolution('revoked'));

    assert.equal(card.passportStatus, 'revoked');
    assert.equal(card.statusSeverity, 'danger');
  });

  it('10. reflects a suspended passport as warning', () => {
    const card = createPMFreakDemoAgentPassportCard(buildResolution('suspended'));

    assert.equal(card.passportStatus, 'suspended');
    assert.equal(card.statusSeverity, 'warning');
  });

  it('reflects an expired passport as danger', () => {
    const card = createPMFreakDemoAgentPassportCard(buildResolution('expired'));

    assert.equal(card.statusSeverity, 'danger');
  });

  it('never claims full trust, certification, or production authorization', () => {
    const card = createPMFreakDemoAgentPassportCard(buildResolution('active'));
    const text = JSON.stringify(card).toLowerCase();

    assert.ok(!text.includes('fully trusted'));
    assert.ok(!text.includes('certified'));
    assert.ok(!text.includes('production authorized'));
    assert.ok(card.notes.includes('AOC-governed agent'));
  });
});
