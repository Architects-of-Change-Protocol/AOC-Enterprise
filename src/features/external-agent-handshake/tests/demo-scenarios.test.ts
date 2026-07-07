import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ApprovalRuntime } from '../../approval-runtime/runtime/approval-runtime.js';
import { createApprovalRuntimeContext } from '../../approval-runtime/runtime/approval-runtime-context.js';
import { createAocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createManualClock, createSequentialIdGenerator, type RuntimeContext } from '../../recognition-runtime/runtime/runtime-context.js';
import { submitApprovalRequiredHandshakeRequest } from '../fixtures/approval-required-handshake.fixture.js';
import {
  APPROVE_PAYMENT_ACTION,
  OTHER_PROJECT_SCOPE,
  PROJECT_SCOPE,
  READ_PROJECT_SUMMARY,
  REVOKED_ISSUER_AGENT_ID,
  TRUST_DOMAIN_ID,
  TRUSTED_PARTNER_AGENT_ID,
  UNKNOWN_AGENT_ID,
  buildDatasysHandshakeWorld,
} from '../fixtures/datasys-handshake.fixture.js';
import { submitExpiredPassportHandshakeRequest } from '../fixtures/invalid-passport.fixture.js';
import { submitTrustedPartnerHandshakeRequest } from '../fixtures/known-partner-agent.fixture.js';
import { submitRevokedIssuerHandshakeRequest } from '../fixtures/revoked-issuer.fixture.js';
import { submitUnknownAgentHandshakeRequest } from '../fixtures/unknown-agent.fixture.js';
import { createExternalAgentStandingIntegration, createHandshakeRuntimeContext, ExternalAgentHandshakeRuntime } from '../runtime/index.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUpHandshakeRuntime() {
  const ctx = createHandshakeRuntimeContext(NOW);
  const runtime = new ExternalAgentHandshakeRuntime(ctx);
  const world = buildDatasysHandshakeWorld(runtime);
  return { runtime, world, ctx };
}

describe('External Agent Handshake demo scenarios', () => {
  it('1. Trusted Partner Research Agent completes handshake for read_project_summary on project:HMP-14665', () => {
    const { runtime } = setUpHandshakeRuntime();
    const request = submitTrustedPartnerHandshakeRequest(runtime);
    const result = runtime.decideHandshake(request.id);

    assert.ok(result.decision.type === 'accepted' || result.decision.type === 'accepted_limited');
    assert.ok(result.visa);
    assert.equal(result.visa?.status, 'active');
    assert.ok(result.ingressGrant);
    assert.equal(result.ingressGrant?.status, 'active');
    assert.ok(result.proof);

    const standing = runtime.verifyVisaForAction({
      localTrustDomainId: TRUST_DOMAIN_ID,
      externalAgentId: TRUSTED_PARTNER_AGENT_ID,
      action: READ_PROJECT_SUMMARY,
      resourceScope: PROJECT_SCOPE,
      requestedAt: NOW,
    });
    assert.equal(standing.type, 'standing_valid');
  });

  it('2. Trusted Partner Research Agent tries project:GCH-15992', () => {
    const { runtime } = setUpHandshakeRuntime();
    const request = submitTrustedPartnerHandshakeRequest(runtime, { id: 'handshake-out-of-scope', resourceScope: OTHER_PROJECT_SCOPE });
    const result = runtime.decideHandshake(request.id);

    assert.equal(result.decision.type, 'rejected');
    assert.equal(result.decision.reasonCode, 'SCOPE_DENIED');
    assert.equal(result.visa, undefined);
  });

  it('3. Unknown External Agent requests read_project_summary', () => {
    const { runtime } = setUpHandshakeRuntime();
    const request = submitUnknownAgentHandshakeRequest(runtime);
    const result = runtime.decideHandshake(request.id);

    assert.ok(result.decision.type === 'requires_approval' || result.decision.type === 'quarantined');
  });

  it('4. Unknown External Agent requests approve_payment', () => {
    const { runtime } = setUpHandshakeRuntime();
    const request = submitUnknownAgentHandshakeRequest(runtime, {
      id: 'handshake-unknown-approve-payment',
      capability: APPROVE_PAYMENT_ACTION,
      actions: [APPROVE_PAYMENT_ACTION],
    });
    const result = runtime.decideHandshake(request.id);

    assert.equal(result.decision.type, 'rejected');
    assert.equal(result.visa, undefined);
  });

  it('5. Revoked Issuer Agent attempts handshake', () => {
    const { runtime } = setUpHandshakeRuntime();
    const request = submitRevokedIssuerHandshakeRequest(runtime);
    const result = runtime.decideHandshake(request.id);

    assert.equal(result.decision.type, 'rejected');
    assert.equal(result.decision.reasonCode, 'ISSUER_REVOKED');
  });

  it('6. Expired Passport Agent attempts handshake', () => {
    const { runtime } = setUpHandshakeRuntime();
    const request = submitExpiredPassportHandshakeRequest(runtime);
    const result = runtime.decideHandshake(request.id);

    assert.equal(result.decision.type, 'rejected');
    assert.equal(result.decision.reasonCode, 'PASSPORT_EXPIRED');
  });

  it('7. high-risk external request requires approval; Victor approves through Approval Runtime', () => {
    const approvalRuntime = new ApprovalRuntime(createApprovalRuntimeContext(NOW));
    approvalRuntime.registerApproverRecognitionStatus('actor-victor-valverde', 'recognized');

    const ctx = createHandshakeRuntimeContext(NOW);
    const runtime = new ExternalAgentHandshakeRuntime(ctx, { approvalRuntime });
    buildDatasysHandshakeWorld(runtime);
    runtime.registerExternalAgent({
      id: 'external-agent-limited-partner-reporting-agent',
      type: 'agent',
      status: 'known',
      displayName: 'Limited Partner Reporting Agent',
      externalIssuerId: 'external-issuer-limited-partner-org',
      responsibleHumanActorId: 'actor-external-agent-owner',
    });

    const request = submitApprovalRequiredHandshakeRequest(runtime);
    const pending = runtime.decideHandshake(request.id);
    assert.equal(pending.decision.type, 'requires_approval');
    assert.ok(pending.request.approvalRequestId);

    approvalRuntime.approve({ approvalRequestId: pending.request.approvalRequestId!, approverActorId: 'actor-victor-valverde', evidenceReviewed: [] });

    const decided = runtime.decideHandshake(request.id);
    assert.ok(decided.decision.type === 'accepted' || decided.decision.type === 'accepted_limited');
    assert.ok(decided.visa);
    assert.ok(decided.proof?.approvalProofId);
  });

  it('8. visa expires', () => {
    const { runtime } = setUpHandshakeRuntime();
    const request = submitTrustedPartnerHandshakeRequest(runtime);
    const result = runtime.decideHandshake(request.id);
    runtime.expireAgentVisa(result.visa!.id);

    const standing = runtime.verifyExternalStanding({
      actorId: TRUSTED_PARTNER_AGENT_ID,
      trustDomainId: TRUST_DOMAIN_ID,
      action: READ_PROJECT_SUMMARY,
      resourceScope: PROJECT_SCOPE,
      requestedAt: NOW,
    });
    assert.equal(standing.type, 'visa_expired');
  });

  it('9. visa revoked', () => {
    const { runtime } = setUpHandshakeRuntime();
    const request = submitTrustedPartnerHandshakeRequest(runtime);
    const result = runtime.decideHandshake(request.id);
    runtime.revokeAgentVisa(result.visa!.id, 'actor-datasys', 'Compliance hold.');

    const standing = runtime.verifyExternalStanding({
      actorId: TRUSTED_PARTNER_AGENT_ID,
      trustDomainId: TRUST_DOMAIN_ID,
      action: READ_PROJECT_SUMMARY,
      resourceScope: PROJECT_SCOPE,
      requestedAt: NOW,
    });
    assert.equal(standing.type, 'visa_revoked');
  });

  it('10. external standing does not override local Recognition Runtime denial', () => {
    const { runtime } = setUpHandshakeRuntime();
    const request = submitTrustedPartnerHandshakeRequest(runtime);
    runtime.decideHandshake(request.id);

    const recognitionCtx: RuntimeContext = { clock: createManualClock(NOW), idGenerator: createSequentialIdGenerator() };
    const externalAgentHandshake = createExternalAgentStandingIntegration(runtime);
    const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, undefined, undefined, externalAgentHandshake);

    const datasys = recognitionRuntime.registerActor({ id: 'actor-datasys', type: 'organization', displayName: 'Datasys' });
    const trustDomain = recognitionRuntime.createTrustDomain({
      id: TRUST_DOMAIN_ID,
      name: 'Datasys Agent Republic',
      issuerActorId: datasys.id,
      acceptedIssuerIds: [datasys.id],
      acceptedActorTypes: ['human', 'organization', 'agent', 'external'],
    });
    const externalActor = recognitionRuntime.registerActor({ id: TRUSTED_PARTNER_AGENT_ID, type: 'external', displayName: 'Trusted Partner Research Agent', issuerId: datasys.id, trustDomainId: trustDomain.id });
    const passport = recognitionRuntime.issuePassport({ id: 'passport-tp', type: 'agent_passport', subjectActorId: externalActor.id, issuerActorId: datasys.id, trustDomainId: trustDomain.id, claims: {} });
    const token = recognitionRuntime.issueCapabilityToken({
      id: 'capability-token-tp',
      subjectActorId: externalActor.id,
      principalActorId: externalActor.id,
      issuerActorId: datasys.id,
      trustDomainId: trustDomain.id,
      capability: 'read_project_summary',
      actions: [READ_PROJECT_SUMMARY],
      resourceScopes: [PROJECT_SCOPE],
      riskLevel: 'low',
    });
    recognitionRuntime.revokeCapabilityToken(token.id, trustDomain.id);

    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({ actorId: externalActor.id, passportId: passport.id, capabilityTokenId: token.id, trustDomainId: trustDomain.id, action: READ_PROJECT_SUMMARY, resource: PROJECT_SCOPE }),
    );
    assert.equal(decision.type, 'revoked');
  });
});
