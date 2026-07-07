import type { PolicyEvaluationInput } from '../domain/policy-pack-evaluation.js';
import { buildPolicyEvaluationInput } from './domain-policy-pack-demo.fixture.js';

export function buildPrepareInvoiceSupportInput(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  return buildPolicyEvaluationInput({
    id: 'policy-eval-prepare-invoice-support',
    action: 'prepare_invoice_support',
    domain: 'procurement',
    counterpartyId: 'counterparty-demo-vendor',
    hasRequiredEvidence: false,
    ...overrides,
  });
}

export function buildSubmitPurchaseOrderInput(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  return buildPolicyEvaluationInput({
    id: 'policy-eval-submit-purchase-order',
    action: 'submit_purchase_order',
    domain: 'procurement',
    counterpartyId: 'counterparty-demo-vendor',
    hasRequiredEvidence: false,
    ...overrides,
  });
}

export function buildHighRiskProcurementInput(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  return buildPolicyEvaluationInput({
    id: 'policy-eval-high-risk-procurement',
    action: 'review_vendor_contract',
    domain: 'procurement',
    counterpartyId: 'counterparty-demo-vendor',
    riskLevel: 'critical',
    hasApprovalProof: false,
    ...overrides,
  });
}
