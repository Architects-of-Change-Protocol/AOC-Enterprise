import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { billingReadinessCheckReadinessScenario } from '../../pmfreak-project-governance-scenarios/index.js';
import { buildPMFreakDemoControlPlaneFixtures } from '../pmfreak-demo-control-plane-fixtures.js';
import type { PMFreakDemoControlPlaneComparison } from '../pmfreak-demo-control-plane-view-types.js';

let comparison: PMFreakDemoControlPlaneComparison;

before(async () => {
  ({ demoBillingReadinessComparison: comparison } = await buildPMFreakDemoControlPlaneFixtures());
});

const [DELIVERABLE_EVIDENCE_ID, CUSTOMER_ACCEPTANCE_EVIDENCE_ID] = billingReadinessCheckReadinessScenario.baselineEvidenceIds;
const [PM_APPROVAL_ID, BILLING_REVIEW_ID] = billingReadinessCheckReadinessScenario.baselineApprovalIds;

describe('createPMFreakDemoControlPlaneComparison', () => {
  it('22. detects a changed decision between before and after', () => {
    assert.equal(comparison.changedDecision, true);
    // Verified directly against the real resolver: with both evidence and approvals missing,
    // require_billing_review wins (it outranks require_evidence/require_pm_approval in the
    // decision priority order), not require_evidence.
    assert.equal(comparison.before.decisionBadge.decision, 'require_billing_review');
    assert.equal(comparison.after.decisionBadge.decision, 'allow');
  });

  it('23. lists resolved evidence ids -- present in after but missing in before', () => {
    assert.ok(comparison.resolvedEvidenceIds.includes(DELIVERABLE_EVIDENCE_ID!));
    assert.ok(comparison.resolvedEvidenceIds.includes(CUSTOMER_ACCEPTANCE_EVIDENCE_ID!));
    for (const evidenceId of comparison.resolvedEvidenceIds) {
      assert.ok(comparison.before.evidencePanel.missingEvidenceIds.includes(evidenceId));
      assert.ok(!comparison.after.evidencePanel.missingEvidenceIds.includes(evidenceId));
    }
  });

  it('24. lists resolved approval ids -- present in after but missing in before', () => {
    assert.ok(comparison.resolvedApprovalIds.includes(PM_APPROVAL_ID!));
    assert.ok(comparison.resolvedApprovalIds.includes(BILLING_REVIEW_ID!));
    for (const approvalId of comparison.resolvedApprovalIds) {
      assert.ok(comparison.before.approvalPanel.missingApprovalIds.includes(approvalId));
      assert.ok(!comparison.after.approvalPanel.missingApprovalIds.includes(approvalId));
    }
  });

  it('25. explanation is claim-safe -- no invoice, customer-acceptance-certification, or compliance claims', () => {
    const explanation = comparison.explanation.toLowerCase();

    assert.ok(!explanation.includes('invoice became legally valid'));
    assert.ok(!explanation.includes('customer acceptance was certified'));
    assert.ok(!explanation.includes('compliance passed'));
    assert.ok(!explanation.includes('legally approved'));
    assert.ok(explanation.includes('does not certify'));
  });
});
