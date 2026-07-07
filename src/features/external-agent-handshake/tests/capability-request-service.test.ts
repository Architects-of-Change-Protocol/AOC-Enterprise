import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { TrustBoundary } from '../domain/trust-boundary.js';
import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { CapabilityRequestService } from '../services/capability-request-service.js';
import { HandshakeStore } from '../services/handshake-store.js';
import { TrustBoundaryService } from '../services/trust-boundary-service.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

function setUp() {
  const ctx = createHandshakeRuntimeContext(NOW);
  const store = new HandshakeStore();
  const trustBoundaryService = new TrustBoundaryService(ctx, store);
  const boundary: TrustBoundary = trustBoundaryService.createTrustBoundary({
    localTrustDomainId: TRUST_DOMAIN,
    allowedExternalIssuerIds: [],
    allowedAgentTypes: ['agent'],
    allowedCapabilities: ['read_project_summary', 'submit_project_update'],
    allowedResourceScopes: ['project:HMP-14665'],
    prohibitedCapabilities: ['approve_financial_action'],
    prohibitedActions: ['approve_payment'],
    prohibitedResourceScopes: [],
    requiresApprovalForUnknownIssuers: true,
    requiresApprovalForHighRisk: true,
    maxVisaTtlMinutes: 60,
    dataBoundaries: [
      {
        id: 'data-boundary-1',
        allowedDataDomains: ['project_status'],
        prohibitedDataDomains: ['bank_account'],
        allowedDirections: ['outbound'],
      },
    ],
  });
  return { service: new CapabilityRequestService(ctx, store, trustBoundaryService), trustBoundaryService, boundary };
}

describe('CapabilityRequestService', () => {
  it('1. allowed capability passes', () => {
    const { service, boundary } = setUp();
    const request = service.createCapabilityRequest({
      externalAgentId: 'agent-1',
      handshakeRequestId: 'req-1',
      capability: 'read_project_summary',
      actions: ['read_project_summary'],
      resourceScopes: ['project:HMP-14665'],
      riskLevel: 'low',
    });
    const evaluation = service.evaluateAgainstBoundary(request, boundary);
    assert.equal(evaluation.status, 'allowed');
  });

  it('2. prohibited capability fails', () => {
    const { service, boundary } = setUp();
    const request = service.createCapabilityRequest({
      externalAgentId: 'agent-1',
      handshakeRequestId: 'req-1',
      capability: 'approve_financial_action',
      actions: ['approve_financial_action'],
      resourceScopes: ['project:HMP-14665'],
      riskLevel: 'critical',
    });
    const evaluation = service.evaluateAgainstBoundary(request, boundary);
    assert.equal(evaluation.status, 'denied');
    assert.equal(evaluation.reasonCode, 'CAPABILITY_DENIED');
  });

  it('3. allowed action passes', () => {
    const { service, boundary, trustBoundaryService } = setUp();
    assert.equal(trustBoundaryService.isActionAllowed(boundary, 'read_project_summary'), true);
    void service;
  });

  it('4. prohibited action fails', () => {
    const { service, boundary } = setUp();
    const request = service.createCapabilityRequest({
      externalAgentId: 'agent-1',
      handshakeRequestId: 'req-1',
      capability: 'read_project_summary',
      actions: ['approve_payment'],
      resourceScopes: ['project:HMP-14665'],
      riskLevel: 'low',
    });
    const evaluation = service.evaluateAgainstBoundary(request, boundary);
    assert.equal(evaluation.status, 'denied');
    assert.equal(evaluation.allowedActions.length, 0);
  });

  it('5. allowed scope passes', () => {
    const { service, boundary } = setUp();
    const request = service.createCapabilityRequest({
      externalAgentId: 'agent-1',
      handshakeRequestId: 'req-1',
      capability: 'read_project_summary',
      actions: ['read_project_summary'],
      resourceScopes: ['project:HMP-14665'],
      riskLevel: 'low',
    });
    const evaluation = service.evaluateAgainstBoundary(request, boundary);
    assert.deepEqual(evaluation.allowedResourceScopes, ['project:HMP-14665']);
  });

  it('6. out-of-scope request fails', () => {
    const { service, boundary } = setUp();
    const request = service.createCapabilityRequest({
      externalAgentId: 'agent-1',
      handshakeRequestId: 'req-1',
      capability: 'read_project_summary',
      actions: ['read_project_summary'],
      resourceScopes: ['project:GCH-15992'],
      riskLevel: 'low',
    });
    const evaluation = service.evaluateAgainstBoundary(request, boundary);
    assert.equal(evaluation.status, 'denied');
    assert.equal(evaluation.reasonCode, 'SCOPE_DENIED');
  });

  it('7. partial acceptance limits capabilities', () => {
    const { service, boundary } = setUp();
    const request = service.createCapabilityRequest({
      externalAgentId: 'agent-1',
      handshakeRequestId: 'req-1',
      capability: 'read_project_summary',
      actions: ['read_project_summary'],
      resourceScopes: ['project:HMP-14665', 'project:GCH-15992'],
      riskLevel: 'low',
    });
    const evaluation = service.evaluateAgainstBoundary(request, boundary);
    assert.equal(evaluation.status, 'limited');
    assert.deepEqual(evaluation.allowedResourceScopes, ['project:HMP-14665']);
  });

  it('8. high-risk capability requires approval', () => {
    const { service } = setUp();
    const highRisk = service.createCapabilityRequest({
      externalAgentId: 'agent-1',
      handshakeRequestId: 'req-1',
      capability: 'submit_project_update',
      actions: ['submit_project_update'],
      resourceScopes: ['project:HMP-14665'],
      riskLevel: 'high',
    });
    const lowRisk = service.createCapabilityRequest({
      externalAgentId: 'agent-1',
      handshakeRequestId: 'req-1',
      capability: 'read_project_summary',
      actions: ['read_project_summary'],
      resourceScopes: ['project:HMP-14665'],
      riskLevel: 'low',
    });
    assert.equal(service.computeAggregateRiskLevel([highRisk, lowRisk]), 'high');
  });

  it('9. data boundary violation fails', () => {
    const { service, boundary, trustBoundaryService } = setUp();
    assert.equal(trustBoundaryService.isDataDomainAllowed(boundary, 'bank_account', 'outbound'), false);
    assert.equal(service.isDataDomainRequestAllowed(boundary, ['bank_account'], 'outbound'), false);
  });
});
