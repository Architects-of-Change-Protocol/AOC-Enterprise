import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoExecutiveSummarySection } from '../pmfreak-demo-executive-summary.js';

let fixtures: PMFreakDemoControlPlaneFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('createPMFreakDemoExecutiveSummarySection', () => {
  it('6. is safe -- mentions the attempted demo action and the returned decision, never invoice/acceptance/compliance claims', () => {
    const section = createPMFreakDemoExecutiveSummarySection(fixtures.demoBillingReadinessMissingEvidenceView);

    assert.equal(section.kind, 'executive_summary');
    const text = section.summary.toLowerCase();

    assert.ok(text.includes('agent') && text.includes('attempted'));
    assert.ok(text.includes('aoc') && text.includes('returned'));
    assert.ok(text.includes('require_evidence'));

    assert.ok(!text.includes('invoice invalid'));
    assert.ok(!text.includes('customer acceptance invalid'));
    assert.ok(!text.includes('project non-compliant'));
    assert.ok(!text.includes('non-compliant'));
  });

  it('is safe for the allowed decision as well', () => {
    const section = createPMFreakDemoExecutiveSummarySection(fixtures.demoBillingReadinessAllowedView);
    const text = section.summary.toLowerCase();

    assert.ok(text.includes('allow'));
    assert.ok(!text.includes('invoice invalid'));
    assert.ok(!text.includes('customer acceptance invalid'));
  });
});
