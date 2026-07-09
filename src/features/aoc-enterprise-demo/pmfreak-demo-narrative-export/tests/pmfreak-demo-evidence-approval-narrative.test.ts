import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoEvidenceNarrativeSection } from '../pmfreak-demo-evidence-narrative.js';
import { createPMFreakDemoApprovalNarrativeSection } from '../pmfreak-demo-approval-narrative.js';

let fixtures: PMFreakDemoControlPlaneFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('createPMFreakDemoEvidenceNarrativeSection', () => {
  it('9. lists required/provided/missing evidence ids exactly as the Control Plane evidence panel reports them', () => {
    const viewModel = fixtures.demoBillingReadinessMissingEvidenceView;
    const section = createPMFreakDemoEvidenceNarrativeSection(viewModel);
    const bulletText = section.bullets.join('\n');

    for (const id of viewModel.evidencePanel.requiredEvidenceIds) assert.ok(bulletText.includes(id));
    for (const id of viewModel.evidencePanel.providedEvidenceIds) assert.ok(bulletText.includes(id));
    for (const id of viewModel.evidencePanel.missingEvidenceIds) assert.ok(bulletText.includes(id));
  });

  it('10. uses safe missing-evidence language, never customer-acceptance/invoice/contract claims', () => {
    const section = createPMFreakDemoEvidenceNarrativeSection(fixtures.demoBillingReadinessMissingEvidenceView);
    const text = `${section.summary} ${section.bullets.join(' ')}`.toLowerCase();

    assert.ok(text.includes('missing') && text.includes('demo evidence'));
    assert.ok(!text.includes('customer acceptance is invalid'));
    assert.ok(!text.includes('invoice cannot be issued'));
    assert.ok(!text.includes('contract violation detected'));
  });
});

describe('createPMFreakDemoApprovalNarrativeSection', () => {
  it('11. lists required/provided/missing approval ids exactly as the Control Plane approval panel reports them', () => {
    const viewModel = fixtures.demoBillingReadinessMissingApprovalView;
    const section = createPMFreakDemoApprovalNarrativeSection(viewModel);
    const bulletText = section.bullets.join('\n');

    for (const id of viewModel.approvalPanel.requiredApprovalIds) assert.ok(bulletText.includes(id));
    for (const id of viewModel.approvalPanel.providedApprovalIds) assert.ok(bulletText.includes(id));
    for (const id of viewModel.approvalPanel.missingApprovalIds) assert.ok(bulletText.includes(id));
  });

  it('12. uses safe missing-approval language, never a legal-requirement or legal-block claim', () => {
    const section = createPMFreakDemoApprovalNarrativeSection(fixtures.demoBillingReadinessMissingApprovalView);
    const text = `${section.summary} ${section.bullets.join(' ')}`.toLowerCase();

    assert.ok(text.includes('missing') && text.includes('approval'));
    assert.ok(!text.includes('approval is legally required'));
    assert.ok(!text.includes('invoice is legally blocked'));
  });
});
