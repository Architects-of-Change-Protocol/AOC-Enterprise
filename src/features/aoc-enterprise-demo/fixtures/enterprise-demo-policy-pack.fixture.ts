import { completeTrustedPartnerHandshake, buildTrustedPartnerReadGuardInput } from '../../action-enforcement/fixtures/external-agent-action.fixture.js';
import {
  bridgePolicyPackIntegration,
  buildApprovePaymentRequiresFinanceReviewInput,
  buildChangeBankAccountDeniedInput,
  buildExportClientDataProhibitedInput,
  buildExportClientDataRequiresComplianceReviewInput,
  buildPolicyPackEnforcementFixture,
  buildPrepareInvoiceSupportRequiresEvidenceInput,
  buildSettleEventPaymentRequiresEvidenceInput,
  EXPORT_CLIENT_DATA,
  SETTLE_EVENT_PAYMENT,
  type PolicyPackEnforcementFixture,
} from '../../action-enforcement/fixtures/policy-pack-enforcement.fixture.js';

/**
 * Re-exports the real Policy Pack Enforcement fixture (Action Enforcement's
 * `action-enforcement/fixtures/policy-pack-enforcement.fixture.ts`) so
 * policy-pack demo scenarios build their `GuardActionRequestInput`s from the
 * same, already-tested builders `action-enforcement`'s own tests exercise --
 * this module never re-derives a policy-pack request shape or duplicates
 * rule evaluation.
 */
export {
  bridgePolicyPackIntegration,
  buildApprovePaymentRequiresFinanceReviewInput,
  buildChangeBankAccountDeniedInput,
  buildExportClientDataProhibitedInput,
  buildExportClientDataRequiresComplianceReviewInput,
  buildPolicyPackEnforcementFixture,
  buildPrepareInvoiceSupportRequiresEvidenceInput,
  buildSettleEventPaymentRequiresEvidenceInput,
  buildTrustedPartnerReadGuardInput,
  completeTrustedPartnerHandshake,
  EXPORT_CLIENT_DATA,
  SETTLE_EVENT_PAYMENT,
};
export type { PolicyPackEnforcementFixture };
