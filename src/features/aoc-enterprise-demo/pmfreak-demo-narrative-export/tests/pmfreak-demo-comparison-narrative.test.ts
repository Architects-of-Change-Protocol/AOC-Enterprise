import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneComparison } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoNarrativeComparisonExport } from '../pmfreak-demo-comparison-narrative.js';

let comparison: PMFreakDemoControlPlaneComparison;

before(async () => {
  ({ demoBillingReadinessComparison: comparison } = await buildPMFreakDemoControlPlaneFixtures());
});

describe('createPMFreakDemoNarrativeComparisonExport', () => {
  it('25. detects a changed decision between before and after', () => {
    const comparisonExport = createPMFreakDemoNarrativeComparisonExport(comparison);

    assert.equal(comparisonExport.changedDecision, true);
    assert.ok(['require_evidence', 'require_billing_review'].includes(comparisonExport.beforeExport.decision));
    assert.equal(comparisonExport.afterExport.decision, 'allow');
  });

  it('26. lists resolved evidence ids preserved from the Control Plane comparison', () => {
    const comparisonExport = createPMFreakDemoNarrativeComparisonExport(comparison);
    assert.deepEqual([...comparisonExport.resolvedEvidenceIds], [...comparison.resolvedEvidenceIds]);
  });

  it('27. lists resolved approval ids preserved from the Control Plane comparison', () => {
    const comparisonExport = createPMFreakDemoNarrativeComparisonExport(comparison);
    assert.deepEqual([...comparisonExport.resolvedApprovalIds], [...comparison.resolvedApprovalIds]);
  });

  it('28. explanation is safe -- no invoice-legally-valid, customer-acceptance-certified, or project-compliant claims', () => {
    const comparisonExport = createPMFreakDemoNarrativeComparisonExport(comparison);
    const explanation = comparisonExport.explanation.toLowerCase();

    assert.equal(comparisonExport.explanation, comparison.explanation);
    assert.ok(!explanation.includes('invoice became legally valid'));
    assert.ok(!explanation.includes('customer acceptance was certified'));
    assert.ok(!explanation.includes('project became compliant'));
    assert.ok(explanation.includes('does not certify'));
  });

  it('32. does not mutate the Control Plane comparison it is built from', () => {
    const before = JSON.stringify(comparison);

    createPMFreakDemoNarrativeComparisonExport(comparison);

    const after = JSON.stringify(comparison);
    assert.equal(before, after);
  });
});
