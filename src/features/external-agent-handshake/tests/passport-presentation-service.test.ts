import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { ExternalIssuerRegistry } from '../services/external-issuer-registry.js';
import { HandshakeStore } from '../services/handshake-store.js';
import { PassportPresentationService } from '../services/passport-presentation-service.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

function setUp() {
  const ctx = createHandshakeRuntimeContext(NOW);
  const store = new HandshakeStore();
  const issuerRegistry = new ExternalIssuerRegistry(ctx, store);
  return { service: new PassportPresentationService(ctx, store, issuerRegistry), issuerRegistry };
}

function trustedIssuer(issuerRegistry: ExternalIssuerRegistry) {
  const issuer = issuerRegistry.registerExternalIssuer({
    displayName: 'Trusted Partner Org',
    acceptedByTrustDomainId: TRUST_DOMAIN,
    allowedAgentTypes: ['agent'],
    allowedCapabilities: [],
    allowedResourceScopes: [],
    requiresApproval: false,
    maxVisaTtlMinutes: 60,
    status: 'trusted',
  });
  return issuer;
}

describe('PassportPresentationService', () => {
  it('1. valid passport presentation passes', () => {
    const { service, issuerRegistry } = setUp();
    const issuer = trustedIssuer(issuerRegistry);
    const presentation = service.presentPassport({
      externalAgentId: 'agent-1',
      externalIssuerId: issuer.id,
      claimedPassportId: 'claimed-passport-1',
      localTrustDomainId: TRUST_DOMAIN,
    });
    assert.equal(presentation.status, 'valid');
  });

  it('2. missing passport fails', () => {
    const { service } = setUp();
    const result = service.validatePassportPresentation(undefined, NOW);
    assert.equal(result.valid, false);
    assert.equal(result.reasonCode, 'PASSPORT_MISSING');
  });

  it('3. expired passport fails', () => {
    const { service, issuerRegistry } = setUp();
    const issuer = trustedIssuer(issuerRegistry);
    const presentation = service.presentPassport({
      externalAgentId: 'agent-1',
      externalIssuerId: issuer.id,
      claimedPassportId: 'claimed-passport-1',
      localTrustDomainId: TRUST_DOMAIN,
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
    assert.equal(presentation.status, 'expired');
  });

  it('4. revoked passport fails', () => {
    const { service, issuerRegistry } = setUp();
    const issuer = trustedIssuer(issuerRegistry);
    const presentation = service.presentPassport({
      externalAgentId: 'agent-1',
      externalIssuerId: issuer.id,
      claimedPassportId: 'claimed-passport-1',
      localTrustDomainId: TRUST_DOMAIN,
      revoked: true,
    });
    assert.equal(presentation.status, 'revoked');
  });

  it('5. untrusted issuer fails', () => {
    const { service, issuerRegistry } = setUp();
    const issuer = issuerRegistry.registerExternalIssuer({
      displayName: 'Unknown Issuer',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: true,
      maxVisaTtlMinutes: 15,
    });
    const presentation = service.presentPassport({
      externalAgentId: 'agent-1',
      externalIssuerId: issuer.id,
      claimedPassportId: 'claimed-passport-1',
      localTrustDomainId: TRUST_DOMAIN,
    });
    assert.equal(presentation.status, 'issuer_untrusted');
  });

  it('6. presentation hash is deterministic', () => {
    const { service: serviceA, issuerRegistry: issuerRegistryA } = setUp();
    const { service: serviceB, issuerRegistry: issuerRegistryB } = setUp();
    const issuerA = trustedIssuer(issuerRegistryA);
    const issuerB = trustedIssuer(issuerRegistryB);
    const presentationA = serviceA.presentPassport({ externalAgentId: 'agent-1', externalIssuerId: issuerA.id, claimedPassportId: 'claimed-passport-1', localTrustDomainId: TRUST_DOMAIN });
    const presentationB = serviceB.presentPassport({ externalAgentId: 'agent-1', externalIssuerId: issuerB.id, claimedPassportId: 'claimed-passport-1', localTrustDomainId: TRUST_DOMAIN });
    assert.equal(presentationA.presentationHash, presentationB.presentationHash);
  });

  it('7. changing presentation payload changes hash', () => {
    const { service, issuerRegistry } = setUp();
    const issuer = trustedIssuer(issuerRegistry);
    const presentationA = service.presentPassport({ externalAgentId: 'agent-1', externalIssuerId: issuer.id, claimedPassportId: 'claimed-passport-1', localTrustDomainId: TRUST_DOMAIN });
    const presentationB = service.presentPassport({ externalAgentId: 'agent-1', externalIssuerId: issuer.id, claimedPassportId: 'claimed-passport-2', localTrustDomainId: TRUST_DOMAIN });
    assert.notEqual(presentationA.presentationHash, presentationB.presentationHash);
  });
});
