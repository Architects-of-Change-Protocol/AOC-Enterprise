import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAuthorityGraphRuntime } from '../../authority-graph/runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../../authority-graph/runtime/authority-runtime-context.js';
import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { AuthorityPresentationService } from '../services/authority-presentation-service.js';
import { createHandshakeAuthorityGraphIntegration } from '../services/handshake-authority-graph-integration.js';
import { HandshakeProofService } from '../services/handshake-proof-service.js';
import { HandshakeStore } from '../services/handshake-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-datasys-agent-republic';
const DATASYS = 'actor-datasys';
const VICTOR = 'actor-victor';
const CAPABILITY = 'submit_project_update';
const SCOPE = 'project:HMP-14665';

function setUp() {
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(NOW));
  authorityRuntime.registerRootIssuer(TRUST_DOMAIN, DATASYS);

  const handshakeCtx = createHandshakeRuntimeContext(NOW);
  const store = new HandshakeStore();
  const authorityGraph = createHandshakeAuthorityGraphIntegration(authorityRuntime);
  const authorityPresentationService = new AuthorityPresentationService(handshakeCtx, store, authorityGraph);
  const proofService = new HandshakeProofService(handshakeCtx, store);

  return { authorityRuntime, authorityPresentationService, proofService, store };
}

function presentAuthority(service: AuthorityPresentationService, overrides: { readonly principalActorId?: string; readonly capability?: string; readonly resourceScopes?: readonly string[] } = {}) {
  return service.presentAuthority({
    externalAgentId: 'external-agent-1',
    handshakeRequestId: 'req-1',
    principalActorId: overrides.principalActorId ?? VICTOR,
    capability: overrides.capability ?? CAPABILITY,
    actions: [overrides.capability ?? CAPABILITY],
    resourceScopes: overrides.resourceScopes ?? [SCOPE],
  });
}

describe('External Agent Handshake + Authority Graph integration', () => {
  it('1. external authority presentation can be validated through Authority Graph integration', () => {
    const { authorityRuntime, authorityPresentationService } = setUp();
    authorityRuntime.issueAuthorityGrant({ issuerActorId: DATASYS, subjectActorId: VICTOR, trustDomainId: TRUST_DOMAIN, capability: CAPABILITY, actions: [CAPABILITY], resourceScopes: [SCOPE] });
    const presentation = presentAuthority(authorityPresentationService);
    const check = authorityPresentationService.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, true);
  });

  it('2. Authority Graph authority_missing blocks handshake', () => {
    const { authorityPresentationService } = setUp();
    const presentation = presentAuthority(authorityPresentationService, { principalActorId: 'actor-with-no-grant' });
    const check = authorityPresentationService.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, false);
    assert.equal(check.type, 'authority_missing');
  });

  it('3. Authority Graph ancestor_revoked blocks handshake', () => {
    const { authorityRuntime, authorityPresentationService } = setUp();
    const grant = authorityRuntime.issueAuthorityGrant({ issuerActorId: DATASYS, subjectActorId: VICTOR, trustDomainId: TRUST_DOMAIN, capability: CAPABILITY, actions: [CAPABILITY], resourceScopes: [SCOPE] });
    authorityRuntime.revokeAuthorityGrant(grant.id, DATASYS, 'Compliance hold.');
    const presentation = presentAuthority(authorityPresentationService);
    const check = authorityPresentationService.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, false);
    assert.equal(check.type, 'ancestor_revoked');
  });

  it('4. Authority Graph ancestor_expired blocks handshake', () => {
    const { authorityRuntime, authorityPresentationService } = setUp();
    authorityRuntime.issueAuthorityGrant({
      issuerActorId: DATASYS,
      subjectActorId: VICTOR,
      trustDomainId: TRUST_DOMAIN,
      capability: CAPABILITY,
      actions: [CAPABILITY],
      resourceScopes: [SCOPE],
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
    const presentation = presentAuthority(authorityPresentationService);
    const check = authorityPresentationService.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, false);
    assert.equal(check.type, 'ancestor_expired');
  });

  it('5. Authority Graph scope_expansion_detected blocks handshake', () => {
    const { authorityRuntime, authorityPresentationService } = setUp();
    authorityRuntime.issueAuthorityGrant({ issuerActorId: DATASYS, subjectActorId: VICTOR, trustDomainId: TRUST_DOMAIN, capability: CAPABILITY, actions: [CAPABILITY], resourceScopes: [SCOPE] });
    const presentation = presentAuthority(authorityPresentationService, { resourceScopes: ['project:GCH-15992'] });
    const check = authorityPresentationService.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.equal(check.valid, false);
    assert.equal(check.type, 'scope_expansion_detected');
  });

  it('6. Authority Graph proof ID is referenced in HandshakeProof when available', () => {
    const { authorityRuntime, authorityPresentationService, proofService } = setUp();
    authorityRuntime.issueAuthorityGrant({ issuerActorId: DATASYS, subjectActorId: VICTOR, trustDomainId: TRUST_DOMAIN, capability: CAPABILITY, actions: [CAPABILITY], resourceScopes: [SCOPE] });
    const presentation = presentAuthority(authorityPresentationService);
    const check = authorityPresentationService.verifyAuthorityPresentation(presentation, { requestId: 'req-1', trustDomainId: TRUST_DOMAIN, requestedAt: NOW });
    assert.ok(check.authorityProofId);

    const stored = authorityPresentationService.getAuthorityPresentation(presentation.id)!;
    const proof = proofService.createProof({
      handshakeRequestId: 'req-1',
      handshakeDecisionId: 'decision-1',
      localTrustDomainId: TRUST_DOMAIN,
      externalAgentId: 'external-agent-1',
      passportPresentationId: 'passport-1',
      authorityPresentationId: stored.id,
      decisionType: 'accepted',
      accepted: true,
      evidenceHashes: [],
    });
    assert.equal(proof.authorityPresentationId, stored.id);
  });
});
