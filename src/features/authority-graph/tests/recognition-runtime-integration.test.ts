import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAuthorityGraphRuntime } from '../runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';
import { createAocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createRuntimeContext } from '../../recognition-runtime/runtime/runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-datasys-agent-republic';
const PROJECT_SCOPE = 'project:HMP-14665';
const OTHER_SCOPE = 'project:GCH-15992';

const DATASYS = 'actor-datasys';
const VICTOR = 'actor-victor-valverde';
const PMFREAK = 'actor-pmfreak-closure-agent';
const UNKNOWN_AGENT = 'actor-unknown-external-agent';

function setUp(options: { readonly victorGrantExpiresAt?: string } = {}) {
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(NOW));
  const recognitionRuntime = createAocRecognitionRuntime(createRuntimeContext(NOW), undefined, authorityRuntime);

  recognitionRuntime.registerActor({ id: DATASYS, type: 'organization', displayName: 'Datasys' });
  recognitionRuntime.createTrustDomain({
    id: TRUST_DOMAIN,
    name: 'Datasys Agent Republic',
    issuerActorId: DATASYS,
    acceptedIssuerIds: [DATASYS],
    acceptedActorTypes: ['human', 'organization', 'agent', 'external'],
  });
  recognitionRuntime.registerActor({ id: VICTOR, type: 'human', displayName: 'Victor Valverde', issuerId: DATASYS, trustDomainId: TRUST_DOMAIN });
  recognitionRuntime.registerActor({
    id: PMFREAK,
    type: 'agent',
    displayName: 'PMFreak Closure Agent',
    issuerId: DATASYS,
    trustDomainId: TRUST_DOMAIN,
  });
  recognitionRuntime.registerActor({ id: UNKNOWN_AGENT, type: 'external', displayName: 'Unknown External Agent', status: 'unknown' });

  const pmfreakPassport = recognitionRuntime.issuePassport({
    type: 'agent_passport',
    subjectActorId: PMFREAK,
    issuerActorId: DATASYS,
    trustDomainId: TRUST_DOMAIN,
  });

  const pmfreakToken = recognitionRuntime.issueCapabilityToken({
    id: 'cap-pmfreak-drafting',
    subjectActorId: PMFREAK,
    principalActorId: VICTOR,
    issuerActorId: VICTOR,
    trustDomainId: TRUST_DOMAIN,
    capability: 'project_closure.drafting',
    actions: ['draft_closure_email', 'summarize_project_status', 'prepare_invoice_support'],
    resourceScopes: [PROJECT_SCOPE, OTHER_SCOPE],
    evidenceRequirements: [{ action: 'draft_closure_email', requiredEvidenceTypes: ['email_thread'] }],
    riskLevel: 'medium',
  });

  const pmfreakApprovalToken = recognitionRuntime.issueCapabilityToken({
    id: 'cap-pmfreak-approval',
    subjectActorId: PMFREAK,
    principalActorId: VICTOR,
    issuerActorId: VICTOR,
    trustDomainId: TRUST_DOMAIN,
    capability: 'project_closure.client_communication',
    actions: ['send_client_follow_up'],
    resourceScopes: [PROJECT_SCOPE],
    approvalRequirement: { actions: ['send_client_follow_up'], requiredApproverActorIds: [VICTOR] },
    riskLevel: 'high',
  });

  const pmfreakApprovePaymentToken = recognitionRuntime.issueCapabilityToken({
    id: 'cap-pmfreak-approve-payment',
    subjectActorId: PMFREAK,
    principalActorId: VICTOR,
    issuerActorId: VICTOR,
    trustDomainId: TRUST_DOMAIN,
    capability: 'payments.approval',
    actions: ['approve_payment'],
    resourceScopes: [PROJECT_SCOPE],
    riskLevel: 'critical',
  });

  const pmfreakExpiredToken = recognitionRuntime.issueCapabilityToken({
    id: 'cap-pmfreak-expired',
    subjectActorId: PMFREAK,
    principalActorId: VICTOR,
    issuerActorId: VICTOR,
    trustDomainId: TRUST_DOMAIN,
    capability: 'project_closure.drafting',
    actions: ['draft_closure_email'],
    resourceScopes: [PROJECT_SCOPE],
    riskLevel: 'medium',
    expiresAt: '2025-01-01T00:00:00.000Z',
  });

  const pmfreakRevokedToken = recognitionRuntime.issueCapabilityToken({
    id: 'cap-pmfreak-revoked',
    subjectActorId: PMFREAK,
    principalActorId: VICTOR,
    issuerActorId: VICTOR,
    trustDomainId: TRUST_DOMAIN,
    capability: 'project_closure.drafting',
    actions: ['draft_closure_email'],
    resourceScopes: [PROJECT_SCOPE],
    riskLevel: 'medium',
  });
  recognitionRuntime.revokeCapabilityToken(pmfreakRevokedToken.id, TRUST_DOMAIN);

  authorityRuntime.registerRootIssuer(TRUST_DOMAIN, DATASYS);
  const victorGrant = authorityRuntime.issueAuthorityGrant({
    issuerActorId: DATASYS,
    subjectActorId: VICTOR,
    trustDomainId: TRUST_DOMAIN,
    capability: 'project_closure.management',
    actions: ['draft_closure_email', 'summarize_project_status', 'send_client_follow_up'],
    resourceScopes: [PROJECT_SCOPE],
    canDelegate: true,
    allowedDelegateActorTypes: ['agent'],
    maxDelegationDepth: 1,
    nonDelegableActions: ['approve_payment'],
    ...(options.victorGrantExpiresAt !== undefined ? { expiresAt: options.victorGrantExpiresAt } : {}),
  });
  const pmfreakDelegation = authorityRuntime.createDelegationGrant({
    delegatorActorId: VICTOR,
    delegateActorId: PMFREAK,
    delegateActorType: 'agent',
    trustDomainId: TRUST_DOMAIN,
    sourceAuthorityGrantId: victorGrant.id,
    capability: 'project_closure.drafting',
    actions: ['draft_closure_email', 'summarize_project_status', 'send_client_follow_up'],
    resourceScopes: [PROJECT_SCOPE],
    canRedelegate: false,
  });

  return {
    recognitionRuntime,
    authorityRuntime,
    pmfreakPassport,
    pmfreakToken,
    pmfreakApprovalToken,
    pmfreakApprovePaymentToken,
    pmfreakExpiredToken,
    pmfreakRevokedToken,
    victorGrant,
    pmfreakDelegation,
  };
}

describe('Recognition Runtime + Authority Graph integration', () => {
  it('1. recognized agent with a valid authority chain can draft the closure email => allow', () => {
    const { recognitionRuntime, pmfreakPassport, pmfreakToken } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: PMFREAK,
        passportId: pmfreakPassport.id,
        capabilityTokenId: pmfreakToken.id,
        trustDomainId: TRUST_DOMAIN,
        action: 'draft_closure_email',
        resource: PROJECT_SCOPE,
        evidence: [{ type: 'email_thread', reference: 'thread:HMP-14665' }],
      }),
    );
    assert.equal(decision.type, 'allow');
    assert.ok(decision.authorityDecisionId);
    assert.ok(decision.authorityProofId);
  });

  it('2. recognized agent without a matching authority chain cannot act', () => {
    const { recognitionRuntime, pmfreakPassport, pmfreakToken } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: PMFREAK,
        passportId: pmfreakPassport.id,
        capabilityTokenId: pmfreakToken.id,
        trustDomainId: TRUST_DOMAIN,
        action: 'prepare_invoice_support',
        resource: PROJECT_SCOPE,
      }),
    );
    assert.ok(decision.type === 'policy_violation' || decision.type === 'invalid_capability');
    assert.equal(decision.reasonCode, 'AUTHORITY_CHAIN_MISSING');
  });

  it('3. recognized agent with revoked ancestor authority => revoked', () => {
    const { recognitionRuntime, authorityRuntime, pmfreakPassport, pmfreakToken, victorGrant } = setUp();
    authorityRuntime.revokeAuthorityGrant(victorGrant.id, DATASYS, "Datasys revoked Victor's authority.");

    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: PMFREAK,
        passportId: pmfreakPassport.id,
        capabilityTokenId: pmfreakToken.id,
        trustDomainId: TRUST_DOMAIN,
        action: 'draft_closure_email',
        resource: PROJECT_SCOPE,
        evidence: [{ type: 'email_thread', reference: 'thread:HMP-14665' }],
      }),
    );
    assert.equal(decision.type, 'revoked');
  });

  it('4. recognized agent with expired ancestor authority => expired', () => {
    const { recognitionRuntime, pmfreakPassport, pmfreakToken } = setUp({ victorGrantExpiresAt: '2025-01-01T00:00:00.000Z' });
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: PMFREAK,
        passportId: pmfreakPassport.id,
        capabilityTokenId: pmfreakToken.id,
        trustDomainId: TRUST_DOMAIN,
        action: 'draft_closure_email',
        resource: PROJECT_SCOPE,
        evidence: [{ type: 'email_thread', reference: 'thread:HMP-14665' }],
      }),
    );
    assert.equal(decision.type, 'expired');
  });

  it('5. recognized agent attempting an out-of-scope project through delegation => out_of_scope', () => {
    const { recognitionRuntime, pmfreakPassport, pmfreakToken } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: PMFREAK,
        passportId: pmfreakPassport.id,
        capabilityTokenId: pmfreakToken.id,
        trustDomainId: TRUST_DOMAIN,
        action: 'draft_closure_email',
        resource: OTHER_SCOPE,
        evidence: [{ type: 'email_thread', reference: 'thread:GCH-15992' }],
      }),
    );
    assert.equal(decision.type, 'out_of_scope');
  });

  it('6. recognized agent attempting a non-delegable action => policy_violation', () => {
    const { recognitionRuntime, authorityRuntime, pmfreakPassport, pmfreakApprovePaymentToken, victorGrant } = setUp();
    authorityRuntime.store.importDelegation({
      id: 'delegation-grant-forged-approve-payment',
      delegatorActorId: VICTOR,
      delegateActorId: PMFREAK,
      principalActorId: VICTOR,
      trustDomainId: TRUST_DOMAIN,
      sourceAuthorityGrantId: victorGrant.id,
      capability: 'payments.approval',
      actions: ['approve_payment'],
      nonDelegableActions: ['approve_payment'],
      resourceScopes: [PROJECT_SCOPE],
      delegationDepth: 1,
      canRedelegate: false,
      status: 'active',
      issuedAt: NOW,
    });

    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: PMFREAK,
        passportId: pmfreakPassport.id,
        capabilityTokenId: pmfreakApprovePaymentToken.id,
        trustDomainId: TRUST_DOMAIN,
        action: 'approve_payment',
        resource: PROJECT_SCOPE,
      }),
    );
    assert.equal(decision.type, 'policy_violation');
  });

  it('7. self-issued agent authority => policy_violation', () => {
    const { recognitionRuntime, authorityRuntime, pmfreakPassport, pmfreakApprovePaymentToken } = setUp();
    authorityRuntime.store.importGrant({
      id: 'authority-grant-forged-self-issued',
      issuerActorId: PMFREAK,
      subjectActorId: PMFREAK,
      trustDomainId: TRUST_DOMAIN,
      capability: 'payments.approval',
      actions: ['approve_payment'],
      resourceScopes: [PROJECT_SCOPE],
      canDelegate: false,
      status: 'active',
      issuedAt: NOW,
    });

    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: PMFREAK,
        passportId: pmfreakPassport.id,
        capabilityTokenId: pmfreakApprovePaymentToken.id,
        trustDomainId: TRUST_DOMAIN,
        action: 'approve_payment',
        resource: PROJECT_SCOPE,
      }),
    );
    assert.equal(decision.type, 'policy_violation');
  });

  it('8. rogue agent still returns unrecognized_actor before authority evaluation', () => {
    const { recognitionRuntime } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: UNKNOWN_AGENT,
        trustDomainId: TRUST_DOMAIN,
        action: 'read_internal_documents',
        resource: 'documents:internal',
      }),
    );
    assert.equal(decision.type, 'unrecognized_actor');
    assert.equal(decision.authorityDecisionId, undefined);
  });

  it('9. missing-evidence scenario still returns require_more_evidence once authority is valid', () => {
    const { recognitionRuntime, pmfreakPassport, pmfreakToken } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: PMFREAK,
        passportId: pmfreakPassport.id,
        capabilityTokenId: pmfreakToken.id,
        trustDomainId: TRUST_DOMAIN,
        action: 'draft_closure_email',
        resource: PROJECT_SCOPE,
      }),
    );
    assert.equal(decision.type, 'require_more_evidence');
    assert.ok(decision.authorityDecisionId);
  });

  it('10. approval scenario still returns require_human_approval once authority is valid', () => {
    const { recognitionRuntime, pmfreakPassport, pmfreakApprovalToken } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: PMFREAK,
        passportId: pmfreakPassport.id,
        capabilityTokenId: pmfreakApprovalToken.id,
        trustDomainId: TRUST_DOMAIN,
        action: 'send_client_follow_up',
        resource: PROJECT_SCOPE,
      }),
    );
    assert.equal(decision.type, 'require_human_approval');
    assert.ok(decision.authorityDecisionId);
  });

  it('11. expired capability token scenario still returns expired', () => {
    const { recognitionRuntime, pmfreakPassport, pmfreakExpiredToken } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: PMFREAK,
        passportId: pmfreakPassport.id,
        capabilityTokenId: pmfreakExpiredToken.id,
        trustDomainId: TRUST_DOMAIN,
        action: 'draft_closure_email',
        resource: PROJECT_SCOPE,
      }),
    );
    assert.equal(decision.type, 'expired');
    assert.equal(decision.authorityDecisionId, undefined);
  });

  it('12. revoked capability token scenario still returns revoked', () => {
    const { recognitionRuntime, pmfreakPassport, pmfreakRevokedToken } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: PMFREAK,
        passportId: pmfreakPassport.id,
        capabilityTokenId: pmfreakRevokedToken.id,
        trustDomainId: TRUST_DOMAIN,
        action: 'draft_closure_email',
        resource: PROJECT_SCOPE,
      }),
    );
    assert.equal(decision.type, 'revoked');
    assert.equal(decision.authorityDecisionId, undefined);
  });
});
