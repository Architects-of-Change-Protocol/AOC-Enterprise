import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoNarrativeExport } from '../pmfreak-demo-narrative-builder.js';

let controlPlaneFixtures: PMFreakDemoControlPlaneFixtures;

before(async () => {
  controlPlaneFixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('createPMFreakDemoNarrativeExport', () => {
  it('2. builds a narrative export from the missing-evidence view -- decision, sections, and safe missing-evidence language', () => {
    const narrativeExport = createPMFreakDemoNarrativeExport(controlPlaneFixtures.demoBillingReadinessMissingEvidenceView);

    assert.equal(narrativeExport.decision, 'require_evidence');

    const kinds = narrativeExport.sections.map((section) => section.kind);
    assert.ok(kinds.includes('executive_summary'));
    assert.ok(kinds.includes('evidence'));
    assert.ok(kinds.includes('safe_interpretation'));

    const evidenceSection = narrativeExport.sections.find((section) => section.kind === 'evidence');
    assert.ok(evidenceSection !== undefined);
    assert.ok(evidenceSection!.summary.toLowerCase().includes('missing'));
  });

  it('3. builds a narrative export from the missing-approval view -- decision and safe approval language', () => {
    const narrativeExport = createPMFreakDemoNarrativeExport(controlPlaneFixtures.demoBillingReadinessMissingApprovalView);

    assert.equal(narrativeExport.decision, 'require_billing_review');

    const approvalSection = narrativeExport.sections.find((section) => section.kind === 'approvals');
    assert.ok(approvalSection !== undefined);
    assert.ok(!approvalSection!.summary.toLowerCase().includes('legally'));
    assert.ok(!approvalSection!.summary.toLowerCase().includes('legal block'));
  });

  it('4. builds a narrative export from the allowed view -- decision and safe allow interpretation', () => {
    const narrativeExport = createPMFreakDemoNarrativeExport(controlPlaneFixtures.demoBillingReadinessAllowedView);

    assert.equal(narrativeExport.decision, 'allow');

    const safeInterpretationSection = narrativeExport.sections.find((section) => section.kind === 'safe_interpretation');
    assert.ok(safeInterpretationSection !== undefined);
    assert.ok(safeInterpretationSection!.summary.toLowerCase().includes('allow'));

    const fullText = JSON.stringify(narrativeExport).toLowerCase();
    assert.ok(!fullText.includes('invoice validity certified'));
    assert.ok(!fullText.includes('customer acceptance certified'));
  });

  it('5. export id is deterministic -- stable across repeated builds, no random uuid', () => {
    const first = createPMFreakDemoNarrativeExport(controlPlaneFixtures.demoBillingReadinessAllowedView);
    const second = createPMFreakDemoNarrativeExport(controlPlaneFixtures.demoBillingReadinessAllowedView);

    assert.equal(first.exportId, second.exportId);
    assert.ok(first.exportId.startsWith('aoc.export.demo.pmfreak.narrative.'));
    assert.ok(first.exportId.includes(controlPlaneFixtures.demoBillingReadinessAllowedView.scenarioId.replace(/\./g, '_')));

    const uuidLike = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    assert.ok(!uuidLike.test(first.exportId));
  });

  it('31. does not mutate the Control Plane view model it is built from', () => {
    const viewModel = controlPlaneFixtures.demoBillingReadinessAllowedView;
    const before = JSON.stringify(viewModel);

    createPMFreakDemoNarrativeExport(viewModel);

    const after = JSON.stringify(viewModel);
    assert.equal(before, after);
  });
});
