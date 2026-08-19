import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  demoAocPMFreakBillingAllowedRequest,
  demoAocPMFreakBillingAllowedResponse,
  demoAocPMFreakBillingMissingApprovalRequest,
  demoAocPMFreakBillingMissingApprovalResponse,
  demoAocPMFreakBillingMissingEvidenceRequest,
  demoAocPMFreakBillingMissingEvidenceResponse,
  demoAocPMFreakCancelledActionRequest,
  demoAocPMFreakCancelledActionResponse,
  demoAocPMFreakClientCommunicationRequiresApprovalRequest,
  demoAocPMFreakClientCommunicationRequiresApprovalResponse,
  demoAocPMFreakRiskEscalationAllowedRequest,
  demoAocPMFreakRiskEscalationAllowedResponse,
  demoAocPMFreakScheduleRequiresPmApprovalRequest,
  demoAocPMFreakScheduleRequiresPmApprovalResponse,
} from '../aoc-pmfreak-governance-intake-fixtures.js';
import { validateAocPMFreakGovernanceRequest } from '../aoc-pmfreak-governance-intake-validator.js';

const REQUEST_RESPONSE_PAIRS = [
  [demoAocPMFreakBillingMissingEvidenceRequest, demoAocPMFreakBillingMissingEvidenceResponse, 'require_evidence'],
  [demoAocPMFreakBillingMissingApprovalRequest, demoAocPMFreakBillingMissingApprovalResponse, 'require_billing_review'],
  [demoAocPMFreakBillingAllowedRequest, demoAocPMFreakBillingAllowedResponse, 'allow'],
  [demoAocPMFreakScheduleRequiresPmApprovalRequest, demoAocPMFreakScheduleRequiresPmApprovalResponse, 'require_pm_approval'],
  [demoAocPMFreakRiskEscalationAllowedRequest, demoAocPMFreakRiskEscalationAllowedResponse, 'allow'],
  [demoAocPMFreakClientCommunicationRequiresApprovalRequest, demoAocPMFreakClientCommunicationRequiresApprovalResponse, 'require_customer_validation'],
  [demoAocPMFreakCancelledActionRequest, demoAocPMFreakCancelledActionResponse, 'deny'],
] as const;

describe('Soberanía PMFreak Governance Request Intake -- fixtures', () => {
  it('every request fixture is structurally valid', () => {
    for (const [request] of REQUEST_RESPONSE_PAIRS) {
      const result = validateAocPMFreakGovernanceRequest(request);
      assert.equal(result.valid, true, `expected ${request.requestId} to be valid: ${result.errors.join(', ')}`);
    }
  });

  it('every response fixture reflects its named scenario decision', () => {
    for (const [, response, expectedDecision] of REQUEST_RESPONSE_PAIRS) {
      assert.equal(response.decision, expectedDecision);
    }
  });

  it('every response fixture is keyed to its matching request fixture', () => {
    for (const [request, response] of REQUEST_RESPONSE_PAIRS) {
      assert.equal(response.requestId, request.requestId);
      assert.equal(response.clientId, request.clientId);
    }
  });

  it('uses only fake, deterministic identifiers -- no real customer names, project ids, emails, or invoice numbers', () => {
    for (const [request] of REQUEST_RESPONSE_PAIRS) {
      const serialized = JSON.stringify(request);
      assert.ok(!/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(serialized), 'expected no email address in fixture data');
      assert.ok(serialized.includes('governance_demo'), 'expected fixture ids to carry the governance_demo namespace');
      assert.ok(!serialized.toLowerCase().includes('datasys'), 'expected no real Datasys project reference');
    }
  });
});
