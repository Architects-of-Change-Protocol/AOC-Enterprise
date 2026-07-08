import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildControlPlaneDemoFixture } from '../../aoc-control-plane/fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../../aoc-control-plane/services/control-plane-read-model-service.js';
import type { AocControlPlaneReadModel } from '../../aoc-control-plane/domain/control-plane-view-model.js';
import { PilotControlPlaneWalkthroughService } from '../services/pilot-control-plane-walkthrough-service.js';
import { buildMinimalControlPlaneWalkthrough } from '../fixtures/minimal-pilot-template.fixture.js';

async function buildReadModel(): Promise<AocControlPlaneReadModel> {
  const bundle = await buildControlPlaneDemoFixture();
  return buildControlPlaneReadModel(bundle);
}

describe('PilotControlPlaneWalkthroughService', () => {
  it('1. builds walkthrough', async () => {
    const service = new PilotControlPlaneWalkthroughService();
    const walkthrough = buildMinimalControlPlaneWalkthrough();
    const result = service.validate(walkthrough);
    assert.equal(result.walkthroughId, walkthrough.id);
  });

  it('2. validates required sections', () => {
    const service = new PilotControlPlaneWalkthroughService();
    const result = service.validate(buildMinimalControlPlaneWalkthrough({ sections: [] }));
    assert.equal(result.valid, false);
  });

  it('3. validates policy section', async () => {
    const readModel = await buildReadModel();
    const service = new PilotControlPlaneWalkthroughService();
    const walkthrough = buildMinimalControlPlaneWalkthrough({
      sections: [{ section: 'policy_packs', title: 'Policy Packs', whatToShow: ['rules'], whyItMatters: 'matters', expectedRowsOrReferences: ['row'] }],
    });
    const result = service.validate(walkthrough, readModel);
    const availability = result.sectionAvailability.find((a) => a.section === 'policy_packs');
    assert.equal(availability?.backedByControlPlane, true);
  });

  it('4. validates enforcement section', async () => {
    const readModel = await buildReadModel();
    const service = new PilotControlPlaneWalkthroughService();
    const walkthrough = buildMinimalControlPlaneWalkthrough({
      sections: [{ section: 'enforcement', title: 'Enforcement', whatToShow: ['decisions'], whyItMatters: 'matters', expectedRowsOrReferences: ['row'] }],
    });
    const result = service.validate(walkthrough, readModel);
    const availability = result.sectionAvailability.find((a) => a.section === 'enforcement');
    assert.equal(availability?.backedByControlPlane, true);
    assert.equal(availability?.hasRows, true);
  });

  it('5. validates evidence section (not yet wired into Control Plane)', async () => {
    const readModel = await buildReadModel();
    const service = new PilotControlPlaneWalkthroughService();
    const walkthrough = buildMinimalControlPlaneWalkthrough({
      sections: [{ section: 'evidence', title: 'Evidence', whatToShow: ['evidence'], whyItMatters: 'matters', expectedRowsOrReferences: ['row'] }],
    });
    const result = service.validate(walkthrough, readModel);
    const availability = result.sectionAvailability.find((a) => a.section === 'evidence');
    assert.equal(availability?.backedByControlPlane, false);
  });

  it('6. validates proofs/audit section', async () => {
    const readModel = await buildReadModel();
    const service = new PilotControlPlaneWalkthroughService();
    const walkthrough = buildMinimalControlPlaneWalkthrough({
      sections: [{ section: 'proofs_audit', title: 'Proofs / Audit', whatToShow: ['proofs'], whyItMatters: 'matters', expectedRowsOrReferences: ['row'] }],
    });
    const result = service.validate(walkthrough, readModel);
    const availability = result.sectionAvailability.find((a) => a.section === 'proofs_audit');
    assert.equal(availability?.backedByControlPlane, true);
  });

  it('7. validates export packages section (not yet wired into Control Plane)', async () => {
    const readModel = await buildReadModel();
    const service = new PilotControlPlaneWalkthroughService();
    const walkthrough = buildMinimalControlPlaneWalkthrough({
      sections: [{ section: 'export_packages', title: 'Export Packages', whatToShow: ['packages'], whyItMatters: 'matters', expectedRowsOrReferences: ['row'] }],
    });
    const result = service.validate(walkthrough, readModel);
    const availability = result.sectionAvailability.find((a) => a.section === 'export_packages');
    assert.equal(availability?.backedByControlPlane, false);
  });

  it('8. produces operator walkthrough artifact', () => {
    const service = new PilotControlPlaneWalkthroughService();
    const result = service.validate(buildMinimalControlPlaneWalkthrough());
    assert.ok(result.operatorWalkthroughArtifact.includes('Control Plane Operator Walkthrough'));
  });

  it('9. does not mutate UI/read model', async () => {
    const readModel = await buildReadModel();
    const before = JSON.parse(JSON.stringify(readModel));
    const service = new PilotControlPlaneWalkthroughService();
    service.validate(buildMinimalControlPlaneWalkthrough({ sections: [{ section: 'enforcement', title: 'Enforcement', whatToShow: ['x'], whyItMatters: 'y', expectedRowsOrReferences: ['z'] }] }), readModel);
    assert.deepEqual(readModel, before);
  });

  it('10. deterministic output', () => {
    const service = new PilotControlPlaneWalkthroughService();
    const walkthrough = buildMinimalControlPlaneWalkthrough();
    const first = service.validate(walkthrough);
    const second = service.validate(walkthrough);
    assert.deepEqual(first, second);
  });
});
