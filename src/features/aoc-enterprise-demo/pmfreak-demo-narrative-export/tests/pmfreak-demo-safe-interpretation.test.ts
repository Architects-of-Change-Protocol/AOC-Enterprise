import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoSafeInterpretationSection } from '../pmfreak-demo-safe-interpretation.js';

let fixtures: PMFreakDemoControlPlaneFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('createPMFreakDemoSafeInterpretationSection', () => {
  it('15. includes the required disclaimers, for every fixture decision', () => {
    for (const viewModel of [
      fixtures.demoBillingReadinessMissingEvidenceView,
      fixtures.demoBillingReadinessMissingApprovalView,
      fixtures.demoBillingReadinessAllowedView,
      fixtures.demoScheduleApplyDeniedView,
    ]) {
      const section = createPMFreakDemoSafeInterpretationSection(viewModel);
      const text = section.bullets.join(' ').toLowerCase();

      assert.ok(text.includes('does not certify invoice validity'));
      assert.ok(text.includes('does not certify customer acceptance'));
      assert.ok(text.includes('does not provide legal advice'));
      assert.ok(text.includes('does not certify compliance'));
      assert.ok(text.includes('does not indicate production execution'));
    }
  });

  it('gives decision-specific interpretations for allow, require_evidence, require_billing_review, and deny', () => {
    const allow = createPMFreakDemoSafeInterpretationSection(fixtures.demoBillingReadinessAllowedView);
    assert.ok(allow.summary.includes('`allow`'));
    assert.ok(allow.summary.toLowerCase().includes('allowed the governed demo action to proceed'));

    const requireEvidence = createPMFreakDemoSafeInterpretationSection(fixtures.demoBillingReadinessMissingEvidenceView);
    assert.equal(fixtures.demoBillingReadinessMissingEvidenceView.decisionBadge.decision, 'require_evidence');
    assert.ok(requireEvidence.summary.includes('`require_evidence`'));
    assert.ok(requireEvidence.summary.toLowerCase().includes('missing'));

    const requireBillingReview = createPMFreakDemoSafeInterpretationSection(fixtures.demoBillingReadinessMissingApprovalView);
    assert.equal(fixtures.demoBillingReadinessMissingApprovalView.decisionBadge.decision, 'require_billing_review');
    assert.ok(requireBillingReview.summary.includes('`require_billing_review`'));

    const deny = createPMFreakDemoSafeInterpretationSection(fixtures.demoScheduleApplyDeniedView);
    assert.equal(fixtures.demoScheduleApplyDeniedView.decisionBadge.decision, 'deny');
    assert.ok(deny.summary.includes('`deny`'));
  });
});
