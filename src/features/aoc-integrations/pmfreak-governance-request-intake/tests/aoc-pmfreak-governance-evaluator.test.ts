import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateAocPMFreakGovernanceRequest } from '../aoc-pmfreak-governance-evaluator.js';
import {
  demoAocPMFreakBillingAllowedRequest,
  demoAocPMFreakBillingMissingApprovalRequest,
  demoAocPMFreakBillingMissingEvidenceRequest,
  demoAocPMFreakCancelledActionRequest,
  demoAocPMFreakClientCommunicationRequiresApprovalRequest,
  demoAocPMFreakScheduleRequiresPmApprovalRequest,
} from '../aoc-pmfreak-governance-intake-fixtures.js';
import type { AocPMFreakGovernanceRequest } from '../aoc-pmfreak-governance-intake-types.js';

function withMissingApproval(request: AocPMFreakGovernanceRequest, approvalId: string): AocPMFreakGovernanceRequest {
  return {
    ...request,
    approvalContext: {
      approvalReferenceIds: [approvalId],
      providedApprovalIds: [],
      missingApprovalIds: [approvalId],
    },
  };
}

describe('AOC PMFreak Governance Request Intake -- deterministic evaluator', () => {
  it('returns require_evidence for a billing action with missing evidence', () => {
    const response = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingMissingEvidenceRequest });
    assert.equal(response.decision, 'require_evidence');
  });

  it('returns require_billing_review for a billing action with a missing billing review', () => {
    const response = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingMissingApprovalRequest });
    assert.equal(response.decision, 'require_billing_review');
  });

  it('returns allow when evidence and approvals are complete', () => {
    const response = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingAllowedRequest });
    assert.equal(response.decision, 'allow');
  });

  it('returns require_pm_approval for a missing pm_approval', () => {
    const response = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakScheduleRequiresPmApprovalRequest });
    assert.equal(response.decision, 'require_pm_approval');
  });

  it('returns require_customer_validation for a missing customer_validation', () => {
    const response = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakClientCommunicationRequiresApprovalRequest });
    assert.equal(response.decision, 'require_customer_validation');
  });

  it('returns require_contract_review for a missing contract_review', () => {
    const request = withMissingApproval(demoAocPMFreakScheduleRequiresPmApprovalRequest, 'pmfreak.approval.contract_review');
    const response = evaluateAocPMFreakGovernanceRequest({ request });
    assert.equal(response.decision, 'require_contract_review');
  });

  it('returns require_security_review for a missing security_review', () => {
    const request = withMissingApproval(demoAocPMFreakScheduleRequiresPmApprovalRequest, 'pmfreak.approval.security_review');
    const response = evaluateAocPMFreakGovernanceRequest({ request });
    assert.equal(response.decision, 'require_security_review');
  });

  it('returns require_executive_approval for a missing executive_approval', () => {
    const request = withMissingApproval(demoAocPMFreakScheduleRequiresPmApprovalRequest, 'pmfreak.approval.executive_approval');
    const response = evaluateAocPMFreakGovernanceRequest({ request });
    assert.equal(response.decision, 'require_executive_approval');
  });

  it('returns deny for a cancelled action attempt', () => {
    const response = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakCancelledActionRequest });
    assert.equal(response.decision, 'deny');
  });

  it('returns deny for a structurally invalid request without evaluating it further', () => {
    const invalid: AocPMFreakGovernanceRequest = { ...demoAocPMFreakBillingAllowedRequest, requestId: '' };
    const response = evaluateAocPMFreakGovernanceRequest({ request: invalid });
    assert.equal(response.decision, 'deny');
    assert.ok(response.errors.length > 0);
  });

  it('denies rather than silently allows when evaluationMode is "unsupported"', () => {
    const response = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingAllowedRequest, config: { evaluationMode: 'unsupported' } });
    assert.equal(response.decision, 'deny');
  });

  it('never mutates the request it evaluates', () => {
    const before = JSON.parse(JSON.stringify(demoAocPMFreakBillingMissingEvidenceRequest)) as unknown;
    evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingMissingEvidenceRequest });
    assert.deepEqual(demoAocPMFreakBillingMissingEvidenceRequest, before);
  });
});

describe('AOC PMFreak Governance Request Intake -- passport_runtime evaluation mode', () => {
  it('produces a response using the intake public decision vocabulary only', () => {
    const response = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingMissingEvidenceRequest, config: { evaluationMode: 'passport_runtime' } });
    const validDecisions = ['allow', 'deny', 'hold', 'require_evidence', 'require_pm_approval', 'require_customer_validation', 'require_billing_review', 'require_contract_review', 'require_security_review', 'require_executive_approval'];
    assert.ok(validDecisions.includes(response.decision));
  });
});
