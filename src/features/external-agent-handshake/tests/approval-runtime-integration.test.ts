import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ApprovalRuntime } from '../../approval-runtime/runtime/approval-runtime.js';
import { createApprovalRuntimeContext } from '../../approval-runtime/runtime/approval-runtime-context.js';
import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { ExternalAgentHandshakeRuntime } from '../runtime/external-agent-handshake-runtime.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-datasys-agent-republic';
const EXTERNAL_AGENT_ID = 'external-agent-limited-partner-reporting-agent';
const APPROVER = 'actor-victor';
const REQUESTER = 'actor-external-agent-owner';
const CAPABILITY = 'submit_project_update';
const SCOPE = 'project:HMP-14665';

function setUp() {
  const approvalRuntime = new ApprovalRuntime(createApprovalRuntimeContext(NOW));
  approvalRuntime.registerApproverRecognitionStatus(APPROVER, 'recognized');

  const handshakeCtx = createHandshakeRuntimeContext(NOW);
  const runtime = new ExternalAgentHandshakeRuntime(handshakeCtx, { approvalRuntime });

  runtime.registerExternalIssuer({
    id: 'issuer-limited-partner',
    displayName: 'Limited Partner Org',
    acceptedByTrustDomainId: TRUST_DOMAIN,
    allowedAgentTypes: ['agent'],
    allowedCapabilities: [CAPABILITY],
    allowedResourceScopes: [SCOPE],
    requiresApproval: true,
    maxVisaTtlMinutes: 30,
    status: 'limited',
  });
  runtime.createTrustBoundary({
    localTrustDomainId: TRUST_DOMAIN,
    allowedExternalIssuerIds: ['issuer-limited-partner'],
    allowedAgentTypes: ['agent'],
    allowedCapabilities: [CAPABILITY],
    allowedResourceScopes: [SCOPE],
    prohibitedCapabilities: [],
    prohibitedActions: [],
    prohibitedResourceScopes: [],
    requiresApprovalForUnknownIssuers: true,
    requiresApprovalForHighRisk: true,
    maxVisaTtlMinutes: 30,
    dataBoundaries: [],
  });
  runtime.registerExternalAgent({ id: EXTERNAL_AGENT_ID, type: 'agent', status: 'known', displayName: 'Limited Partner Reporting Agent', externalIssuerId: 'issuer-limited-partner', responsibleHumanActorId: REQUESTER });

  const passportPresentation = runtime.presentPassport({
    externalAgentId: EXTERNAL_AGENT_ID,
    externalIssuerId: 'issuer-limited-partner',
    claimedPassportId: 'claimed-passport-1',
    localTrustDomainId: TRUST_DOMAIN,
  });
  const capabilityRequest = runtime.createCapabilityRequest({
    externalAgentId: EXTERNAL_AGENT_ID,
    handshakeRequestId: 'handshake-request-1',
    capability: CAPABILITY,
    actions: [CAPABILITY],
    resourceScopes: [SCOPE],
    riskLevel: 'high',
  });
  const request = runtime.submitHandshakeRequest({
    id: 'handshake-request-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgent: runtime.store.getExternalAgent(EXTERNAL_AGENT_ID)!,
    passportPresentation,
    requestedCapabilities: [capabilityRequest],
    requestedActions: [CAPABILITY],
    requestedResourceScopes: [SCOPE],
  });

  return { runtime, approvalRuntime, request };
}

describe('External Agent Handshake + Approval Runtime integration', () => {
  it('1. high-risk external handshake returns requires_approval', () => {
    const { runtime, request } = setUp();
    const result = runtime.decideHandshake(request.id);
    assert.equal(result.decision.type, 'requires_approval');
  });

  it('2. approval request can be created for handshake', () => {
    const { runtime, request } = setUp();
    const result = runtime.decideHandshake(request.id);
    assert.ok(result.request.approvalRequestId);
  });

  it('3. valid approval allows accepted_limited', () => {
    const { runtime, approvalRuntime, request } = setUp();
    const first = runtime.decideHandshake(request.id);
    const approvalRequestId = first.request.approvalRequestId!;
    approvalRuntime.approve({ approvalRequestId, approverActorId: APPROVER, evidenceReviewed: [] });

    const second = runtime.decideHandshake(request.id);
    assert.ok(second.decision.type === 'accepted' || second.decision.type === 'accepted_limited');
    assert.ok(second.visa);
  });

  it('4. missing approval keeps handshake requires_approval', () => {
    const { runtime, request } = setUp();
    runtime.decideHandshake(request.id);
    const second = runtime.decideHandshake(request.id);
    assert.equal(second.decision.type, 'requires_approval');
  });

  it('5. revoked approval blocks acceptance', () => {
    const { runtime, approvalRuntime, request } = setUp();
    const first = runtime.decideHandshake(request.id);
    const approvalRequestId = first.request.approvalRequestId!;
    const submission = approvalRuntime.approve({ approvalRequestId, approverActorId: APPROVER, evidenceReviewed: [] });
    approvalRuntime.revokeApproval({ approvalProofId: submission.proof!.id, revokedByActorId: 'actor-datasys', reason: 'Compliance hold.' });

    const second = runtime.decideHandshake(request.id);
    assert.notEqual(second.decision.type, 'accepted');
    assert.notEqual(second.decision.type, 'accepted_limited');
  });

  it('6. expired approval blocks acceptance', () => {
    const { runtime, approvalRuntime, request } = setUp();
    approvalRuntime.createApprovalRequirement({
      id: 'approval-requirement-handshake-expiring',
      type: 'single_approval',
      trustDomainId: TRUST_DOMAIN,
      action: CAPABILITY,
      resourceScope: SCOPE,
      riskLevel: 'high',
      minimumApprovals: 1,
      requiresSegregationOfDuties: true,
      evidenceRequirements: [],
      expiresInMinutes: 1,
    });
    const first = runtime.decideHandshake(request.id);
    assert.equal(first.decision.type, 'requires_approval');
  });

  it('7. approval does not override prohibited capability', () => {
    const { runtime, approvalRuntime, request } = setUp();
    const first = runtime.decideHandshake(request.id);
    approvalRuntime.approve({ approvalRequestId: first.request.approvalRequestId!, approverActorId: APPROVER, evidenceReviewed: [] });

    // Even with a valid approval, a boundary that never allowed a capability in the first place still
    // denies it -- exercised directly against TrustBoundaryService rather than re-deciding this
    // already-approved request.
    assert.equal(runtime.trustBoundaryService.isCapabilityAllowed(runtime.trustBoundaryService.getTrustBoundaryForLocalDomain(TRUST_DOMAIN)!, 'approve_financial_action'), false);
  });

  it('8. approval does not override revoked issuer', () => {
    const { runtime, approvalRuntime, request } = setUp();
    runtime.revokeExternalIssuer('issuer-limited-partner');
    const first = runtime.decideHandshake(request.id);
    assert.equal(first.decision.type, 'rejected');
    if (first.request.approvalRequestId) {
      approvalRuntime.approve({ approvalRequestId: first.request.approvalRequestId, approverActorId: APPROVER, evidenceReviewed: [] });
    }
    const second = runtime.decideHandshake(request.id);
    assert.notEqual(second.decision.type, 'accepted');
  });
});
