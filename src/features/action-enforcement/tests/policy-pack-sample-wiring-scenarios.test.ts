import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { completeTrustedPartnerHandshake, buildTrustedPartnerReadGuardInput } from '../fixtures/external-agent-action.fixture.js';
import {
  buildApprovePaymentRequiresFinanceReviewInput,
  buildChangeBankAccountDeniedInput,
  buildCriticalFinancialActionRequiresDualApprovalInput,
  buildExportClientDataProhibitedInput,
  buildExportClientDataRequiresComplianceReviewInput,
  buildPolicyPackEnforcementFixture,
  buildPrepareInvoiceSupportRequiresEvidenceInput,
  buildSettleEventPaymentRequiresEvidenceInput,
  buildSignContractRequiresAuthorityInput,
  buildUnrecognizedJurisdictionWarningInput,
} from '../fixtures/policy-pack-enforcement.fixture.js';

describe('Domain Policy Pack Runtime sample packs, exercised through Action Enforcement', () => {
  it('1. payments-basic: approve_payment requires finance_review approval', () => {
    const fixture = buildPolicyPackEnforcementFixture();
    const decision = fixture.policyPackAocGuard.preflight(buildApprovePaymentRequiresFinanceReviewInput());
    assert.equal(decision.type, 'approval_required');
    assert.equal(decision.policyReasonCode, 'PAYMENT_REQUIRES_FINANCE_REVIEW');
    assert.ok(decision.policyMatchedRuleIds?.includes('payments-basic-rule-approve-payment-finance-review'));
  });

  it('2. payments-basic: change_bank_account is denied', () => {
    const fixture = buildPolicyPackEnforcementFixture();
    const decision = fixture.policyPackAocGuard.preflight(buildChangeBankAccountDeniedInput());
    assert.equal(decision.type, 'execution_blocked');
    assert.equal(decision.policyReasonCode, 'BANK_ACCOUNT_CHANGE_DENIED_BY_DEFAULT');
  });

  it('3. procurement-basic: prepare_invoice_support missing purchase-order evidence requires evidence', () => {
    const fixture = buildPolicyPackEnforcementFixture();
    const decision = fixture.policyPackAocGuard.preflight(buildPrepareInvoiceSupportRequiresEvidenceInput());
    assert.equal(decision.type, 'evidence_required');
    assert.equal(decision.policyReasonCode, 'INVOICE_SUPPORT_REQUIRES_PURCHASE_ORDER');
  });

  it('4. data-boundary-basic: read_project_summary of non-sensitive data does not block', async () => {
    const fixture = buildPolicyPackEnforcementFixture();
    const handshake = completeTrustedPartnerHandshake(fixture);
    const input = buildTrustedPartnerReadGuardInput(handshake, {
      policyEvaluationInput: { domain: 'data_boundary', dataDomains: ['project_metadata'] },
    });
    let ran = 0;
    const outcome = await fixture.policyPackAocGuard.enforce(input, () => (ran += 1, 'summary'));
    assert.equal(outcome.decision.allowedToExecute, true);
    assert.equal(ran, 1);
  });

  it('5. data-boundary-basic: export_client_data touching a sensitive data domain requires compliance review', () => {
    const fixture = buildPolicyPackEnforcementFixture();
    const decision = fixture.policyPackAocGuard.preflight(buildExportClientDataRequiresComplianceReviewInput());
    assert.equal(decision.type, 'approval_required');
    assert.equal(decision.policyReasonCode, 'SENSITIVE_DATA_EXPORT_REQUIRES_COMPLIANCE_REVIEW');
  });

  it('6. data-boundary-basic: export_client_data touching a prohibited data domain is denied', () => {
    const fixture = buildPolicyPackEnforcementFixture();
    const decision = fixture.policyPackAocGuard.preflight(buildExportClientDataProhibitedInput());
    assert.equal(decision.type, 'execution_blocked');
    assert.equal(decision.policyReasonCode, 'PROHIBITED_DATA_DOMAIN_EXPORT_DENIED');
  });

  it('7. sports-event-settlement-basic: settle_event_payment missing event_record evidence requires evidence', () => {
    const fixture = buildPolicyPackEnforcementFixture();
    const decision = fixture.policyPackAocGuard.preflight(buildSettleEventPaymentRequiresEvidenceInput());
    assert.equal(decision.type, 'evidence_required');
    assert.equal(decision.policyReasonCode, 'SETTLEMENT_REQUIRES_EVENT_RECORD');
  });

  it('8. financial-approval-basic: a critical-risk financial action requires (dual) approval', () => {
    const fixture = buildPolicyPackEnforcementFixture();
    const decision = fixture.policyPackAocGuard.preflight(buildCriticalFinancialActionRequiresDualApprovalInput());
    assert.equal(decision.type, 'approval_required');
    assert.ok(decision.policyMatchedRuleIds?.includes('financial-approval-basic-rule-critical-risk-dual-approval'));
  });

  it('9. jurisdictional-baseline-demo: sign_contract requires approval and authority proof', () => {
    const fixture = buildPolicyPackEnforcementFixture();
    const decision = fixture.policyPackAocGuard.preflight(buildSignContractRequiresAuthorityInput());
    assert.equal(decision.allowedToExecute, false);
    assert.ok(decision.policyMatchedRuleIds?.includes('jurisdictional-baseline-demo-rule-sign-contract-authority'));
    assert.ok(decision.policyMatchedRuleIds?.includes('jurisdictional-baseline-demo-rule-sign-contract-approval'));
  });

  it('10. jurisdictional-baseline-demo: an unrecognized jurisdiction warns (manual verification) but does not block', async () => {
    const fixture = buildPolicyPackEnforcementFixture();
    let ran = 0;
    const outcome = await fixture.policyPackAocGuard.enforce(buildUnrecognizedJurisdictionWarningInput(), () => (ran += 1, 'done'));
    assert.equal(outcome.decision.allowedToExecute, true);
    assert.equal(ran, 1);
    assert.equal(outcome.decision.policyReasonCode, 'JURISDICTION_TAGGED_ACTION_REQUIRES_SOURCE_REFERENCE');
  });
});
