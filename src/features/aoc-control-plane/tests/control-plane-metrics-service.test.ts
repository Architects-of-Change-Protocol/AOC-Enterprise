import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeHealth, computeMetrics, type ControlPlaneMetricsInput } from '../services/control-plane-metrics-service.js';
import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';

function metricValue(metrics: ReturnType<typeof computeMetrics>, id: string): number {
  const metric = metrics.find((m) => m.id === id);
  assert.ok(metric, `expected metric ${id} to exist`);
  return metric!.value;
}

const BASE_INPUT: ControlPlaneMetricsInput = {
  recognition: { actors: [], passports: [], capabilityTokens: [], decisions: [], auditEvents: [] },
  authority: { grants: [], delegations: [], roleAssignments: [], decisions: [], proofs: [] },
  approvals: { requests: [], decisions: [], proofs: [], pendingCount: 0 },
  externalAgents: { externalAgents: [], handshakeRequests: [], visas: [], ingressGrants: [], trustBoundaries: [] },
  enforcement: { requests: [], decisions: [], results: [], sideEffects: [], violations: [], proofs: [] },
  emergencyDenyActive: false,
};

describe('ControlPlaneMetricsService', () => {
  it('counts recognized actors', () => {
    const metrics = computeMetrics({
      ...BASE_INPUT,
      recognition: { ...BASE_INPUT.recognition, actors: [{ id: 'a1', type: 'agent', status: 'recognized', trustDomainId: 't1' }, { id: 'a2', type: 'agent', status: 'unknown', trustDomainId: 't1' }] },
    });
    assert.equal(metricValue(metrics, 'recognized-actors'), 1);
  });

  it('counts active authority grants and delegations', () => {
    const metrics = computeMetrics({
      ...BASE_INPUT,
      authority: {
        ...BASE_INPUT.authority,
        grants: [{ id: 'g1', issuerActorId: 'i', subjectActorId: 's', trustDomainId: 't', capability: 'c', actions: [], resourceScopes: [], status: 'active', canDelegate: true, issuedAt: 'now' }],
        delegations: [
          { id: 'd1', delegatorActorId: 'a', delegateActorId: 'b', principalActorId: 'a', trustDomainId: 't', capability: 'c', actions: [], resourceScopes: [], status: 'active', delegationDepth: 1, canRedelegate: false, issuedAt: 'now' },
          { id: 'd2', delegatorActorId: 'a', delegateActorId: 'b', principalActorId: 'a', trustDomainId: 't', capability: 'c', actions: [], resourceScopes: [], status: 'revoked', delegationDepth: 1, canRedelegate: false, issuedAt: 'now' },
        ],
      },
    });
    assert.equal(metricValue(metrics, 'active-authority-grants'), 1);
    assert.equal(metricValue(metrics, 'active-delegations'), 1);
  });

  it('counts pending approvals', () => {
    const metrics = computeMetrics({ ...BASE_INPUT, approvals: { ...BASE_INPUT.approvals, pendingCount: 3 } });
    assert.equal(metricValue(metrics, 'pending-approvals'), 3);
  });

  it('counts active visas and ingress grants', () => {
    const metrics = computeMetrics({
      ...BASE_INPUT,
      externalAgents: {
        ...BASE_INPUT.externalAgents,
        visas: [{ id: 'v1', externalAgentId: 'e', localTrustDomainId: 't', status: 'active', allowedCapabilities: [], allowedActions: [], allowedResourceScopes: [], issuedAt: 'now' }],
        ingressGrants: [{ id: 'ig1', agentVisaId: 'v1', externalAgentId: 'e', localTrustDomainId: 't', status: 'active', actions: [], resourceScopes: [], capabilities: [], issuedAt: 'now' }],
      },
    });
    assert.equal(metricValue(metrics, 'active-external-visas'), 1);
    assert.equal(metricValue(metrics, 'active-ingress-grants'), 1);
  });

  it('counts enforcement requests, blocked executions, executed actions and violations', () => {
    const metrics = computeMetrics({
      ...BASE_INPUT,
      enforcement: {
        ...BASE_INPUT.enforcement,
        requests: [{ id: 'r1', mode: 'execute', status: 'decided', trustDomainId: 't', actorId: 'a', action: 'x', resourceScope: 'y', targetType: 'generic', targetName: 'x', sideEffectType: 'write', submittedAt: 'now' }],
        decisions: [{ id: 'd1', enforcementRequestId: 'r1', type: 'execution_blocked', allowedToExecute: false, reasonCode: 'X', reason: 'X', decidedAt: 'now' }],
        results: [{ id: 'res1', enforcementRequestId: 'r1', enforcementDecisionId: 'd1', status: 'executed', executed: true }],
        violations: [{ id: 'v1', enforcementRequestId: 'r1', type: 'adapter_denied', severity: 'critical', reasonCode: 'X', reason: 'X', detectedAt: 'now' }],
      },
    });
    assert.equal(metricValue(metrics, 'enforcement-requests'), 1);
    assert.equal(metricValue(metrics, 'blocked-executions'), 1);
    assert.equal(metricValue(metrics, 'executed-actions'), 1);
    assert.equal(metricValue(metrics, 'open-violations'), 1);
  });

  it('counts proofs generated', async () => {
    const model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
    const metrics = computeMetrics({
      recognition: model.recognition,
      authority: model.authority,
      approvals: model.approvals,
      externalAgents: model.externalAgents,
      enforcement: model.enforcement,
      emergencyDenyActive: false,
    });
    assert.ok(metricValue(metrics, 'proofs-generated') > 0);
  });

  it('computes healthy status when nothing is open', () => {
    const health = computeHealth(BASE_INPUT);
    assert.equal(health.status, 'healthy');
  });

  it('computes attention_required status when approvals are pending', () => {
    const health = computeHealth({ ...BASE_INPUT, approvals: { ...BASE_INPUT.approvals, pendingCount: 1 } });
    assert.equal(health.status, 'attention_required');
  });

  it('computes degraded status when executions are blocked', () => {
    const health = computeHealth({
      ...BASE_INPUT,
      enforcement: {
        ...BASE_INPUT.enforcement,
        requests: [{ id: 'r1', mode: 'execute', status: 'decided', trustDomainId: 't', actorId: 'a', action: 'x', resourceScope: 'y', targetType: 'generic', targetName: 'x', sideEffectType: 'write', submittedAt: 'now' }],
        decisions: [{ id: 'd1', enforcementRequestId: 'r1', type: 'execution_blocked', allowedToExecute: false, reasonCode: 'X', reason: 'X', decidedAt: 'now' }],
      },
    });
    assert.equal(health.status, 'degraded');
  });

  it('computes critical status when a critical violation is open', () => {
    const health = computeHealth({
      ...BASE_INPUT,
      enforcement: {
        ...BASE_INPUT.enforcement,
        violations: [{ id: 'v1', enforcementRequestId: 'r1', type: 'adapter_denied', severity: 'critical', reasonCode: 'X', reason: 'X', detectedAt: 'now' }],
      },
    });
    assert.equal(health.status, 'critical');
  });

  it('computes critical status when emergency deny is active', () => {
    const health = computeHealth({ ...BASE_INPUT, emergencyDenyActive: true });
    assert.equal(health.status, 'critical');
    assert.equal(health.reasonCode, 'EMERGENCY_DENY_ACTIVE');
  });
});
