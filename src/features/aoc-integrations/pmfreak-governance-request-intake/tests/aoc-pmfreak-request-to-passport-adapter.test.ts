import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapAocPMFreakGovernanceRequestToEvaluationInput, mapAocPMFreakGovernanceRequestToPassportResolverInput } from '../aoc-pmfreak-request-to-passport-adapter.js';
import { demoAocPMFreakBillingMissingApprovalRequest } from '../aoc-pmfreak-governance-intake-fixtures.js';

describe('AOC PMFreak Governance Request Intake -- request-to-evaluation adapter', () => {
  it('preserves agent, action, project, evidence, and approval context', () => {
    const request = demoAocPMFreakBillingMissingApprovalRequest;
    const input = mapAocPMFreakGovernanceRequestToEvaluationInput(request);

    assert.equal(input.requestId, request.requestId);
    assert.equal(input.agentId, request.agentContext.agentId);
    assert.equal(input.agentRole, request.agentContext.agentRole);
    assert.equal(input.projectId, request.projectContext.projectId);
    assert.equal(input.actionId, request.actionContext.actionId);
    assert.equal(input.actionCategory, request.actionContext.actionCategory);
    assert.deepEqual(input.providedEvidenceIds, request.evidenceContext.providedEvidenceIds);
    assert.deepEqual(input.missingEvidenceIds, request.evidenceContext.missingEvidenceIds);
    assert.deepEqual(input.providedApprovalIds, request.approvalContext.providedApprovalIds);
    assert.deepEqual(input.missingApprovalIds, request.approvalContext.missingApprovalIds);
  });

  it('derives billingSensitive from billingContext when present', () => {
    const input = mapAocPMFreakGovernanceRequestToEvaluationInput(demoAocPMFreakBillingMissingApprovalRequest);
    assert.equal(input.billingSensitive, true);
  });

  it('never mutates the request it reads', () => {
    const before = JSON.parse(JSON.stringify(demoAocPMFreakBillingMissingApprovalRequest)) as unknown;
    mapAocPMFreakGovernanceRequestToEvaluationInput(demoAocPMFreakBillingMissingApprovalRequest);
    assert.deepEqual(demoAocPMFreakBillingMissingApprovalRequest, before);
  });

  it('maps to a passport resolver input carrying the same action attempt/project/agent identifiers', () => {
    const request = demoAocPMFreakBillingMissingApprovalRequest;
    const resolverInput = mapAocPMFreakGovernanceRequestToPassportResolverInput(request);

    assert.equal(resolverInput.actionAttemptId, request.actionAttempt.actionAttemptId);
    assert.equal(resolverInput.agentId, request.agentContext.agentId);
    assert.equal(resolverInput.actionId, request.actionContext.actionId);
    assert.equal(resolverInput.projectId, request.projectContext.projectId);
    assert.deepEqual(resolverInput.evidenceIds, request.evidenceContext.providedEvidenceIds);
    assert.deepEqual(resolverInput.approvalIds, request.approvalContext.providedApprovalIds);
  });

  it('defaults projectPhase to "execution" for an unrecognized or absent phase', () => {
    const request = { ...demoAocPMFreakBillingMissingApprovalRequest, projectContext: { ...demoAocPMFreakBillingMissingApprovalRequest.projectContext, phase: 'not-a-real-phase' } };
    const resolverInput = mapAocPMFreakGovernanceRequestToPassportResolverInput(request);
    assert.equal(resolverInput.projectPhase, 'execution');
  });
});
