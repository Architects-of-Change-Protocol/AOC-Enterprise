/**
 * PMFreak Agent Passport validation-status lattice.
 *
 * This is a structural mirror of `PolicyPackValidationStatus` and its
 * `satisfiesPolicyPackValidationStatus` comparator
 * (`src/features/policy-pack-foundation/manifest/policy-pack-manifest-types.ts`
 * and `src/features/policy-pack-foundation/validation/policy-pack-validation-status.ts`).
 * It is NOT an import: `src/features/policy-pack-foundation` is internal to
 * the root `@aoc-enterprise/runtime` package and is not one of the subpaths
 * ('.', './authorization', './audit', './crypto', './adapters') that package
 * publicly exports, so this workspace package -- `packages/pmfreak-agent-passport-foundation`
 * -- has no legitimate import path to it. The 15-value ordering and the
 * satisfaction semantics (terminal statuses satisfy only themselves; a
 * lower-trust status never satisfies a higher-trust requirement) are
 * intentionally identical to the policy-pack lattice so a PMFreak passport
 * attestation's trust level reads consistently with every other Soberanía trust
 * lattice in this repository. If `policy-pack-foundation` is ever exported
 * from the root package's public surface, this mirror should be replaced
 * with a real import (see this package's README, "Future work").
 */
export type PMFreakPassportValidationStatus =
  | 'draft'
  | 'demo_baseline'
  | 'system_baseline'
  | 'customer_provided'
  | 'customer_validated'
  | 'operator_reviewed'
  | 'counsel_review_requested'
  | 'counsel_reviewed'
  | 'counsel_attested'
  | 'security_reviewed'
  | 'privacy_reviewed'
  | 'compliance_reviewed'
  | 'expired'
  | 'superseded'
  | 'disabled';

export const PMFREAK_PASSPORT_VALIDATION_STATUSES: readonly PMFreakPassportValidationStatus[] = [
  'draft',
  'demo_baseline',
  'system_baseline',
  'customer_provided',
  'customer_validated',
  'operator_reviewed',
  'counsel_review_requested',
  'counsel_reviewed',
  'counsel_attested',
  'security_reviewed',
  'privacy_reviewed',
  'compliance_reviewed',
  'expired',
  'superseded',
  'disabled',
];

/**
 * What each actual validation status is trusted to satisfy -- mirrors
 * `POLICY_PACK_VALIDATION_STATUS_SATISFACTION` one-to-one. Every status is
 * reflexive (satisfies itself) unless noted otherwise. `expired`,
 * `superseded`, and `disabled` are terminal: they satisfy only themselves.
 */
const PMFREAK_PASSPORT_VALIDATION_STATUS_SATISFACTION: Readonly<
  Record<PMFreakPassportValidationStatus, readonly PMFreakPassportValidationStatus[]>
> = {
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
 * Returns whether a PMFreak passport attestation whose actual validation
 * status is `actual` is trusted to satisfy a requirement asking for
 * `required`. Never treats a lower-trust status as satisfying a
 * higher-trust requirement, and never lets a terminal status satisfy
 * anything other than itself.
 */
export function satisfiesPMFreakPassportValidationStatus(
  actual: PMFreakPassportValidationStatus,
  required: PMFreakPassportValidationStatus,
): boolean {
  return PMFREAK_PASSPORT_VALIDATION_STATUS_SATISFACTION[actual].includes(required);
}
