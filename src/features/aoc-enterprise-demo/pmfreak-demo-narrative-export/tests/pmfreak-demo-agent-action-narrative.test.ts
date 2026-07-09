import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoAgentActionSection } from '../pmfreak-demo-agent-action-narrative.js';

let fixtures: PMFreakDemoControlPlaneFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('createPMFreakDemoAgentActionSection', () => {
  it('7. bullets include agent id, passport id, action id, and project id', () => {
    const viewModel = fixtures.demoBillingReadinessMissingEvidenceView;
    const section = createPMFreakDemoAgentActionSection(viewModel);

    assert.equal(section.kind, 'agent_action');
    const bulletText = section.bullets.join('\n');

    assert.ok(bulletText.includes(viewModel.agentPassportCard.agentId));
    assert.ok(bulletText.includes(viewModel.agentPassportCard.passportId));
    assert.ok(bulletText.includes(viewModel.attemptedActionCard.actionId));
    assert.ok(bulletText.includes(viewModel.attemptedActionCard.projectId));
  });

  it('does not claim legal authorization, full trust, or production authorization', () => {
    const section = createPMFreakDemoAgentActionSection(fixtures.demoBillingReadinessAllowedView);
    const text = section.summary.toLowerCase();

    assert.ok(!text.includes('legally authorized'));
    assert.ok(!text.includes('fully trusted'));
    assert.ok(!text.includes('production authorized'));
  });
});
