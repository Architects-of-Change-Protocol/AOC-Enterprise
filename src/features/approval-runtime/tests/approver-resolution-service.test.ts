import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import { createApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { createStoreApprovalActorRecognitionIntegration } from '../services/approval-actor-recognition-integration.js';
import type { ApprovalAuthorityGraphIntegration, ApprovalAuthorityVerificationInput, ApprovalAuthorityVerificationResult } from '../services/approval-authority-graph-integration.js';
import { ApprovalLedger } from '../services/approval-ledger.js';
import { ApprovalStore } from '../services/approval-store.js';
import { ApproverResolutionService, type ApproverRoleLookup } from '../services/approver-resolution-service.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';
const PROJECT_SCOPE = 'project:HMP-14665';
const OTHER_SCOPE = 'project:GCH-15992';

function baseRequirement(overrides: Partial<ApprovalRequirement> = {}): ApprovalRequirement {
  return {
    id: 'approval-requirement-1',
    type: 'single_approval',
    trustDomainId: TRUST_DOMAIN,
    action: 'send_client_follow_up',
    resourceScope: PROJECT_SCOPE,
    riskLevel: 'high',
    minimumApprovals: 1,
    requiresSegregationOfDuties: false,
    evidenceRequirements: [],
    ...overrides,
  };
}

function buildRequest(requirement: ApprovalRequirement, overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'approval-request-1',
    trustDomainId: TRUST_DOMAIN,
    actionRequestId: 'action-request-1',
    requestedByActorId: 'actor-pmfreak',
    targetActorId: 'actor-pmfreak',
    action: requirement.action,
    resourceScope: requirement.resourceScope,
    riskLevel: requirement.riskLevel,
    requirement,
    status: 'pending',
    evidence: [],
    createdAt: NOW,
    ...overrides,
  };
}

function createAuthorityGraphMock(): ApprovalAuthorityGraphIntegration {
  return {
    verifyAuthority(input: ApprovalAuthorityVerificationInput): ApprovalAuthorityVerificationResult {
      if (input.actorId === 'actor-victor' && input.action === 'approve_client_communication') {
        if (input.resourceScope !== PROJECT_SCOPE) {
          return { type: 'scope_expansion_detected', valid: false, reasonCode: 'SCOPE_EXPANSION_DETECTED', reason: 'Victor holds no authority over this scope.' };
        }
        return { type: 'authority_valid', valid: true, reasonCode: 'AUTHORITY_VALID', reason: 'Victor holds authority.', authorityDecisionId: 'authority-decision-victor' };
      }
      if ((input.actorId === 'actor-authority-approver' || input.actorId === 'actor-rogue') && input.action === 'approve_project_action') {
        return { type: 'authority_valid', valid: true, reasonCode: 'AUTHORITY_VALID', reason: 'Authority present.' };
      }
      return { type: 'authority_missing', valid: false, reasonCode: 'AUTHORITY_MISSING', reason: 'No authority chain exists.' };
    },
  };
}

function setUp(options: { readonly authorityGraph?: ApprovalAuthorityGraphIntegration; readonly roleLookup?: ApproverRoleLookup } = {}) {
  const ctx = createApprovalRuntimeContext(NOW);
  const store = new ApprovalStore();
  const ledger = new ApprovalLedger(ctx);
  const recognition = createStoreApprovalActorRecognitionIntegration(store);
  const service = new ApproverResolutionService(ctx, store, ledger, recognition, options.authorityGraph, options.roleLookup ?? (() => []));
  store.registerApproverRecognitionStatus('actor-victor', 'recognized');
  return { ctx, store, ledger, service };
}

describe('ApproverResolutionService', () => {
  it('1. resolves Victor as valid approver for HMP-14665', () => {
    const { service } = setUp({ authorityGraph: createAuthorityGraphMock() });
    const requirement = baseRequirement({ requiredAuthorityCapability: 'approve_client_communication' });
    const request = buildRequest(requirement);
    const resolution = service.resolveApprovers({ request, candidateActorIds: ['actor-victor'] });
    assert.equal(resolution.status, 'approvers_found');
    assert.deepEqual(resolution.validApproverActorIds, ['actor-victor']);
  });

  it('2. rejects Unknown External Agent as approver', () => {
    const { service } = setUp();
    const requirement = baseRequirement();
    const request = buildRequest(requirement);
    const resolution = service.resolveApprovers({ request, candidateActorIds: ['actor-unknown-external-agent'] });
    assert.equal(resolution.status, 'no_valid_approver');
    assert.deepEqual(resolution.rejectedCandidateActorIds, ['actor-unknown-external-agent']);
  });

  it('3. rejects out-of-scope approver', () => {
    const { service } = setUp({ authorityGraph: createAuthorityGraphMock() });
    const requirement = baseRequirement({ requiredAuthorityCapability: 'approve_client_communication', resourceScope: OTHER_SCOPE });
    const request = buildRequest(requirement);
    const resolution = service.resolveApprovers({ request, candidateActorIds: ['actor-victor'] });
    assert.equal(resolution.status, 'out_of_scope');
  });

  it('4. rejects requester as approver when segregation is required', () => {
    const { service } = setUp();
    const requirement = baseRequirement({ requiresSegregationOfDuties: true, requiredApproverActorIds: ['actor-victor'] });
    const request = buildRequest(requirement, { requestedByActorId: 'actor-victor', targetActorId: 'actor-pmfreak' });
    const resolution = service.resolveApprovers({ request });
    assert.equal(resolution.status, 'conflict_of_interest');
  });

  it('5. resolves role-based approver', () => {
    const roleLookup: ApproverRoleLookup = (roleId) => (roleId === 'role-approver' ? ['actor-role-approver'] : []);
    const { service, store } = setUp({ roleLookup });
    store.registerApproverRecognitionStatus('actor-role-approver', 'recognized');
    const requirement = baseRequirement({ requiredApproverRoleIds: ['role-approver'] });
    const request = buildRequest(requirement);
    const resolution = service.resolveApprovers({ request });
    assert.equal(resolution.status, 'approvers_found');
    assert.deepEqual(resolution.validApproverActorIds, ['actor-role-approver']);
  });

  it('6. resolves authority-based approver', () => {
    const { service, store } = setUp({ authorityGraph: createAuthorityGraphMock() });
    store.registerApproverRecognitionStatus('actor-authority-approver', 'recognized');
    const requirement = baseRequirement({ requiredAuthorityCapability: 'approve_project_action' });
    const request = buildRequest(requirement);
    const resolution = service.resolveApprovers({ request, candidateActorIds: ['actor-authority-approver'] });
    assert.equal(resolution.status, 'approvers_found');
    assert.deepEqual(resolution.validApproverActorIds, ['actor-authority-approver']);
  });

  it('7. resolves dual approver candidates', () => {
    const { service, store } = setUp();
    store.registerApproverRecognitionStatus('actor-finance-approver', 'recognized');
    const requirement = baseRequirement({ requiredApproverActorIds: ['actor-victor', 'actor-finance-approver'], minimumApprovals: 2 });
    const request = buildRequest(requirement);
    const resolution = service.resolveApprovers({ request });
    assert.equal(resolution.status, 'approvers_found');
    assert.equal(resolution.validApproverActorIds.length, 2);
  });

  it('8. returns no_valid_approver when none found', () => {
    const { service } = setUp();
    const requirement = baseRequirement();
    const request = buildRequest(requirement);
    const resolution = service.resolveApprovers({ request, candidateActorIds: ['actor-nobody'] });
    assert.equal(resolution.status, 'no_valid_approver');
  });

  it('9. uses Authority Graph to validate approver authority', () => {
    const { service } = setUp({ authorityGraph: createAuthorityGraphMock() });
    const requirement = baseRequirement({ requiredAuthorityCapability: 'approve_project_action' });
    const request = buildRequest(requirement);
    const resolution = service.resolveApprovers({ request, candidateActorIds: ['actor-victor'] });
    assert.equal(resolution.status, 'authority_missing');
  });

  it('10. does not override rogue actor classification', () => {
    const { service, store } = setUp({ authorityGraph: createAuthorityGraphMock() });
    store.registerApproverRecognitionStatus('actor-rogue', 'rogue');
    const requirement = baseRequirement({ requiredAuthorityCapability: 'approve_project_action' });
    const request = buildRequest(requirement);
    const resolution = service.resolveApprovers({ request, candidateActorIds: ['actor-rogue'] });
    assert.equal(resolution.status, 'no_valid_approver');
    assert.deepEqual(resolution.rejectedCandidateActorIds, ['actor-rogue']);
  });

  it('11. records approvers_resolved event', () => {
    const { service, ledger } = setUp({ authorityGraph: createAuthorityGraphMock() });
    const requirement = baseRequirement({ requiredAuthorityCapability: 'approve_client_communication' });
    const request = buildRequest(requirement);
    service.resolveApprovers({ request, candidateActorIds: ['actor-victor'] });
    const events = ledger.getEventTrail({ approvalRequestId: request.id });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, 'approvers_resolved');
  });
});
