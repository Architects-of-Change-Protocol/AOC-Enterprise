import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPMFreakDemoNarrativeExportDescriptor } from '../pmfreak-demo-narrative-export-descriptor.js';
import { PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_ID } from '../pmfreak-demo-narrative-export-constants.js';

describe('createPMFreakDemoNarrativeExportDescriptor', () => {
  it('1. creates a narrative export descriptor with the required identity and safety fields', () => {
    const descriptor = createPMFreakDemoNarrativeExportDescriptor();

    assert.equal(descriptor.exportPackId, 'aoc.demo.pmfreak.narrative_export.v1');
    assert.equal(descriptor.exportPackId, PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_ID);
    assert.equal(descriptor.sourceViewId, 'aoc.demo.pmfreak.control_plane_view.v1');
    assert.equal(descriptor.version, 'v1');
    assert.equal(descriptor.demoOnly, true);
    assert.equal(descriptor.productionIntegration, false);
    assert.ok(descriptor.purpose.length > 0);
    assert.ok(descriptor.safeLabels.length > 0);
    assert.ok(descriptor.disclaimers.length > 0);
  });

  it('does not name a certification-implying export id', () => {
    const descriptor = createPMFreakDemoNarrativeExportDescriptor();

    for (const forbidden of ['certified_audit_export', 'legal_evidence_package', 'invoice_validity_report', 'compliance_report']) {
      assert.ok(!descriptor.exportPackId.toLowerCase().includes(forbidden.replace(/_/g, ' ')));
      assert.ok(!descriptor.exportPackName.toLowerCase().includes(forbidden.replace(/_/g, ' ')));
    }
  });
});
