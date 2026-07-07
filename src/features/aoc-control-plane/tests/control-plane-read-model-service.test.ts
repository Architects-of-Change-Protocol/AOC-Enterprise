import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildControlPlaneDemoFixture, type ControlPlaneRuntimeBundle } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';

describe('ControlPlaneReadModelService', () => {
  let bundle: ControlPlaneRuntimeBundle;

  before(async () => {
    bundle = await buildControlPlaneDemoFixture();
  });

  it('creates a read model from the deterministic demo fixture', () => {
    const model = buildControlPlaneReadModel(bundle);
    assert.equal(model.trustDomainId, bundle.trustDomainId);
  });

  it('includes overview metrics and health', () => {
    const model = buildControlPlaneReadModel(bundle);
    assert.ok(model.overview.metrics.length > 0);
    assert.ok(['healthy', 'attention_required', 'degraded', 'critical'].includes(model.overview.health.status));
    assert.ok(model.overview.recentDecisions.length > 0);
  });

  it('includes recognition rows', () => {
    const model = buildControlPlaneReadModel(bundle);
    assert.ok(model.recognition.actors.length > 0);
    assert.ok(model.recognition.passports.length > 0);
    assert.ok(model.recognition.capabilityTokens.length > 0);
    assert.ok(model.recognition.decisions.length > 0);
    assert.ok(model.recognition.auditEvents.length > 0);
    const revokedToken = model.recognition.capabilityTokens.find((token) => token.status === 'revoked');
    assert.ok(revokedToken, 'expected the revoked legal capability token to appear');
  });

  it('includes authority rows', () => {
    const model = buildControlPlaneReadModel(bundle);
    assert.ok(model.authority.grants.length > 0);
    assert.ok(model.authority.delegations.length > 0);
    assert.ok(model.authority.roleAssignments.length > 0);
    assert.ok(model.authority.decisions.length > 0);
    assert.ok(model.authority.proofs.length > 0);
    assert.ok(model.authority.decisions.some((d) => d.valid === false), 'expected the SIGN_CONTRACT authority_missing decision');
  });

  it('includes approval rows', () => {
    const model = buildControlPlaneReadModel(bundle);
    assert.ok(model.approvals.requests.length > 0);
    assert.ok(model.approvals.decisions.length > 0);
    assert.ok(model.approvals.proofs.length > 0);
    assert.equal(model.approvals.requests[0]?.status, 'approved');
  });

  it('includes external agent rows', () => {
    const model = buildControlPlaneReadModel(bundle);
    assert.ok(model.externalAgents.externalAgents.length > 0);
    assert.ok(model.externalAgents.handshakeRequests.length > 0);
    assert.ok(model.externalAgents.visas.length > 0);
    assert.ok(model.externalAgents.ingressGrants.length > 0);
    assert.ok(model.externalAgents.trustBoundaries.length > 0);
  });

  it('includes enforcement rows', () => {
    const model = buildControlPlaneReadModel(bundle);
    assert.ok(model.enforcement.requests.length > 0);
    assert.ok(model.enforcement.decisions.length > 0);
    assert.ok(model.enforcement.results.length > 0);
    assert.ok(model.enforcement.sideEffects.length > 0);
    assert.ok(model.enforcement.violations.length > 0);
    assert.ok(model.enforcement.proofs.length > 0);
    assert.ok(model.enforcement.results.some((r) => r.executed === true));
    assert.ok(model.enforcement.decisions.some((d) => d.allowedToExecute === false));
  });

  it('includes proof rows and complete proof chains', () => {
    const model = buildControlPlaneReadModel(bundle);
    assert.ok(model.proofs.recognitionProofs.length > 0);
    assert.ok(model.proofs.authorityProofs.length > 0);
    assert.ok(model.proofs.approvalProofs.length > 0);
    assert.ok(model.proofs.handshakeProofs.length > 0);
    assert.ok(model.proofs.enforcementProofs.length > 0);
    assert.ok(model.proofs.proofChains.length > 0);
    assert.ok(model.proofs.proofChains.every((chain) => chain.complete), 'every referenced upstream proof id should be resolvable');
  });

  it('computes generatedAt from an injected clock', () => {
    const model = buildControlPlaneReadModel(bundle, { now: () => '2030-05-05T00:00:00.000Z' });
    assert.equal(model.generatedAt, '2030-05-05T00:00:00.000Z');
  });

  it('produces deterministic output for the same input', () => {
    const first = buildControlPlaneReadModel(bundle, { now: () => '2026-01-01T00:00:00.000Z' });
    const second = buildControlPlaneReadModel(bundle, { now: () => '2026-01-01T00:00:00.000Z' });
    assert.deepEqual(first, second);
  });
});
