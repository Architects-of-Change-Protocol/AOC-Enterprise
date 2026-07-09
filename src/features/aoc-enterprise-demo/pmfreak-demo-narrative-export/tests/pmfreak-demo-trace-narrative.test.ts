import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoTraceNarrativeSection } from '../pmfreak-demo-trace-narrative.js';

let fixtures: PMFreakDemoControlPlaneFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('createPMFreakDemoTraceNarrativeSection', () => {
  it('13. preserves the Control Plane trace timeline order with no invented steps', () => {
    const viewModel = fixtures.demoBillingReadinessAllowedView;
    const section = createPMFreakDemoTraceNarrativeSection(viewModel);

    assert.deepEqual(
      section.bullets,
      viewModel.traceTimeline.steps.map((step) => `${step.order}. ${step.label} (${step.status}): ${step.detail}`),
    );
  });
});
