import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ActorRegistry } from '../services/actor-registry.js';
import { CapabilityTokenService } from '../services/capability-token-service.js';
import { TrustDomainService } from '../services/trust-domain-service.js';
import { createManualClock, createSequentialIdGenerator } from '../runtime/runtime-context.js';
import { ActorNotFoundError, CapabilityTokenNotFoundError, DelegationNotPermittedError } from '../runtime/runtime-errors.js';

const NOW = '2026-01-01T00:00:00.000Z';

function assertThrowsInstance(fn: () => void, errorClass: new (...args: never[]) => Error): void {
  try {
    fn();
    assert.ok(false, 'expected function to throw');
  } catch (error) {
    assert.ok(error instanceof errorClass, `expected error to be an instance of ${errorClass.name}`);
  }
}

function setUp() {
  const clock = createManualClock(NOW);
  const ctx = { clock, idGenerator: createSequentialIdGenerator() };
  const actorRegistry = new ActorRegistry(ctx);
  const trustDomainService = new TrustDomainService(ctx);
  const capabilityTokenService = new CapabilityTokenService(ctx, actorRegistry, trustDomainService);

  const issuer = actorRegistry.registerActor({ type: 'organization', displayName: 'Issuer Org' });
  const trustDomain = trustDomainService.createTrustDomain({
    name: 'Test Domain',
    issuerActorId: issuer.id,
    acceptedIssuerIds: [issuer.id],
    acceptedActorTypes: ['human', 'agent'],
  });
  const human = actorRegistry.registerActor({ type: 'human', displayName: 'Human Principal', issuerId: issuer.id });
  const agent = actorRegistry.registerActor({ type: 'agent', displayName: 'Sub Agent', issuerId: issuer.id });

  return { clock, actorRegistry, trustDomainService, capabilityTokenService, issuer, trustDomain, human, agent };
}

describe('CapabilityTokenService', () => {
  it('issues a valid capability token', () => {
    const { capabilityTokenService, issuer, trustDomain, agent } = setUp();
    const token = capabilityTokenService.issueCapabilityToken({
      subjectActorId: agent.id,
      principalActorId: issuer.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      capability: 'drafting',
      actions: ['draft'],
      resourceScopes: ['project:1'],
      riskLevel: 'low',
    });

    assert.equal(token.status, 'valid');
    assert.equal(token.delegation.delegationDepth, 0);
    assert.equal(capabilityTokenService.verifyCapabilityToken(token.id).valid, true);
  });

  it('throws when issuing a token for an unknown actor', () => {
    const { capabilityTokenService, issuer, trustDomain } = setUp();
    assertThrowsInstance(() => {
      capabilityTokenService.issueCapabilityToken({
        subjectActorId: 'actor-does-not-exist',
        principalActorId: issuer.id,
        issuerActorId: issuer.id,
        trustDomainId: trustDomain.id,
        capability: 'drafting',
        actions: ['draft'],
        resourceScopes: ['project:1'],
        riskLevel: 'low',
      });
    }, ActorNotFoundError);

  });

  it('reports expiry and revocation through verifyCapabilityToken', () => {
    const { clock, capabilityTokenService, issuer, trustDomain, agent } = setUp();
    const token = capabilityTokenService.issueCapabilityToken({
      subjectActorId: agent.id,
      principalActorId: issuer.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      capability: 'drafting',
      actions: ['draft'],
      resourceScopes: ['project:1'],
      riskLevel: 'low',
      expiresAt: '2026-02-01T00:00:00.000Z',
    });

    clock.advance(60 * 24 * 60 * 60 * 1000);
    assert.equal(capabilityTokenService.verifyCapabilityToken(token.id).reasonCode, 'CAPABILITY_TOKEN_EXPIRED');

    const stillValidToken = capabilityTokenService.issueCapabilityToken({
      subjectActorId: agent.id,
      principalActorId: issuer.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      capability: 'drafting',
      actions: ['draft'],
      resourceScopes: ['project:1'],
      riskLevel: 'low',
    });
    capabilityTokenService.revokeCapabilityToken(stillValidToken.id);
    assert.equal(capabilityTokenService.verifyCapabilityToken(stillValidToken.id).reasonCode, 'CAPABILITY_TOKEN_REVOKED');
  });

  it('checkCapabilityForAction reports grant, prohibition and scope independently', () => {
    const { capabilityTokenService, issuer, trustDomain, agent } = setUp();
    const token = capabilityTokenService.issueCapabilityToken({
      subjectActorId: agent.id,
      principalActorId: issuer.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      capability: 'drafting',
      actions: ['draft'],
      resourceScopes: ['project:1'],
      prohibitedActions: ['delete_everything'],
      riskLevel: 'low',
    });

    assert.deepEqual(capabilityTokenService.checkCapabilityForAction(token, 'draft', 'project:1'), {
      actionGranted: true,
      prohibited: false,
      inResourceScope: true,
    });
    assert.deepEqual(capabilityTokenService.checkCapabilityForAction(token, 'delete_everything', 'project:1'), {
      actionGranted: false,
      prohibited: true,
      inResourceScope: true,
    });
    assert.deepEqual(capabilityTokenService.checkCapabilityForAction(token, 'draft', 'project:2'), {
      actionGranted: true,
      prohibited: false,
      inResourceScope: false,
    });
  });

  it('allows a delegable token to be delegated within its depth limit', () => {
    const { capabilityTokenService, human, agent, issuer, trustDomain } = setUp();
    const rootToken = capabilityTokenService.issueCapabilityToken({
      subjectActorId: human.id,
      principalActorId: human.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      capability: 'drafting',
      actions: ['draft'],
      resourceScopes: ['project:1'],
      delegable: true,
      maxDelegationDepth: 1,
      riskLevel: 'low',
    });

    const delegated = capabilityTokenService.issueCapabilityToken({
      subjectActorId: agent.id,
      principalActorId: human.id,
      issuerActorId: human.id,
      trustDomainId: trustDomain.id,
      capability: 'drafting',
      actions: ['draft'],
      resourceScopes: ['project:1'],
      delegatedFromTokenId: rootToken.id,
      riskLevel: 'low',
    });

    assert.equal(delegated.delegation.delegationDepth, 1);
    assert.equal(delegated.delegation.maxDelegationDepth, 1);
  });

  it('refuses to delegate from a non-delegable parent token', () => {
    const { capabilityTokenService, human, agent, issuer, trustDomain } = setUp();
    const rootToken = capabilityTokenService.issueCapabilityToken({
      subjectActorId: human.id,
      principalActorId: human.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      capability: 'drafting',
      actions: ['draft'],
      resourceScopes: ['project:1'],
      delegable: false,
      riskLevel: 'low',
    });

    assertThrowsInstance(() => {
      capabilityTokenService.issueCapabilityToken({
        subjectActorId: agent.id,
        principalActorId: human.id,
        issuerActorId: human.id,
        trustDomainId: trustDomain.id,
        capability: 'drafting',
        actions: ['draft'],
        resourceScopes: ['project:1'],
        delegatedFromTokenId: rootToken.id,
        riskLevel: 'low',
      });
    }, DelegationNotPermittedError);
  });

  it('refuses to delegate scope or actions beyond the parent token', () => {
    const { capabilityTokenService, human, agent, issuer, trustDomain } = setUp();
    const rootToken = capabilityTokenService.issueCapabilityToken({
      subjectActorId: human.id,
      principalActorId: human.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      capability: 'drafting',
      actions: ['draft'],
      resourceScopes: ['project:1'],
      delegable: true,
      maxDelegationDepth: 1,
      riskLevel: 'low',
    });

    assertThrowsInstance(() => {
      capabilityTokenService.issueCapabilityToken({
        subjectActorId: agent.id,
        principalActorId: human.id,
        issuerActorId: human.id,
        trustDomainId: trustDomain.id,
        capability: 'drafting',
        actions: ['draft', 'approve_payment'],
        resourceScopes: ['project:1'],
        delegatedFromTokenId: rootToken.id,
        riskLevel: 'low',
      });
    }, DelegationNotPermittedError);
  });

  it('throws when delegating from an unknown parent token', () => {
    const { capabilityTokenService, agent, issuer, trustDomain } = setUp();
    assertThrowsInstance(() => {
      capabilityTokenService.issueCapabilityToken({
        subjectActorId: agent.id,
        principalActorId: issuer.id,
        issuerActorId: issuer.id,
        trustDomainId: trustDomain.id,
        capability: 'drafting',
        actions: ['draft'],
        resourceScopes: ['project:1'],
        delegatedFromTokenId: 'cap-does-not-exist',
        riskLevel: 'low',
      });
    }, CapabilityTokenNotFoundError);
  });

  it('importCapabilityToken registers a token built out-of-band', () => {
    const { capabilityTokenService, agent, issuer, trustDomain } = setUp();
    const imported = capabilityTokenService.importCapabilityToken({
      id: 'cap-imported',
      subjectActorId: agent.id,
      principalActorId: issuer.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      capability: 'drafting',
      actions: ['draft'],
      resourceScopes: ['project:1'],
      constraints: { prohibitedActions: [] },
      delegation: { delegable: false, delegationDepth: 2, maxDelegationDepth: 1 },
      evidenceRequirements: [],
      riskLevel: 'low',
      status: 'valid',
      issuedAt: NOW,
    });

    assert.equal(capabilityTokenService.getCapabilityToken(imported.id), imported);
  });
});
