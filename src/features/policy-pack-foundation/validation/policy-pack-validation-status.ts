import type { PolicyPackValidationStatus } from '../manifest/policy-pack-manifest-types.js';

/**
 * What each actual validation status is trusted to satisfy. This is the
 * single shared trust lattice for every AOC policy pack -- legal,
 * jurisdiction, domain, use-case, customer, security, privacy, finance,
 * healthcare, AI-governance, project-governance alike -- so that, for
 * example, a demo_baseline pack can never satisfy a counsel_reviewed
 * requirement no matter which module is asking.
 *
 * Every status is reflexive (satisfies itself) unless noted otherwise.
 * `expired`, `superseded`, and `disabled` are terminal: they satisfy only
 * themselves, never any "active" requirement.
 */
const POLICY_PACK_VALIDATION_STATUS_SATISFACTION: Readonly<Record<PolicyPackValidationStatus, readonly PolicyPackValidationStatus[]>> = {
  counsel_attested: ['counsel_attested', 'counsel_reviewed', 'counsel_review_requested', 'customer_validated', 'customer_provided'],
  counsel_reviewed: ['counsel_reviewed', 'counsel_review_requested', 'customer_validated', 'customer_provided'],
  compliance_reviewed: ['compliance_reviewed', 'customer_validated', 'customer_provided'],
  privacy_reviewed: ['privacy_reviewed', 'customer_validated', 'customer_provided'],
  security_reviewed: ['security_reviewed', 'customer_validated', 'customer_provided'],
  operator_reviewed: ['operator_reviewed', 'customer_provided'],
  customer_validated: ['customer_validated', 'customer_provided'],
  customer_provided: ['customer_provided'],
  system_baseline: ['system_baseline'],
  demo_baseline: ['demo_baseline'],
  draft: ['draft'],
  counsel_review_requested: ['counsel_review_requested'],
  expired: ['expired'],
  superseded: ['superseded'],
  disabled: ['disabled'],
};

/**
 * Returns whether a pack whose actual validation status is `actual` is
 * trusted to satisfy a requirement asking for `required`. Never treats a
 * lower-trust status (e.g. `demo_baseline`, `customer_provided`,
 * `customer_validated`, `operator_reviewed`) as satisfying a higher-trust
 * requirement (e.g. `counsel_reviewed`, `counsel_attested`), and never lets
 * a terminal status (`expired`, `superseded`, `disabled`) satisfy anything
 * other than itself.
 */
export function satisfiesPolicyPackValidationStatus(actual: PolicyPackValidationStatus, required: PolicyPackValidationStatus): boolean {
  return POLICY_PACK_VALIDATION_STATUS_SATISFACTION[actual].includes(required);
}
