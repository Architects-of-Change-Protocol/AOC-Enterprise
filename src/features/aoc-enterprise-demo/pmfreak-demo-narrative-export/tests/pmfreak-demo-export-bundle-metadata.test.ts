import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoNarrativeExport } from '../pmfreak-demo-narrative-builder.js';

let fixtures: PMFreakDemoControlPlaneFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('createPMFreakDemoNarrativeExportBundleMetadata', () => {
  it('24. is safe and complete', () => {
    const viewModel = fixtures.demoBillingReadinessAllowedView;
    const narrativeExport = createPMFreakDemoNarrativeExport(viewModel);
    const metadata = narrativeExport.exportBundleMetadata;

    assert.ok(metadata.includedSections.length > 0);
    assert.deepEqual([...metadata.includedPolicyPackIds], [...viewModel.policyReferencePanel.appliedPolicyPackIds]);
    assert.deepEqual([...metadata.includedJurisdictionPackIds], [...viewModel.policyReferencePanel.jurisdictionPackIds]);

    assert.equal(metadata.includesTrace, true);
    assert.equal(metadata.includesEvidenceSummary, true);
    assert.equal(metadata.includesApprovalSummary, true);
    assert.equal(metadata.includesSafeInterpretation, true);
    assert.equal(metadata.includesDisclaimers, true);

    assert.equal(metadata.demoOnly, true);
    assert.equal(metadata.productionExecution, false);
    assert.equal(metadata.generatedBy, 'aoc.demo.pmfreak.narrative_export.v1');

    const metadataText = JSON.stringify(metadata).toLowerCase();
    assert.ok(!metadataText.includes('legalvalidity'));
    assert.ok(!metadataText.includes('compliancecertified'));
    assert.ok(!metadataText.includes('invoicevaliditycertified'));
    assert.ok(!metadataText.includes('customeracceptancecertified'));
  });
});
