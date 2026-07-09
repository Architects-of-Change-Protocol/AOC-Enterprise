import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoPolicyReferenceNarrativeSection } from '../pmfreak-demo-policy-reference-narrative.js';

let fixtures: PMFreakDemoControlPlaneFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('createPMFreakDemoPolicyReferenceNarrativeSection', () => {
  it('14. safely preserves the Costa Rica jurisdiction pack reference as context, never as a compliance claim', () => {
    const viewModel = fixtures.demoBillingReadinessAllowedView;
    assert.ok(viewModel.policyReferencePanel.jurisdictionPackIds.includes('aoc.jurisdiction.costa_rica.base.v1'));

    const section = createPMFreakDemoPolicyReferenceNarrativeSection(viewModel);
    const text = `${section.summary} ${section.bullets.join(' ')}`;

    assert.ok(text.includes('aoc.jurisdiction.costa_rica.base.v1'));
    assert.ok(text.toLowerCase().includes('costa rica jurisdiction context referenced'));
    assert.ok(!text.toLowerCase().includes('costa rica compliant'));
    assert.ok(!text.toLowerCase().includes('cr compliant'));
  });
});
