import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AgentVisa } from '../domain/agent-visa.js';
import { createManualHandshakeClock, createSequentialHandshakeIdGenerator } from '../runtime/handshake-runtime-context.js';
import { HandshakeLedger } from '../services/handshake-ledger.js';
import { HandshakeStore } from '../services/handshake-store.js';
import { IngressGrantService } from '../services/ingress-grant-service.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

function setUp() {
  const clock = createManualHandshakeClock(NOW);
  const ctx = { clock, ids: createSequentialHandshakeIdGenerator() };
  const store = new HandshakeStore();
  const ledger = new HandshakeLedger(ctx, store);
  return { service: new IngressGrantService(ctx, store, ledger), ledger, clock };
}

function baseVisa(overrides: Partial<AgentVisa> = {}): AgentVisa {
  return {
    id: 'visa-1',
    handshakeRequestId: 'req-1',
    handshakeDecisionId: 'decision-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgentId: 'agent-1',
    status: 'active',
    allowedCapabilities: ['read_project_summary'],
    allowedActions: ['read_project_summary'],
    allowedResourceScopes: ['project:HMP-14665'],
    issuedAt: NOW,
    ...overrides,
  };
}

describe('IngressGrantService', () => {
  it('1. can issue IngressGrant', () => {
    const { service } = setUp();
    const visa = baseVisa();
    const grant = service.issueIngressGrant(
      { agentVisaId: visa.id, localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent-1', actions: ['read_project_summary'], resourceScopes: ['project:HMP-14665'], capabilities: ['read_project_summary'] },
      visa,
    );
    assert.equal(grant.status, 'active');
  });

  it('2. can retrieve IngressGrant', () => {
    const { service } = setUp();
    const visa = baseVisa();
    const grant = service.issueIngressGrant(
      { agentVisaId: visa.id, localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent-1', actions: ['read_project_summary'], resourceScopes: ['project:HMP-14665'], capabilities: ['read_project_summary'] },
      visa,
    );
    assert.deepEqual(service.getIngressGrant(grant.id), grant);
  });

  it('3. can verify ingress grant', () => {
    const { service } = setUp();
    const visa = baseVisa();
    const grant = service.issueIngressGrant(
      { agentVisaId: visa.id, localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent-1', actions: ['read_project_summary'], resourceScopes: ['project:HMP-14665'], capabilities: ['read_project_summary'] },
      visa,
    );
    const verification = service.verifyIngressGrant(grant.id, NOW, { action: 'read_project_summary', resourceScope: 'project:HMP-14665' });
    assert.equal(verification.valid, true);
  });

  it('4. expired ingress grant fails', () => {
    const { service, clock } = setUp();
    const visa = baseVisa();
    const grant = service.issueIngressGrant(
      {
        agentVisaId: visa.id,
        localTrustDomainId: TRUST_DOMAIN,
        externalAgentId: 'agent-1',
        actions: ['read_project_summary'],
        resourceScopes: ['project:HMP-14665'],
        capabilities: ['read_project_summary'],
        expiresAt: new Date(Date.parse(NOW) + 60_000).toISOString(),
      },
      visa,
    );
    clock.advance(2 * 60_000);
    const verification = service.verifyIngressGrant(grant.id, clock.now(), { action: 'read_project_summary', resourceScope: 'project:HMP-14665' });
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'INGRESS_EXPIRED');
  });

  it('5. revoked ingress grant fails', () => {
    const { service } = setUp();
    const visa = baseVisa();
    const grant = service.issueIngressGrant(
      { agentVisaId: visa.id, localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent-1', actions: ['read_project_summary'], resourceScopes: ['project:HMP-14665'], capabilities: ['read_project_summary'] },
      visa,
    );
    service.revokeIngressGrant(grant.id, 'actor-admin', 'Compliance hold.');
    const verification = service.verifyIngressGrant(grant.id, NOW, { action: 'read_project_summary', resourceScope: 'project:HMP-14665' });
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'INGRESS_REVOKED');
  });

  it('6. suspended ingress grant fails', () => {
    const { service } = setUp();
    const visa = baseVisa();
    const grant = service.issueIngressGrant(
      { agentVisaId: visa.id, localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent-1', actions: ['read_project_summary'], resourceScopes: ['project:HMP-14665'], capabilities: ['read_project_summary'] },
      visa,
    );
    service.suspendIngressGrant(grant.id);
    const verification = service.verifyIngressGrant(grant.id, NOW, { action: 'read_project_summary', resourceScope: 'project:HMP-14665' });
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'INGRESS_SUSPENDED');
  });

  it('7. ingress cannot exceed visa', () => {
    const { service } = setUp();
    const visa = baseVisa({ allowedActions: ['read_project_summary'], allowedResourceScopes: ['project:HMP-14665'] });
    const grant = service.issueIngressGrant(
      {
        agentVisaId: visa.id,
        localTrustDomainId: TRUST_DOMAIN,
        externalAgentId: 'agent-1',
        actions: ['read_project_summary', 'approve_payment'],
        resourceScopes: ['project:HMP-14665', 'project:GCH-15992'],
        capabilities: ['read_project_summary'],
      },
      visa,
    );
    assert.deepEqual(grant.actions, ['read_project_summary']);
    assert.deepEqual(grant.resourceScopes, ['project:HMP-14665']);
  });

  it('8. ingress denied for ungranted action', () => {
    const { service } = setUp();
    const visa = baseVisa();
    const grant = service.issueIngressGrant(
      { agentVisaId: visa.id, localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent-1', actions: ['read_project_summary'], resourceScopes: ['project:HMP-14665'], capabilities: ['read_project_summary'] },
      visa,
    );
    const verification = service.verifyIngressGrant(grant.id, NOW, { action: 'approve_payment', resourceScope: 'project:HMP-14665' });
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'INGRESS_DENIED');
  });

  it('9. ingress denied for ungranted scope', () => {
    const { service } = setUp();
    const visa = baseVisa();
    const grant = service.issueIngressGrant(
      { agentVisaId: visa.id, localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent-1', actions: ['read_project_summary'], resourceScopes: ['project:HMP-14665'], capabilities: ['read_project_summary'] },
      visa,
    );
    const verification = service.verifyIngressGrant(grant.id, NOW, { action: 'read_project_summary', resourceScope: 'project:GCH-15992' });
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'INGRESS_DENIED');
  });

  it('10. revoking ingress grant records event', () => {
    const { service, ledger } = setUp();
    const visa = baseVisa();
    const grant = service.issueIngressGrant(
      { agentVisaId: visa.id, localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent-1', actions: ['read_project_summary'], resourceScopes: ['project:HMP-14665'], capabilities: ['read_project_summary'] },
      visa,
    );
    service.revokeIngressGrant(grant.id, 'actor-admin', 'Compliance hold.');
    const events = ledger.getEventTrail({ visaId: visa.id });
    assert.ok(events.some((event) => event.type === 'ingress_grant_revoked'));
  });
});
