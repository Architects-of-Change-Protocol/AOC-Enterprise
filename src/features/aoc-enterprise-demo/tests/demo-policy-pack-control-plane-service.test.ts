import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../services/index.js';
import { createDemoPolicyPackControlPlaneService } from '../services/demo-policy-pack-control-plane-service.js';
import {
  POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO,
  executePolicyPackPaymentApprovalRequiredScenario,
} from '../scenarios/policy-pack-payment-approval-required.scenario.js';
import { createTickingClock } from '../scenarios/scenario-runtime-types.js';

describe('DemoPolicyPackControlPlaneService', () => {
  it('1. creates a policy-focused Control Plane snapshot', async () => {
    const suite = createEnterpriseDemoSuite();
    const world = suite.orchestrator.createWorld();
    const clock = createTickingClock('2026-01-01T00:00:00.000Z');
    const execution = await executePolicyPackPaymentApprovalRequiredScenario(world, { now: clock });
    const service = createDemoPolicyPackControlPlaneService();
    const snapshot = service.buildSnapshot(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, world, execution, clock);

    assert.equal(snapshot.scenarioId, POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO.id);
    assert.ok(snapshot.generatedAt.length > 0);
    assert.ok(snapshot.viewModel !== undefined);
  });

  it('2. highlights the Policy Packs panel', async () => {
    const suite = createEnterpriseDemoSuite();
    const world = suite.orchestrator.createWorld();
    const clock = createTickingClock('2026-01-01T00:00:00.000Z');
    const execution = await executePolicyPackPaymentApprovalRequiredScenario(world, { now: clock });
    const service = createDemoPolicyPackControlPlaneService();
    const snapshot = service.buildSnapshot(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, world, execution, clock);

    const panels = snapshot.walkthroughAnchors.map((anchor) => anchor.panel);
    assert.ok(panels.includes('policy_packs'));
  });

  it('3. highlights the Enforcement panel', async () => {
    const suite = createEnterpriseDemoSuite();
    const world = suite.orchestrator.createWorld();
    const clock = createTickingClock('2026-01-01T00:00:00.000Z');
    const execution = await executePolicyPackPaymentApprovalRequiredScenario(world, { now: clock });
    const service = createDemoPolicyPackControlPlaneService();
    const snapshot = service.buildSnapshot(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, world, execution, clock);

    const panels = snapshot.walkthroughAnchors.map((anchor) => anchor.panel);
    assert.ok(panels.includes('enforcement'));
  });

  it('4. highlights the Proofs / Audit panel', async () => {
    const suite = createEnterpriseDemoSuite();
    const world = suite.orchestrator.createWorld();
    const clock = createTickingClock('2026-01-01T00:00:00.000Z');
    const execution = await executePolicyPackPaymentApprovalRequiredScenario(world, { now: clock });
    const service = createDemoPolicyPackControlPlaneService();
    const snapshot = service.buildSnapshot(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, world, execution, clock);

    const panels = snapshot.walkthroughAnchors.map((anchor) => anchor.panel);
    assert.ok(panels.includes('proofs'));
  });

  it('5. links the policy decision row', async () => {
    const suite = createEnterpriseDemoSuite();
    const world = suite.orchestrator.createWorld();
    const clock = createTickingClock('2026-01-01T00:00:00.000Z');
    const execution = await executePolicyPackPaymentApprovalRequiredScenario(world, { now: clock });
    const service = createDemoPolicyPackControlPlaneService();
    const snapshot = service.buildSnapshot(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, world, execution, clock);

    assert.ok(snapshot.highlightedDecisionId !== undefined);
    assert.ok(snapshot.viewModel.decisions.some((decision) => decision.id === snapshot.highlightedDecisionId));
  });

  it('6. links the policy proof row', async () => {
    const suite = createEnterpriseDemoSuite();
    const world = suite.orchestrator.createWorld();
    const clock = createTickingClock('2026-01-01T00:00:00.000Z');
    const execution = await executePolicyPackPaymentApprovalRequiredScenario(world, { now: clock });
    const service = createDemoPolicyPackControlPlaneService();
    const snapshot = service.buildSnapshot(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, world, execution, clock);

    assert.ok(snapshot.highlightedProofId !== undefined);
    assert.ok(snapshot.viewModel.proofs.some((proof) => proof.id === snapshot.highlightedProofId));
  });

  it('7. links the policy enforcement link row', async () => {
    const suite = createEnterpriseDemoSuite();
    const world = suite.orchestrator.createWorld();
    const clock = createTickingClock('2026-01-01T00:00:00.000Z');
    const execution = await executePolicyPackPaymentApprovalRequiredScenario(world, { now: clock });
    const service = createDemoPolicyPackControlPlaneService();
    const snapshot = service.buildSnapshot(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, world, execution, clock);

    assert.ok(snapshot.highlightedEnforcementLinkId !== undefined);
    assert.ok(snapshot.viewModel.enforcementLinks.some((link) => link.id === snapshot.highlightedEnforcementLinkId));
    assert.equal(snapshot.policyProofChainComplete, true);
  });

  it('8. includes operator walkthrough anchors', async () => {
    const suite = createEnterpriseDemoSuite();
    const world = suite.orchestrator.createWorld();
    const clock = createTickingClock('2026-01-01T00:00:00.000Z');
    const execution = await executePolicyPackPaymentApprovalRequiredScenario(world, { now: clock });
    const service = createDemoPolicyPackControlPlaneService();
    const snapshot = service.buildSnapshot(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, world, execution, clock);

    assert.ok(snapshot.walkthroughAnchors.length > 0);
    assert.ok(snapshot.walkthroughAnchors.every((anchor) => anchor.narration.length > 0));
  });

  it('9. produces deterministic output for the same run', async () => {
    const suiteA = createEnterpriseDemoSuite();
    const worldA = suiteA.orchestrator.createWorld();
    const clockA = createTickingClock('2026-01-01T00:00:00.000Z');
    const executionA = await executePolicyPackPaymentApprovalRequiredScenario(worldA, { now: clockA });
    const serviceA = createDemoPolicyPackControlPlaneService();
    const snapshotA = serviceA.buildSnapshot(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, worldA, executionA, clockA);

    const suiteB = createEnterpriseDemoSuite();
    const worldB = suiteB.orchestrator.createWorld();
    const clockB = createTickingClock('2026-01-01T00:00:00.000Z');
    const executionB = await executePolicyPackPaymentApprovalRequiredScenario(worldB, { now: clockB });
    const serviceB = createDemoPolicyPackControlPlaneService();
    const snapshotB = serviceB.buildSnapshot(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, worldB, executionB, clockB);

    assert.equal(snapshotA.highlightedDecisionId, snapshotB.highlightedDecisionId);
    assert.equal(snapshotA.highlightedProofId, snapshotB.highlightedProofId);
    assert.deepEqual(snapshotA.highlightedRuleIds, snapshotB.highlightedRuleIds);
  });
});
