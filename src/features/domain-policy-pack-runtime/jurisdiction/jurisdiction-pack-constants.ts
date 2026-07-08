import type { JurisdictionValidationStatus } from './jurisdiction-pack-types.js';

/** Every value of the narrowed `JurisdictionValidationStatus`, used to check membership without re-deriving a second lattice. */
export const JURISDICTION_VALIDATION_STATUSES: readonly JurisdictionValidationStatus[] = [
  'demo_baseline',
  'customer_provided',
  'customer_validated',
  'counsel_review_requested',
  'counsel_reviewed',
  'counsel_attested',
  'expired',
  'superseded',
  'disabled',
];

/**
 * Safe, natural-language Control Plane labels for jurisdiction packs. Every
 * label here is checked by this module's own tests against
 * `evaluatePolicyPackClaimSafety` -- none of them claim legal compliance,
 * jurisdictional compliance, or completeness.
 */
export const JURISDICTION_CONTROL_PLANE_SAFE_LABELS = [
  'Jurisdiction awareness',
  'Not legal advice',
  'Partial policy model',
  'No jurisdiction-specific compliance claimed',
  'Requires counsel review when applicable',
] as const;
