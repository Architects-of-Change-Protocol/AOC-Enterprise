import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { TrustBoundary } from '../domain/trust-boundary.js';
import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { AuthorityPresentationService } from '../services/authority-presentation-service.js';
import type {
  HandshakeAuthorityGraphIntegration,
  HandshakeAuthorityVerificationResult,
  HandshakeAuthorityVerificationResultType,
} from '../services/handshake-authority-graph-integration.js';
import { HandshakeStore } from '../services/handshake-store.js';
import { TrustBoundaryService } from '../services/trust-boundary-service.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

function mockAuthorityGraph(type: HandshakeAuthorityVerificationResultType): HandshakeAuthorityGraphIntegration {
  return {
    verifyAuthority(): HandshakeAuthorityVerificationResult {
      return {
        type,
        valid: type === 'authority_valid',
        reasonCode: type.toUpperCase(),
        reason: `Authority Graph returned ${type}.`,
        authorityDecisionId: 'authority-decision-1',
      };
    },
  };
}

function setUp(authorityGraph?: HandshakeAuthorityGraphIntegration) {
  const ctx = createHandshakeRuntimeContext(NOW);
  const store = new HandshakeStore();
  return { service: new AuthorityPresentationService(ctx, store, authorityGraph), store };
}

function basePresentationInput() {
  return {
    externalAgentId: 'agent-1',
    handshakeRequestId: 'req-1',
    capability: 'submit_project_update',
    actions: ['submit_project_update'],
    resourceScopes: ['project:HMP-14665'],
  };
}

describe('AuthorityPresentationService', () => {
  it('1. valid authority presentation passes', () => {
    const { service } = setUp();
    const presentation = service.presentAuthority({ ...basePresentationInput(), externalAuthorityProofId: 'external-authority-proof-1' });
    const check = service.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, true);
  });

  it('2. missing authority fails when required', () => {
    const { service } = setUp();
    const presentation = service.presentAuthority(basePresentationInput());
    const check = service.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, false);
    assert.equal(check.type, 'authority_missing');
  });

  it('3. expired authority fails', () => {
    const { service } = setUp(mockAuthorityGraph('ancestor_expired'));
    const presentation = service.presentAuthority(basePresentationInput());
    const check = service.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, false);
    assert.equal(check.type, 'ancestor_expired');
  });

  it('4. revoked authority fails', () => {
    const { service } = setUp(mockAuthorityGraph('ancestor_revoked'));
    const presentation = service.presentAuthority(basePresentationInput());
    const check = service.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, false);
    assert.equal(check.type, 'ancestor_revoked');
  });

  it('5. Authority Graph authority_valid passes', () => {
    const { service } = setUp(mockAuthorityGraph('authority_valid'));
    const presentation = service.presentAuthority(basePresentationInput());
    const check = service.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, true);
    assert.equal(check.type, 'authority_valid');
  });

  it('6. Authority Graph ancestor_revoked fails', () => {
    const { service } = setUp(mockAuthorityGraph('ancestor_revoked'));
    const presentation = service.presentAuthority(basePresentationInput());
    const check = service.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, false);
  });

  it('7. Authority Graph ancestor_expired fails', () => {
    const { service } = setUp(mockAuthorityGraph('ancestor_expired'));
    const presentation = service.presentAuthority(basePresentationInput());
    const check = service.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, false);
  });

  it('8. Authority Graph scope_expansion_detected fails', () => {
    const { service } = setUp(mockAuthorityGraph('scope_expansion_detected'));
    const presentation = service.presentAuthority(basePresentationInput());
    const check = service.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, false);
    assert.equal(check.type, 'scope_expansion_detected');
  });

  it('9. authority cannot override local boundary', () => {
    const { service } = setUp(mockAuthorityGraph('authority_valid'));
    const presentation = service.presentAuthority({ ...basePresentationInput(), capability: 'approve_financial_action', actions: ['approve_financial_action'] });
    const check = service.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, true);

    const ctx = createHandshakeRuntimeContext(NOW);
    const store = new HandshakeStore();
    const trustBoundaryService = new TrustBoundaryService(ctx, store);
    const boundary: TrustBoundary = trustBoundaryService.createTrustBoundary({
      localTrustDomainId: TRUST_DOMAIN,
      allowedExternalIssuerIds: [],
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      prohibitedCapabilities: ['approve_financial_action'],
      prohibitedActions: [],
      prohibitedResourceScopes: [],
      requiresApprovalForUnknownIssuers: true,
      requiresApprovalForHighRisk: true,
      maxVisaTtlMinutes: 60,
      dataBoundaries: [],
    });
    // Even though authority is valid, the local trust boundary still prohibits the capability outright.
    assert.equal(trustBoundaryService.isCapabilityAllowed(boundary, 'approve_financial_action'), false);
  });
});
