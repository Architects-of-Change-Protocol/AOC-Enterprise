import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { ExternalIssuerRegistry } from '../services/external-issuer-registry.js';
import { HandshakeStore } from '../services/handshake-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

function setUp() {
  const ctx = createHandshakeRuntimeContext(NOW);
  const store = new HandshakeStore();
  return { registry: new ExternalIssuerRegistry(ctx, store), store };
}

describe('ExternalIssuerRegistry', () => {
  it('1. can register trusted issuer', () => {
    const { registry } = setUp();
    const issuer = registry.registerExternalIssuer({
      displayName: 'Trusted Partner Org',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: false,
      maxVisaTtlMinutes: 60,
      status: 'trusted',
    });
    assert.equal(issuer.status, 'trusted');
  });

  it('2. can register limited issuer', () => {
    const { registry } = setUp();
    const issuer = registry.registerExternalIssuer({
      displayName: 'Limited Partner Org',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: true,
      maxVisaTtlMinutes: 30,
      status: 'limited',
    });
    assert.equal(issuer.status, 'limited');
  });

  it('3. can suspend issuer', () => {
    const { registry } = setUp();
    const issuer = registry.registerExternalIssuer({
      displayName: 'Org',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: false,
      maxVisaTtlMinutes: 60,
    });
    const suspended = registry.suspendExternalIssuer(issuer.id);
    assert.equal(suspended.status, 'suspended');
  });

  it('4. can revoke issuer', () => {
    const { registry } = setUp();
    const issuer = registry.registerExternalIssuer({
      displayName: 'Org',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: false,
      maxVisaTtlMinutes: 60,
    });
    const revoked = registry.revokeExternalIssuer(issuer.id);
    assert.equal(revoked.status, 'revoked');
  });

  it('5. can trust issuer', () => {
    const { registry } = setUp();
    const issuer = registry.registerExternalIssuer({
      displayName: 'Org',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: false,
      maxVisaTtlMinutes: 60,
    });
    const trusted = registry.trustExternalIssuer(issuer.id);
    assert.equal(trusted.status, 'trusted');
  });

  it('6. can limit issuer', () => {
    const { registry } = setUp();
    const issuer = registry.registerExternalIssuer({
      displayName: 'Org',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: false,
      maxVisaTtlMinutes: 60,
    });
    const limited = registry.limitExternalIssuer(issuer.id);
    assert.equal(limited.status, 'limited');
  });

  it('7. detects issuer accepted by trust domain', () => {
    const { registry } = setUp();
    const issuer = registry.registerExternalIssuer({
      displayName: 'Org',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: false,
      maxVisaTtlMinutes: 60,
      status: 'trusted',
    });
    assert.equal(registry.isIssuerAcceptedByTrustDomain(issuer.id, TRUST_DOMAIN), true);
  });

  it('8. rejects revoked issuer', () => {
    const { registry } = setUp();
    const issuer = registry.registerExternalIssuer({
      displayName: 'Org',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: false,
      maxVisaTtlMinutes: 60,
      status: 'trusted',
    });
    registry.revokeExternalIssuer(issuer.id);
    assert.equal(registry.isIssuerAcceptedByTrustDomain(issuer.id, TRUST_DOMAIN), false);
  });

  it('9. lists accepted issuers for trust domain', () => {
    const { registry } = setUp();
    registry.registerExternalIssuer({
      id: 'issuer-trusted',
      displayName: 'Trusted',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: false,
      maxVisaTtlMinutes: 60,
      status: 'trusted',
    });
    registry.registerExternalIssuer({
      id: 'issuer-unknown',
      displayName: 'Unknown',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: true,
      maxVisaTtlMinutes: 15,
    });
    const accepted = registry.getAcceptedIssuersForTrustDomain(TRUST_DOMAIN);
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0]?.id, 'issuer-trusted');
  });

  it('10. unknown issuer is not accepted by default', () => {
    const { registry } = setUp();
    const issuer = registry.registerExternalIssuer({
      displayName: 'Org',
      acceptedByTrustDomainId: TRUST_DOMAIN,
      allowedAgentTypes: ['agent'],
      allowedCapabilities: [],
      allowedResourceScopes: [],
      requiresApproval: true,
      maxVisaTtlMinutes: 15,
    });
    assert.equal(issuer.status, 'unknown');
    assert.equal(registry.isIssuerAcceptedByTrustDomain(issuer.id, TRUST_DOMAIN), false);
  });
});
