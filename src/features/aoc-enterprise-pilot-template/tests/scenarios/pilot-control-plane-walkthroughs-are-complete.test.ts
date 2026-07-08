import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_BUILT_IN_PILOT_TEMPLATES } from '../../pilots/index.js';

describe('Pilot Control Plane walkthroughs are complete', () => {
  it('1. each pilot has overview section', () => {
    for (const template of ALL_BUILT_IN_PILOT_TEMPLATES) {
      assert.ok(template.controlPlaneWalkthrough.sections.some((s) => s.section === 'overview'), `${template.id} missing overview section`);
    }
  });

  it('2. each pilot has enforcement section', () => {
    for (const template of ALL_BUILT_IN_PILOT_TEMPLATES) {
      assert.ok(template.controlPlaneWalkthrough.sections.some((s) => s.section === 'enforcement'), `${template.id} missing enforcement section`);
    }
  });

  it('3. each policy-aware pilot has policy_packs section', () => {
    for (const template of ALL_BUILT_IN_PILOT_TEMPLATES) {
      if (template.policyModel.policyPackIds.length > 0) {
        assert.ok(template.controlPlaneWalkthrough.sections.some((s) => s.section === 'policy_packs'), `${template.id} missing policy_packs section`);
      }
    }
  });

  it('4. each evidence-aware pilot has evidence section', () => {
    for (const template of ALL_BUILT_IN_PILOT_TEMPLATES) {
      if (template.evidenceModel.evidenceScenarios.length > 0) {
        assert.ok(template.controlPlaneWalkthrough.sections.some((s) => s.section === 'evidence'), `${template.id} missing evidence section`);
      }
    }
  });

  it('5. each export-aware pilot has export_packages or proofs/audit section', () => {
    for (const template of ALL_BUILT_IN_PILOT_TEMPLATES) {
      if (template.exportPackages.length > 0) {
        const hasSection = template.controlPlaneWalkthrough.sections.some((s) => s.section === 'export_packages' || s.section === 'proofs_audit');
        assert.ok(hasSection, `${template.id} missing export_packages/proofs_audit section`);
      }
    }
  });

  it('6. each walkthrough has operator script', () => {
    for (const template of ALL_BUILT_IN_PILOT_TEMPLATES) {
      assert.ok(template.controlPlaneWalkthrough.operatorScript.length > 0, `${template.id} missing operator script`);
    }
  });
});
