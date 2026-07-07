import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ExternalAgentDescriptor } from '../domain/external-agent-descriptor.js';
import type { ExternalCapabilityRequest } from '../domain/external-capability-request.js';
import type { ExternalPassportPresentation } from '../domain/external-passport-presentation.js';
import type { ExternalTrustIssuer } from '../domain/external-trust-issuer.js';
import type { HandshakePolicyContext } from '../domain/handshake-policy.js';
import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { TrustBoundary } from '../domain/trust-boundary.js';
import { createDefaultHandshakePolicyChain } from '../policies/index.js';
import { HandshakePolicyEvaluator } from '../services/handshake-policy-evaluator.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';
const CAPABILITY = 'read_project_summary';
const SCOPE = 'project:HMP-14665';

const agent: ExternalAgentDescriptor = { id: 'agent-1', type: 'agent', status: 'known', displayName: 'Agent One', externalIssuerId: 'issuer-1', firstSeenAt: NOW };

const passport: ExternalPassportPresentation = {
  id: 'passport-1',
  externalAgentId: 'agent-1',
  externalIssuerId: 'issuer-1',
  claimedPassportId: 'claimed-passport-1',
  status: 'valid',
  presentedAt: NOW,
  presentationHash: 'hash-1',
};

const capabilityRequest: ExternalCapabilityRequest = {
  id: 'capability-request-1',
  externalAgentId: 'agent-1',
  handshakeRequestId: 'req-1',
  capability: CAPABILITY,
  actions: [CAPABILITY],
  resourceScopes: [SCOPE],
  requestedAt: NOW,
  status: 'requested',
  riskLevel: 'low',
};

function buildRequest(overrides: Partial<HandshakeRequest> = {}, capabilityOverrides: Partial<ExternalCapabilityRequest> = {}): HandshakeRequest {
  return {
    id: 'req-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgent: agent,
    passportPresentation: passport,
    requestedCapabilities: [{ ...capabilityRequest, ...capabilityOverrides }],
    requestedActions: [CAPABILITY],
    requestedResourceScopes: [SCOPE],
    status: 'submitted',
    createdAt: NOW,
    ...overrides,
  };
}

function buildIssuer(overrides: Partial<ExternalTrustIssuer> = {}): ExternalTrustIssuer {
  return {
    id: 'issuer-1',
    displayName: 'Trusted Partner Org',
    status: 'trusted',
    acceptedByTrustDomainId: TRUST_DOMAIN,
    allowedAgentTypes: ['agent'],
    allowedCapabilities: [CAPABILITY],
    allowedResourceScopes: [SCOPE],
    requiresApproval: false,
    maxVisaTtlMinutes: 60,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildBoundary(overrides: Partial<TrustBoundary> = {}): TrustBoundary {
  return {
    id: 'boundary-1',
    localTrustDomainId: TRUST_DOMAIN,
    status: 'active',
    allowedExternalIssuerIds: ['issuer-1'],
    allowedAgentTypes: ['agent'],
    allowedCapabilities: [CAPABILITY],
    allowedResourceScopes: [SCOPE],
    prohibitedCapabilities: [],
    prohibitedActions: [],
    prohibitedResourceScopes: [],
    requiresApprovalForUnknownIssuers: true,
    requiresApprovalForHighRisk: true,
    maxVisaTtlMinutes: 60,
    dataBoundaries: [
      { id: 'data-boundary-1', allowedDataDomains: ['project_status'], prohibitedDataDomains: ['bank_account'], allowedDirections: ['outbound'] },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function baseContext(overrides: Partial<HandshakePolicyContext> = {}): HandshakePolicyContext {
  return {
    now: NOW,
    request: buildRequest(),
    issuer: buildIssuer(),
    trustBoundary: buildBoundary(),
    riskLevel: 'low',
    allowedCapabilities: [CAPABILITY],
    allowedActions: [CAPABILITY],
    allowedResourceScopes: [SCOPE],
    requiresApprovalSoFar: false,
    ...overrides,
  };
}

function evaluator() {
  return new HandshakePolicyEvaluator(createDefaultHandshakePolicyChain());
}

describe('HandshakePolicyEvaluator', () => {
  it('1. fully valid trusted agent request passes', () => {
    const result = evaluator().evaluate(baseContext());
    assert.equal(result.decisionType, 'accepted');
  });

  it('2. unknown issuer triggers approval_required or quarantine', () => {
    const result = evaluator().evaluate(baseContext({ issuer: buildIssuer({ status: 'unknown' }) }));
    assert.ok(result.decisionType === 'requires_approval' || result.decisionType === 'quarantined');
  });

  it('3. revoked issuer fails', () => {
    const result = evaluator().evaluate(baseContext({ issuer: buildIssuer({ status: 'revoked' }) }));
    assert.equal(result.decisionType, 'rejected');
  });

  it('4. expired passport fails', () => {
    const result = evaluator().evaluate(baseContext({ request: buildRequest({ passportPresentation: { ...passport, status: 'expired' } }) }));
    assert.equal(result.decisionType, 'rejected');
    assert.equal(result.reasonCode, 'PASSPORT_EXPIRED');
  });

  it('5. out-of-scope request fails', () => {
    const context = baseContext({
      request: buildRequest({ requestedResourceScopes: ['project:other'] }, { resourceScopes: ['project:other'] }),
      allowedResourceScopes: ['project:other'],
    });
    const result = evaluator().evaluate(context);
    assert.equal(result.decisionType, 'rejected');
    assert.equal(result.reasonCode, 'SCOPE_DENIED');
  });

  it('6. prohibited capability fails', () => {
    const result = evaluator().evaluate(baseContext({ trustBoundary: buildBoundary({ prohibitedCapabilities: [CAPABILITY] }) }));
    assert.equal(result.decisionType, 'rejected');
    assert.equal(result.reasonCode, 'CAPABILITY_DENIED');
  });

  it('7. prohibited action fails', () => {
    const result = evaluator().evaluate(baseContext({ trustBoundary: buildBoundary({ prohibitedActions: [CAPABILITY] }) }));
    assert.equal(result.decisionType, 'rejected');
  });

  it('8. data boundary violation fails', () => {
    const context = baseContext({ request: buildRequest({ requestedDataDomains: ['bank_account'] }) });
    const result = evaluator().evaluate(context);
    assert.equal(result.decisionType, 'rejected');
    assert.equal(result.reasonCode, 'DATA_BOUNDARY_DENIED');
  });

  it('9. high risk request requires approval', () => {
    const result = evaluator().evaluate(baseContext({ riskLevel: 'high' }));
    assert.equal(result.decisionType, 'requires_approval');
  });

  it('10. valid approval satisfies approval-required policy', () => {
    const result = evaluator().evaluate(
      baseContext({
        riskLevel: 'high',
        approvalCheck: { valid: true, type: 'approval_valid', reasonCode: 'APPROVAL_VALID', reason: 'Approved.' },
      }),
    );
    assert.equal(result.decisionType, 'accepted');
  });

  it('11. expired request fails', () => {
    const result = evaluator().evaluate(baseContext({ request: buildRequest({ expiresAt: '2025-01-01T00:00:00.000Z' }) }));
    assert.equal(result.decisionType, 'expired');
  });

  it('12. revoked request fails in verification', () => {
    const result = evaluator().evaluate(baseContext({ request: buildRequest({ status: 'revoked' }) }));
    assert.equal(result.decisionType, 'revoked');
  });

  it('13. policy results are deterministic and ordered', () => {
    const context = baseContext();
    const first = evaluator().evaluate(context);
    const second = evaluator().evaluate(context);
    assert.deepEqual(
      first.policyResults.map((r) => r.policyId),
      second.policyResults.map((r) => r.policyId),
    );
    assert.deepEqual(
      first.policyResults.map((r) => r.policyId),
      [
        'local_trust_boundary',
        'trusted_issuer',
        'passport_presentation',
        'external_agent_recognition',
        'challenge_response',
        'requested_scope',
        'requested_capability',
        'data_boundary',
        'authority_presentation',
        'risk_classification',
        'approval_required',
        'expiration',
        'revocation',
        'duplicate_handshake',
      ],
    );
  });
});
