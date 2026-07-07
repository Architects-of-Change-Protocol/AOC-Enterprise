import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { HandshakeStore } from '../services/handshake-store.js';
import { TrustBoundaryService } from '../services/trust-boundary-service.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

function setUp() {
  const ctx = createHandshakeRuntimeContext(NOW);
  const store = new HandshakeStore();
  return { service: new TrustBoundaryService(ctx, store) };
}

function baseBoundaryInput() {
  return {
    localTrustDomainId: TRUST_DOMAIN,
    allowedExternalIssuerIds: [],
    allowedAgentTypes: ['agent' as const],
    allowedCapabilities: ['read_project_summary'],
    allowedResourceScopes: ['project:HMP-14665'],
    prohibitedCapabilities: ['approve_financial_action'],
    prohibitedActions: ['approve_payment'],
    prohibitedResourceScopes: ['project:restricted'],
    requiresApprovalForUnknownIssuers: true,
    requiresApprovalForHighRisk: true,
    maxVisaTtlMinutes: 60,
    dataBoundaries: [
      {
        id: 'data-boundary-1',
        allowedDataDomains: ['project_status'],
        prohibitedDataDomains: ['bank_account'],
        allowedDirections: ['outbound' as const],
      },
    ],
  };
}

describe('TrustBoundaryService', () => {
  it('1. can create trust boundary', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.equal(boundary.status, 'active');
    assert.ok(boundary.id);
  });

  it('2. can retrieve trust boundary', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.deepEqual(service.getTrustBoundary(boundary.id), boundary);
  });

  it('3. can suspend trust boundary', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    const suspended = service.suspendTrustBoundary(boundary.id);
    assert.equal(suspended.status, 'suspended');
  });

  it('4. can revoke trust boundary', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    const revoked = service.revokeTrustBoundary(boundary.id);
    assert.equal(revoked.status, 'revoked');
  });

  it('5. allows permitted capability', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.equal(service.isCapabilityAllowed(boundary, 'read_project_summary'), true);
  });

  it('6. denies prohibited capability', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.equal(service.isCapabilityAllowed(boundary, 'approve_financial_action'), false);
  });

  it('7. allows permitted action', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.equal(service.isActionAllowed(boundary, 'read_project_summary'), true);
  });

  it('8. denies prohibited action', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.equal(service.isActionAllowed(boundary, 'approve_payment'), false);
  });

  it('9. allows permitted scope', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.equal(service.isResourceScopeAllowed(boundary, 'project:HMP-14665'), true);
  });

  it('10. denies prohibited scope', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.equal(service.isResourceScopeAllowed(boundary, 'project:restricted'), false);
  });

  it('11. allows permitted data domain', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.equal(service.isDataDomainAllowed(boundary, 'project_status', 'outbound'), true);
  });

  it('12. denies prohibited data domain', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.equal(service.isDataDomainAllowed(boundary, 'bank_account', 'outbound'), false);
  });

  it('13. computes max visa TTL', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.equal(service.computeMaxVisaTtlMinutes(boundary, 30), 30);
    assert.equal(service.computeMaxVisaTtlMinutes(boundary, 90), 60);
  });

  it('14. computes approval requirement for high risk', () => {
    const { service } = setUp();
    const boundary = service.createTrustBoundary(baseBoundaryInput());
    assert.equal(service.isApprovalRequiredForHighRisk(boundary), true);
    assert.equal(service.isApprovalRequiredForUnknownIssuer(boundary), true);
  });
});
