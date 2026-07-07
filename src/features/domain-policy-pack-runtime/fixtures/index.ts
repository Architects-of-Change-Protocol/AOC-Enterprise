export {
  DEMO_POLICY_PACK_NOW,
  DEMO_TRUST_DOMAIN_ID,
  DEMO_ACTOR_ID,
  DEMO_RESOURCE_SCOPE,
  buildDemoPolicyPackRuntime,
  buildPolicyEvaluationInput,
} from './domain-policy-pack-demo.fixture.js';

export {
  buildApprovePaymentInput,
  buildChangeBankAccountInput,
  buildHighValueFinancialSideEffectInput,
} from './payments-policy-demo.fixture.js';

export { buildSettleEventPaymentInput } from './sports-settlement-policy-demo.fixture.js';

export {
  buildPrepareInvoiceSupportInput,
  buildSubmitPurchaseOrderInput,
  buildHighRiskProcurementInput,
} from './procurement-policy-demo.fixture.js';

export { buildExportClientDataInput, buildReadProjectSummaryInput } from './data-boundary-policy-demo.fixture.js';
