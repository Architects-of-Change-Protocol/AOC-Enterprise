import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ActorRegistry } from '../services/actor-registry.js';
import { CapabilityTokenService } from '../services/capability-token-service.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { PassportService } from '../services/passport-service.js';
import { RevocationEngine } from '../services/revocation-engine.js';
import { TrustDomainService } from '../services/trust-domain-service.js';
import { createRuntimeContext } from '../runtime/runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp() {
  const ctx = createRuntimeContext(NOW);
  const actorRegistry = new ActorRegistry(ctx);
  const trustDomainService = new TrustDomainService(ctx);
  const passportService = new PassportService(ctx, actorRegistry, trustDomainService);
  const capabilityTokenService = new CapabilityTokenService(ctx, actorRegistry, trustDomainService);
  const evidenceLedger = new EvidenceLedger(ctx);
  const revocationEngine = new RevocationEngine(actorRegistry, passportService, capabilityTokenService, evidenceLedger);

  const issuer = actorRegistry.registerActor({ type: 'organization', displayName: 'Issuer Org' });
  const trustDomain = trustDomainService.createTrustDomain({
    name: 'Test Domain',
    issuerActorId: issuer.id,
    acceptedIssuerIds: [issuer.id],
    acceptedActorTypes: ['agent'],
  });
  const agent = actorRegistry.registerActor({ type: 'agent', displayName: 'Test Agent', issuerId: issuer.id });
  const passport = passportService.issuePassport({
    type: 'agent_passport',
    subjectActorId: agent.id,
    issuerActorId: issuer.id,
    trustDomainId: trustDomain.id,
  });
  const capabilityToken = capabilityTokenService.issueCapabilityToken({
    subjectActorId: agent.id,
    principalActorId: issuer.id,
    issuerActorId: issuer.id,
    trustDomainId: trustDomain.id,
    capability: 'drafting',
    actions: ['draft'],
    resourceScopes: ['project:1'],
    riskLevel: 'low',
  });

  return { actorRegistry, passportService, capabilityTokenService, evidenceLedger, revocationEngine, issuer, trustDomain, agent, passport, capabilityToken };
}

describe('RevocationEngine', () => {
  it('checkRevocation reports no revocation for a fully valid chain', () => {
    const { revocationEngine, agent, passport, capabilityToken } = setUp();
    const result = revocationEngine.checkRevocation({ actorId: agent.id, passportId: passport.id, capabilityTokenId: capabilityToken.id });
    assert.equal(result.revoked, false);
  });

  it('checkRevocation detects a revoked capability token', () => {
    const { revocationEngine, agent, passport, capabilityToken, trustDomain } = setUp();
    revocationEngine.revokeCapabilityToken(capabilityToken.id, trustDomain.id);

    const result = revocationEngine.checkRevocation({ actorId: agent.id, passportId: passport.id, capabilityTokenId: capabilityToken.id });
    assert.equal(result.revoked, true);
    assert.equal(result.revokedEntityType, 'capability_token');
    assert.equal(result.revokedEntityId, capabilityToken.id);
  });

  it('checkRevocation detects a revoked passport', () => {
    const { revocationEngine, agent, passport, trustDomain } = setUp();
    revocationEngine.revokePassport(passport.id, trustDomain.id);

    const result = revocationEngine.checkRevocation({ actorId: agent.id, passportId: passport.id });
    assert.equal(result.revoked, true);
    assert.equal(result.revokedEntityType, 'passport');
  });

  it('checkRevocation detects a revoked actor and it wins over passport/token checks', () => {
    const { revocationEngine, agent, passport, capabilityToken, trustDomain } = setUp();
    revocationEngine.revokeActor(agent.id, trustDomain.id);

    const result = revocationEngine.checkRevocation({ actorId: agent.id, passportId: passport.id, capabilityTokenId: capabilityToken.id });
    assert.equal(result.revoked, true);
    assert.equal(result.revokedEntityType, 'actor');
  });

  it('records an audit event for every revocation', () => {
    const { revocationEngine, evidenceLedger, agent, passport, capabilityToken, trustDomain } = setUp();

    revocationEngine.revokeCapabilityToken(capabilityToken.id, trustDomain.id);
    revocationEngine.revokePassport(passport.id, trustDomain.id);
    revocationEngine.revokeActor(agent.id, trustDomain.id);

    const trail = evidenceLedger.getAuditTrail();
    assert.equal(trail.length, 3);
    assert.deepEqual(
      trail.map((event) => event.eventType),
      ['capability_token_revoked', 'passport_revoked', 'actor_status_changed'],
    );
  });
});
