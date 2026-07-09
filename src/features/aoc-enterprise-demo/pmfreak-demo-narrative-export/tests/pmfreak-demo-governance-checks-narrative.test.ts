import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoGovernanceChecksSection } from '../pmfreak-demo-governance-checks-narrative.js';

let fixtures: PMFreakDemoControlPlaneFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('createPMFreakDemoGovernanceChecksSection', () => {
  it('8. reflects allowedByRuntimeGuard, allowedByCapabilityToken, allowedByAuthorityScope, evidenceSatisfied, and approvalsSatisfied', () => {
    const viewModel = fixtures.demoBillingReadinessMissingEvidenceView;
    const section = createPMFreakDemoGovernanceChecksSection(viewModel);

    assert.equal(section.kind, 'governance_checks');
    const bulletText = section.bullets.join('\n');

    assert.ok(bulletText.includes(`Passport checked: ${viewModel.agentPassportCard.allowedByRuntimeGuard ? 'allowed' : 'not allowed'}`));
    assert.ok(bulletText.includes(`Capability checked: ${viewModel.agentPassportCard.allowedByCapabilityToken ? 'allowed' : 'not allowed'}`));
    assert.ok(bulletText.includes(`Authority scope checked: ${viewModel.agentPassportCard.allowedByAuthorityScope ? 'allowed' : 'not allowed'}`));
    assert.ok(bulletText.includes(`Evidence checked: ${viewModel.evidencePanel.evidenceSatisfied ? 'satisfied' : 'not satisfied'}`));
    assert.ok(bulletText.includes(`Approvals checked: ${viewModel.approvalPanel.approvalsSatisfied ? 'satisfied' : 'not satisfied'}`));
    assert.ok(bulletText.includes(viewModel.decisionBadge.decision));
  });

  it('never claims compliance or legal validity was checked', () => {
    const section = createPMFreakDemoGovernanceChecksSection(fixtures.demoBillingReadinessAllowedView);
    const text = section.bullets.join('\n').toLowerCase();

    assert.ok(!text.includes('compliance checked'));
    assert.ok(!text.includes('legal validity checked'));
    assert.ok(!text.includes('invoice validity checked'));
  });
});
