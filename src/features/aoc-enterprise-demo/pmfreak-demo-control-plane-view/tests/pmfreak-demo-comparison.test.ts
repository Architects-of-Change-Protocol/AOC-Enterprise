import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { demoBillingReadinessComparison } from '../pmfreak-demo-control-plane-fixtures.js';

describe('createPMFreakDemoControlPlaneComparison', () => {
  it('22. detects a changed decision between before and after', () => {
    const comparison = demoBillingReadinessComparison;

    assert.equal(comparison.changedDecision, true);
    assert.ok(['require_evidence', 'require_billing_review'].includes(comparison.before.decisionBadge.decision));
    assert.equal(comparison.after.decisionBadge.decision, 'allow');
  });

  it('23. lists resolved evidence ids -- present in after but missing in before', () => {
    const comparison = demoBillingReadinessComparison;

    assert.ok(comparison.resolvedEvidenceIds.includes('pmfreak.evidence.deliverable_evidence'));
    assert.ok(comparison.resolvedEvidenceIds.includes('pmfreak.evidence.customer_acceptance_record'));
    for (const evidenceId of comparison.resolvedEvidenceIds) {
      assert.ok(comparison.before.evidencePanel.missingEvidenceIds.includes(evidenceId));
      assert.ok(!comparison.after.evidencePanel.missingEvidenceIds.includes(evidenceId));
    }
  });

  it('24. lists resolved approval ids -- present in after but missing in before', () => {
    const comparison = demoBillingReadinessComparison;

    assert.ok(comparison.resolvedApprovalIds.includes('pmfreak.approval.pm_approval'));
    assert.ok(comparison.resolvedApprovalIds.includes('pmfreak.approval.billing_review'));
    for (const approvalId of comparison.resolvedApprovalIds) {
      assert.ok(comparison.before.approvalPanel.missingApprovalIds.includes(approvalId));
      assert.ok(!comparison.after.approvalPanel.missingApprovalIds.includes(approvalId));
    }
  });

  it('25. explanation is claim-safe -- no invoice, customer-acceptance-certification, or compliance claims', () => {
    const explanation = demoBillingReadinessComparison.explanation.toLowerCase();

    assert.ok(!explanation.includes('invoice became legally valid'));
    assert.ok(!explanation.includes('customer acceptance was certified'));
    assert.ok(!explanation.includes('compliance passed'));
    assert.ok(!explanation.includes('legally approved'));
    assert.ok(explanation.includes('does not certify'));
  });
});
