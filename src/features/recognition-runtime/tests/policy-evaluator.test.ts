import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ActionRequest } from '../domain/action-request.js';
import type { Actor } from '../domain/actor.js';
import type { RecognitionCapabilityToken } from '../domain/capability-token.js';
import type { Passport } from '../domain/passport.js';
import type { PolicyContext } from '../domain/policy.js';
import type { TrustDomain } from '../domain/trust-domain.js';
import { createDefaultPolicyChain } from '../policies/index.js';
import { PolicyEvaluator } from '../services/policy-evaluator.js';

const NOW = '2026-01-01T00:00:00.000Z';

const trustDomain: TrustDomain = {
  id: 'trust-domain-1',
  name: 'Test Domain',
  issuerActorId: 'actor-issuer',
  acceptedIssuerIds: ['actor-issuer'],
  acceptedActorTypes: ['agent', 'human'],
  policyPackIds: [],
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
};

const recognizedAgent: Actor = {
  id: 'actor-agent',
  type: 'agent',
  displayName: 'Test Agent',
  status: 'recognized',
  issuerId: 'actor-issuer',
  trustDomainId: trustDomain.id,
  createdAt: NOW,
  updatedAt: NOW,
};

const passport: Passport = {
  id: 'passport-agent',
  type: 'agent_passport',
  subjectActorId: recognizedAgent.id,
  issuerActorId: 'actor-issuer',
  trustDomainId: trustDomain.id,
  status: 'valid',
  issuedAt: NOW,
  claims: {},
};

const capabilityToken: RecognitionCapabilityToken = {
  id: 'cap-agent',
  subjectActorId: recognizedAgent.id,
  principalActorId: 'actor-issuer',
  issuerActorId: 'actor-issuer',
  trustDomainId: trustDomain.id,
  capability: 'drafting',
  actions: ['draft'],
  resourceScopes: ['project:1'],
  constraints: { prohibitedActions: [] },
  delegation: { delegable: false, delegationDepth: 0, maxDelegationDepth: 0 },
  evidenceRequirements: [],
  riskLevel: 'low',
  status: 'valid',
  issuedAt: NOW,
};

const request: ActionRequest = {
  id: 'request-1',
  actorId: recognizedAgent.id,
  passportId: passport.id,
  capabilityTokenId: capabilityToken.id,
  trustDomainId: trustDomain.id,
  action: 'draft',
  resource: 'project:1',
  requestedAt: NOW,
};

function baseContext(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    now: NOW,
    actor: recognizedAgent,
    trustDomain,
    passport,
    capabilityToken,
    issuerAccepted: true,
    capabilityCheck: { actionGranted: true, prohibited: false, inResourceScope: true },
    revocation: { revoked: false },
    ...overrides,
  };
}

describe('PolicyEvaluator', () => {
  it('allows when every policy passes and reports all policyResults', () => {
    const evaluator = new PolicyEvaluator(createDefaultPolicyChain());
    const result = evaluator.evaluatePolicies(request, baseContext());

    assert.equal(result.decisionType, 'allow');
    assert.equal(result.policyResults.length, 10);
    assert.ok(result.policyResults.every((policyResult) => policyResult.passed));
  });

  it('short-circuits at the first failing policy and stops evaluating the rest', () => {
    const evaluator = new PolicyEvaluator(createDefaultPolicyChain());
    const { actor: _omittedActor, ...contextWithoutActor } = baseContext();
    const result = evaluator.evaluatePolicies(request, contextWithoutActor);

    assert.equal(result.decisionType, 'unrecognized_actor');
    assert.equal(result.policyResults.length, 1);
    assert.equal(result.policyResults[0]?.policyId, 'recognized_actor_required');
  });

  it('rogue_actor_denied still rejects an actor whose type is untrusted even if status claims recognized', () => {
    const spoofedActor: Actor = { ...recognizedAgent, type: 'external' };
    const evaluator = new PolicyEvaluator(createDefaultPolicyChain());
    const result = evaluator.evaluatePolicies(request, baseContext({ actor: spoofedActor }));

    assert.equal(result.decisionType, 'unrecognized_actor');
    assert.equal(result.policyResults.length, 2);
    assert.equal(result.policyResults[1]?.policyId, 'rogue_actor_denied');
  });

  it('revocation_wins over expiry: a revoked-and-expired token reports revoked, not expired', () => {
    const revokedExpiredToken: RecognitionCapabilityToken = { ...capabilityToken, status: 'revoked', expiresAt: '2020-01-01T00:00:00.000Z' };
    const evaluator = new PolicyEvaluator(createDefaultPolicyChain());
    const result = evaluator.evaluatePolicies(
      request,
      baseContext({ capabilityToken: revokedExpiredToken, revocation: { revoked: true, revokedEntityType: 'capability_token', revokedEntityId: revokedExpiredToken.id } }),
    );

    assert.equal(result.decisionType, 'revoked');
  });

  it('reports a generic deny for a suspended actor', () => {
    const suspendedActor: Actor = { ...recognizedAgent, status: 'suspended' };
    const evaluator = new PolicyEvaluator(createDefaultPolicyChain());
    const result = evaluator.evaluatePolicies(request, baseContext({ actor: suspendedActor }));

    assert.equal(result.decisionType, 'deny');
  });

  it('denies prohibited actions before scope is even considered', () => {
    const evaluator = new PolicyEvaluator(createDefaultPolicyChain());
    const result = evaluator.evaluatePolicies(
      request,
      baseContext({ capabilityCheck: { actionGranted: false, prohibited: true, inResourceScope: false } }),
    );

    assert.equal(result.decisionType, 'policy_violation');
    assert.equal(result.reasonCode, 'ACTION_PROHIBITED');
  });
});
