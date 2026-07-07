import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ApprovalDecision } from '../domain/approval-decision.js';
import type { ApprovalAuthorityCheckResult, ApprovalDecisionAttempt, ApprovalPolicyContext } from '../domain/approval-policy.js';
import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import { createDefaultApprovalPolicyChain, RevocationPolicy } from '../policies/index.js';
import { ApprovalPolicyEvaluator } from '../services/approval-policy-evaluator.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';
const PROJECT_SCOPE = 'project:HMP-14665';

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

function buildAttempt(overrides: Partial<ApprovalDecisionAttempt> = {}): ApprovalDecisionAttempt {
  return { approverActorId: 'actor-victor', type: 'approved', evidenceReviewed: [], ...overrides };
}

type ContextOverrides = Partial<Omit<ApprovalPolicyContext, 'request'>> & { readonly request?: ApprovalRequest | undefined };

function buildContext(overrides: ContextOverrides = {}): ApprovalPolicyContext {
  const { request, ...rest } = overrides;
  const resolvedRequest = request === undefined && !('request' in overrides) ? buildRequest(baseRequirement()) : request;
  return {
    now: NOW,
    attempt: buildAttempt(),
    approverRecognition: { recognized: true, reasonCode: 'APPROVER_RECOGNIZED', reason: 'ok' },
    priorDecisions: [],
    ...rest,
    ...(resolvedRequest !== undefined ? { request: resolvedRequest } : {}),
  };
}

function priorApprovedDecision(overrides: Partial<ApprovalDecision> = {}): ApprovalDecision {
  return {
    id: 'approval-decision-prior',
    approvalRequestId: 'approval-request-1',
    trustDomainId: TRUST_DOMAIN,
    approverActorId: 'actor-victor',
    type: 'approved',
    approved: true,
    reasonCode: 'ALL_APPROVAL_POLICIES_SATISFIED',
    evidenceReviewed: [],
    decidedAt: NOW,
    ...overrides,
  };
}

describe('ApprovalPolicyEvaluator', () => {
  it('1. valid approval passes all policies', () => {
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const result = evaluator.evaluate(buildContext());
    assert.equal(result.passed, true);
    assert.equal(result.decisionType, 'approved');
    assert.equal(result.policyResults.length, 10);
    assert.ok(result.policyResults.every((policyResult) => policyResult.passed));
  });

  it('2. missing request fails valid_approval_request_policy', () => {
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const context = buildContext({ request: undefined });
    const result = evaluator.evaluate(context);
    assert.equal(result.passed, false);
    assert.equal(result.policyResults.at(-1)?.policyId, 'valid_approval_request');
  });

  it('3. invalid approver fails recognized_approver_policy', () => {
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const context = buildContext({ approverRecognition: { recognized: false, reasonCode: 'APPROVER_UNKNOWN', reason: 'unknown actor' } });
    const result = evaluator.evaluate(context);
    assert.equal(result.passed, false);
    assert.equal(result.decisionType, 'invalid_approver');
    assert.equal(result.policyResults.at(-1)?.policyId, 'recognized_approver');
  });

  it('4. missing authority fails approver_authority_policy', () => {
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const requirement = baseRequirement({ requiredAuthorityCapability: 'approve_client_communication' });
    const context = buildContext({ request: buildRequest(requirement) });
    const result = evaluator.evaluate(context);
    assert.equal(result.passed, false);
    assert.equal(result.policyResults.at(-1)?.policyId, 'approver_authority');
    assert.equal(result.reasonCode, 'APPROVER_AUTHORITY_MISSING');
  });

  it('5. out of scope fails approval_scope_policy', () => {
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const requirement = baseRequirement({ requiredAuthorityCapability: 'approve_client_communication' });
    const authorityCheck: ApprovalAuthorityCheckResult = {
      valid: false,
      type: 'scope_expansion_detected',
      reasonCode: 'SCOPE_EXPANSION_DETECTED',
      reason: 'out of scope',
    };
    const context = buildContext({ request: buildRequest(requirement), authorityCheck });
    const result = evaluator.evaluate(context);
    assert.equal(result.passed, false);
    assert.equal(result.decisionType, 'out_of_scope');
    assert.equal(result.policyResults.at(-1)?.policyId, 'approval_scope');
  });

  it('6. missing evidence fails approval_evidence_policy', () => {
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const requirement = baseRequirement({
      evidenceRequirements: [{ id: 'evidence-req-1', type: 'email_draft', required: true, description: 'Client email draft.' }],
    });
    const context = buildContext({ request: buildRequest(requirement) });
    const result = evaluator.evaluate(context);
    assert.equal(result.passed, false);
    assert.equal(result.decisionType, 'insufficient_evidence');
    assert.equal(result.policyResults.at(-1)?.policyId, 'approval_evidence');
  });

  it('7. self-approval fails segregation_of_duties_policy', () => {
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const requirement = baseRequirement({ requiresSegregationOfDuties: true });
    const request = buildRequest(requirement, { requestedByActorId: 'actor-victor' });
    const context = buildContext({ request, attempt: buildAttempt({ approverActorId: 'actor-victor' }) });
    const result = evaluator.evaluate(context);
    assert.equal(result.passed, false);
    assert.equal(result.decisionType, 'conflict_of_interest');
    assert.equal(result.policyResults.at(-1)?.policyId, 'segregation_of_duties');
  });

  it('8. missing quorum returns approval_quorum_not_met', () => {
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const requirement = baseRequirement({ minimumApprovals: 2 });
    const context = buildContext({ request: buildRequest(requirement) });
    const result = evaluator.evaluate(context);
    assert.equal(result.passed, false);
    assert.equal(result.decisionType, 'quorum_not_met');
    assert.equal(result.policyResults.at(-1)?.policyId, 'quorum');
  });

  it('9. expired request fails expiration_policy', () => {
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const requirement = baseRequirement();
    const request = buildRequest(requirement, { expiresAt: '2025-01-01T00:00:00.000Z' });
    const context = buildContext({ request });
    const result = evaluator.evaluate(context);
    assert.equal(result.passed, false);
    assert.equal(result.decisionType, 'expired');
    assert.equal(result.policyResults.at(-1)?.policyId, 'expiration');
  });

  it('10. revoked approval fails revocation (via the full chain, and RevocationPolicy in isolation)', () => {
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const requirement = baseRequirement();
    const request = buildRequest(requirement, { status: 'revoked' });
    const result = evaluator.evaluate(buildContext({ request }));
    assert.equal(result.passed, false);
    assert.equal(result.decisionType, 'revoked');

    // RevocationPolicy also independently blocks an approver whose own authority was
    // revoked between the request being opened and the decision being attempted --
    // ApproverAuthorityPolicy (which runs earlier in the default chain) already covers
    // this in end-to-end use, so it is exercised here directly, in isolation.
    const revocationPolicy = new RevocationPolicy();
    const outcome = revocationPolicy.evaluate(
      buildContext({
        request: buildRequest(requirement, { status: 'pending' }),
        authorityCheck: { valid: false, type: 'ancestor_revoked', reasonCode: 'ANCESTOR_REVOKED', reason: "Victor's authority was revoked." },
      }),
    );
    assert.equal(outcome.passed, false);
    assert.equal(outcome.decisionType, 'revoked');
  });

  it('11. duplicate approver fails duplicate_approval_policy', () => {
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const requirement = baseRequirement({ minimumApprovals: 2 });
    const context = buildContext({ request: buildRequest(requirement), priorDecisions: [priorApprovedDecision({ approverActorId: 'actor-victor' })] });
    const result = evaluator.evaluate(context);
    assert.equal(result.passed, false);
    assert.equal(result.decisionType, 'duplicate_approval');
    assert.equal(result.policyResults.at(-1)?.policyId, 'duplicate_approval');
  });

  it('12. policy results are deterministic and ordered', () => {
    const expectedOrder = [
      'valid_approval_request',
      'recognized_approver',
      'approver_authority',
      'approval_scope',
      'approval_evidence',
      'segregation_of_duties',
      'expiration',
      'revocation',
      'duplicate_approval',
      'quorum',
    ];
    const evaluator = new ApprovalPolicyEvaluator(createDefaultApprovalPolicyChain());
    const context = buildContext();
    const first = evaluator.evaluate(context);
    const second = evaluator.evaluate(context);
    assert.deepEqual(
      first.policyResults.map((policyResult) => policyResult.policyId),
      expectedOrder,
    );
    assert.deepEqual(first, second);
  });
});
