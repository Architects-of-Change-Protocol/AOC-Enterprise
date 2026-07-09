import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoNextStepsSection } from '../pmfreak-demo-next-steps.js';

let fixtures: PMFreakDemoControlPlaneFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('createPMFreakDemoNextStepsSection', () => {
  it('16. is decision-aware for require_evidence -- provide missing evidence, re-run scenario, never mentions issuing an invoice', () => {
    assert.equal(fixtures.demoBillingReadinessMissingEvidenceView.decisionBadge.decision, 'require_evidence');
    const section = createPMFreakDemoNextStepsSection(fixtures.demoBillingReadinessMissingEvidenceView);
    const text = section.bullets.join(' ').toLowerCase();

    assert.ok(text.includes('missing demo evidence'));
    assert.ok(text.includes('run the scenario again with updated evidence'));
    assert.ok(!text.includes('issue invoice'));
    assert.ok(!text.includes('issue the invoice'));
  });

  it('17. is decision-aware for require_billing_review -- provide missing billing review signal, never a legal-block claim', () => {
    assert.equal(fixtures.demoBillingReadinessMissingApprovalView.decisionBadge.decision, 'require_billing_review');
    const section = createPMFreakDemoNextStepsSection(fixtures.demoBillingReadinessMissingApprovalView);
    const text = section.bullets.join(' ').toLowerCase();

    assert.ok(text.includes('missing billing review approval signal'));
    assert.ok(text.includes('run the scenario again with updated approval inputs'));
    assert.ok(!text.includes('invoice legally blocked'));
    assert.ok(!text.includes('legally blocked'));
  });

  it('18. is decision-aware for deny -- review passport scope, do not proceed, never a legal-prohibition claim', () => {
    assert.equal(fixtures.demoScheduleApplyDeniedView.decisionBadge.decision, 'deny');
    const section = createPMFreakDemoNextStepsSection(fixtures.demoScheduleApplyDeniedView);
    const text = section.bullets.join(' ').toLowerCase();

    assert.ok(text.includes('passport scope'));
    assert.ok(text.includes('restricted actions'));
    assert.ok(text.includes('capability tokens'));
    assert.ok(text.includes('do not proceed'));
    assert.ok(!text.includes('legally prohibited'));
  });

  it('19. is decision-aware for allow -- use as demo explanation, not production execution evidence', () => {
    assert.equal(fixtures.demoBillingReadinessAllowedView.decisionBadge.decision, 'allow');
    const section = createPMFreakDemoNextStepsSection(fixtures.demoBillingReadinessAllowedView);
    const text = section.bullets.join(' ').toLowerCase();

    assert.ok(text.includes('use the export as a demo explanation'));
    assert.ok(text.includes('do not treat this export as production execution evidence'));
  });
});
