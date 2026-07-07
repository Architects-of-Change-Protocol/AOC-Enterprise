import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createManualClock, createSequentialIdGenerator, type RuntimeContext } from '../../recognition-runtime/runtime/runtime-context.js';
import type { AuthorityGraphIntegration } from '../../recognition-runtime/services/authority-graph-integration.js';
import { createExternalAgentStandingIntegration, createHandshakeRuntimeContext, ExternalAgentHandshakeRuntime } from '../runtime/index.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-datasys-agent-republic';
const EXTERNAL_ACTOR_ID = 'external-agent-partner-research-agent';
const ACTION = 'read_project_summary';
const SCOPE = 'project:HMP-14665';

const INVALID_AUTHORITY_GRAPH: AuthorityGraphIntegration = {
  verifyAuthority(request) {
    return {
      id: 'authority-decision-invalid',
      requestId: request.id,
      type: 'authority_missing',
      valid: false,
      reasonCode: 'AUTHORITY_MISSING',
      reason: 'No authority grant proves this principal delegated to this actor.',
    };
  },
};

function setUpRecognition(handshakeRuntime?: ExternalAgentHandshakeRuntime, authorityGraph?: AuthorityGraphIntegration) {
  const clock = createManualClock(NOW);
  const recognitionCtx: RuntimeContext = { clock, idGenerator: createSequentialIdGenerator() };
  const externalAgentHandshake = handshakeRuntime ? createExternalAgentStandingIntegration(handshakeRuntime) : undefined;
  const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, authorityGraph, undefined, externalAgentHandshake);

  const datasys = recognitionRuntime.registerActor({ id: 'actor-datasys', type: 'organization', displayName: 'Datasys' });
  const trustDomain = recognitionRuntime.createTrustDomain({
    id: TRUST_DOMAIN,
    name: 'Datasys Agent Republic',
    issuerActorId: datasys.id,
    acceptedIssuerIds: [datasys.id],
    acceptedActorTypes: ['human', 'organization', 'agent', 'external'],
  });
  const externalActor = recognitionRuntime.registerActor({
    id: EXTERNAL_ACTOR_ID,
    type: 'external',
    displayName: 'Trusted Partner Research Agent',
    issuerId: datasys.id,
    trustDomainId: trustDomain.id,
  });
  const passport = recognitionRuntime.issuePassport({
    id: 'passport-external-agent',
    type: 'agent_passport',
    subjectActorId: externalActor.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    claims: {},
  });
  const token = recognitionRuntime.issueCapabilityToken({
    id: 'capability-token-external-agent',
    subjectActorId: externalActor.id,
    principalActorId: externalActor.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    capability: 'read_project_summary',
    actions: [ACTION],
    resourceScopes: [SCOPE],
    riskLevel: 'low',
  });

  return { recognitionRuntime, clock, datasys, trustDomain, externalActor, passport, token };
}

function buildAndAcceptHandshake(overrides: { readonly allowedActions?: readonly string[]; readonly allowedResourceScopes?: readonly string[]; readonly allowedCapabilities?: readonly string[] } = {}) {
  const handshakeCtx = createHandshakeRuntimeContext(NOW);
  const runtime = new ExternalAgentHandshakeRuntime(handshakeCtx);
  runtime.registerExternalAgent({ id: EXTERNAL_ACTOR_ID, type: 'agent', status: 'known', displayName: 'Trusted Partner Research Agent' });

  const passportPresentation = runtime.presentPassport({
    externalAgentId: EXTERNAL_ACTOR_ID,
    claimedPassportId: 'claimed-passport-1',
    localTrustDomainId: TRUST_DOMAIN,
  });
  const capabilityRequest = runtime.createCapabilityRequest({
    externalAgentId: EXTERNAL_ACTOR_ID,
    handshakeRequestId: 'handshake-request-1',
    capability: 'read_project_summary',
    actions: [ACTION],
    resourceScopes: [SCOPE],
    riskLevel: 'low',
  });
  const request = runtime.submitHandshakeRequest({
    id: 'handshake-request-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgent: runtime.store.getExternalAgent(EXTERNAL_ACTOR_ID)!,
    passportPresentation,
    requestedCapabilities: [capabilityRequest],
    requestedActions: [ACTION],
    requestedResourceScopes: [SCOPE],
  });

  const result = runtime.decisionService.accept(request.id, 'ACCEPTED', 'Trusted partner accepted.', {});
  if (overrides.allowedActions || overrides.allowedResourceScopes || overrides.allowedCapabilities) {
    runtime.store.updateAgentVisaStatus(result.visa!.id, 'active', {
      allowedActions: overrides.allowedActions ?? result.visa!.allowedActions,
      allowedResourceScopes: overrides.allowedResourceScopes ?? result.visa!.allowedResourceScopes,
      allowedCapabilities: overrides.allowedCapabilities ?? result.visa!.allowedCapabilities,
    });
  }
  return { runtime, ...result };
}

describe('External Agent Handshake + Recognition Runtime integration', () => {
  it('1. external agent without handshake is not recognized', () => {
    const handshakeCtx = createHandshakeRuntimeContext(NOW);
    const handshakeRuntime = new ExternalAgentHandshakeRuntime(handshakeCtx);
    const { recognitionRuntime, externalActor, trustDomain, passport, token } = setUpRecognition(handshakeRuntime);
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: externalActor.id,
        passportId: passport.id,
        capabilityTokenId: token.id,
        trustDomainId: trustDomain.id,
        action: ACTION,
        resource: SCOPE,
      }),
    );
    assert.equal(decision.type, 'unrecognized_actor');
  });

  it('2. external agent with valid visa can proceed to normal recognition checks', () => {
    const { runtime } = buildAndAcceptHandshake();
    const { recognitionRuntime, externalActor, trustDomain, passport, token } = setUpRecognition(runtime);
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({ actorId: externalActor.id, passportId: passport.id, capabilityTokenId: token.id, trustDomainId: trustDomain.id, action: ACTION, resource: SCOPE }),
    );
    assert.equal(decision.type, 'allow');
  });

  it('3. external agent with expired visa is blocked', () => {
    const { runtime, visa } = buildAndAcceptHandshake();
    runtime.expireAgentVisa(visa!.id);
    const { recognitionRuntime, externalActor, trustDomain, passport, token } = setUpRecognition(runtime);
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({ actorId: externalActor.id, passportId: passport.id, capabilityTokenId: token.id, trustDomainId: trustDomain.id, action: ACTION, resource: SCOPE }),
    );
    assert.equal(decision.type, 'expired');
  });

  it('4. external agent with revoked visa is blocked', () => {
    const { runtime, visa } = buildAndAcceptHandshake();
    runtime.revokeAgentVisa(visa!.id, 'actor-admin', 'Compliance hold.');
    const { recognitionRuntime, externalActor, trustDomain, passport, token } = setUpRecognition(runtime);
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({ actorId: externalActor.id, passportId: passport.id, capabilityTokenId: token.id, trustDomainId: trustDomain.id, action: ACTION, resource: SCOPE }),
    );
    assert.equal(decision.type, 'revoked');
  });

  it('5. external agent with scope-denied visa is blocked', () => {
    const { runtime } = buildAndAcceptHandshake({ allowedResourceScopes: ['project:other'] });
    const { recognitionRuntime, externalActor, trustDomain, passport, token } = setUpRecognition(runtime);
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({ actorId: externalActor.id, passportId: passport.id, capabilityTokenId: token.id, trustDomainId: trustDomain.id, action: ACTION, resource: SCOPE }),
    );
    assert.equal(decision.type, 'out_of_scope');
  });

  it('6. external agent with capability-denied visa is blocked', () => {
    const { runtime } = buildAndAcceptHandshake({ allowedCapabilities: ['submit_project_update'] });
    const { recognitionRuntime, externalActor, trustDomain, passport, token } = setUpRecognition(runtime);
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({ actorId: externalActor.id, passportId: passport.id, capabilityTokenId: token.id, trustDomainId: trustDomain.id, action: ACTION, resource: SCOPE }),
    );
    assert.equal(decision.type, 'invalid_capability');
  });

  it('7. external standing does not override invalid passport', () => {
    const { runtime } = buildAndAcceptHandshake();
    const { recognitionRuntime, externalActor, trustDomain, token } = setUpRecognition(runtime);
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({ actorId: externalActor.id, capabilityTokenId: token.id, trustDomainId: trustDomain.id, action: ACTION, resource: SCOPE }),
    );
    assert.equal(decision.type, 'invalid_passport');
  });

  it('8. external standing does not override revoked capability', () => {
    const { runtime } = buildAndAcceptHandshake();
    const { recognitionRuntime, externalActor, trustDomain, passport, token } = setUpRecognition(runtime);
    recognitionRuntime.revokeCapabilityToken(token.id, trustDomain.id);
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({ actorId: externalActor.id, passportId: passport.id, capabilityTokenId: token.id, trustDomainId: trustDomain.id, action: ACTION, resource: SCOPE }),
    );
    assert.equal(decision.type, 'revoked');
  });

  it('9. external standing does not override invalid authority chain', () => {
    const { runtime } = buildAndAcceptHandshake();
    const { recognitionRuntime, externalActor, trustDomain, passport, token } = setUpRecognition(runtime, INVALID_AUTHORITY_GRAPH);
    // A principalActorId different from the acting actor forces Authority Graph to prove the
    // delegation chain; the mocked integration always denies it. Even though the external agent's
    // handshake standing is fully valid, that denial must still win.
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: externalActor.id,
        passportId: passport.id,
        capabilityTokenId: token.id,
        principalActorId: 'actor-unrelated-principal',
        trustDomainId: trustDomain.id,
        action: ACTION,
        resource: SCOPE,
      }),
    );
    assert.notEqual(decision.type, 'allow');
    assert.equal(decision.reasonCode, 'AUTHORITY_MISSING');
  });

  it('10. existing Recognition Runtime behavior unchanged when handshake integration omitted', () => {
    // Without External Agent Handshake wired in, RogueActorPolicy's unconditional rule against
    // actor.type 'external' is exactly what ran before this sprint -- unchanged.
    const { recognitionRuntime, externalActor, trustDomain, passport, token } = setUpRecognition(undefined);
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({ actorId: externalActor.id, passportId: passport.id, capabilityTokenId: token.id, trustDomainId: trustDomain.id, action: ACTION, resource: SCOPE }),
    );
    assert.equal(decision.type, 'unrecognized_actor');
    assert.equal(decision.reasonCode, 'ROGUE_ACTOR_TYPE');
  });
});
