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

export {
  GLOBAL_LEGAL_BASELINE_DEMO_NOW,
  GLOBAL_LEGAL_BASELINE_TRUST_DOMAIN_ID,
  GLOBAL_LEGAL_BASELINE_ACTOR_ID,
  GLOBAL_LEGAL_BASELINE_RESOURCE_SCOPE,
  buildGlobalLegalBaselineDemoPolicyPackRuntime,
  buildQuietGlobalLegalBaselineInput,
} from './global-legal-baseline-policy-demo.fixture.js';
