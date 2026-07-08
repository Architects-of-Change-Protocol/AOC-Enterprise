import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildControlPlaneDemoFixture } from '../../../aoc-control-plane/fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../../../aoc-control-plane/services/control-plane-read-model-service.js';
import { checkControlPlaneSection, checkControlPlaneWalkthroughSections } from '../../integrations/control-plane-pilot-adapter.js';

describe('control-plane-pilot-adapter', () => {
  it('1. maps Control Plane snapshot/read model', async () => {
    const bundle = await buildControlPlaneDemoFixture();
    const readModel = buildControlPlaneReadModel(bundle);
    const availability = checkControlPlaneSection(readModel, 'enforcement');
    assert.equal(availability.section, 'enforcement');
  });

  it('2. validates required sections', async () => {
    const bundle = await buildControlPlaneDemoFixture();
    const readModel = buildControlPlaneReadModel(bundle);
    const results = checkControlPlaneWalkthroughSections(readModel, ['overview', 'recognition', 'authority']);
    assert.equal(results.length, 3);
    assert.ok(results.every((r) => r.backedByControlPlane));
  });

  it('3. validates policy/enforcement/proof references', async () => {
    const bundle = await buildControlPlaneDemoFixture();
    const readModel = buildControlPlaneReadModel(bundle);
    const policy = checkControlPlaneSection(readModel, 'policy_packs');
    const enforcement = checkControlPlaneSection(readModel, 'enforcement');
    const proofs = checkControlPlaneSection(readModel, 'proofs_audit');
    assert.equal(policy.backedByControlPlane, true);
    assert.equal(enforcement.backedByControlPlane, true);
    assert.equal(proofs.backedByControlPlane, true);
  });

  it('4. does not mutate UI state', async () => {
    const bundle = await buildControlPlaneDemoFixture();
    const readModel = buildControlPlaneReadModel(bundle);
    const before = JSON.stringify(readModel);
    checkControlPlaneWalkthroughSections(readModel, ['overview', 'recognition', 'authority', 'approvals', 'external_agents', 'enforcement', 'policy_packs', 'proofs_audit', 'evidence', 'export_packages']);
    assert.equal(JSON.stringify(readModel), before);
  });
});
