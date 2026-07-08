import type { PolicyPackApprovalRequirement, PolicyPackApprovalReviewType } from '../../../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';

/**
 * Costa Rica base approval-requirement catalog, using the shared
 * `PolicyPackApprovalRequirement` shape directly. Every `reviewType` here is
 * a review *path* -- who should look at an action, not a statement that the
 * action has been approved, is compliant, or is legally valid. This pack
 * never auto-approves anything because it exists; approval itself remains
 * the Approval Runtime's job (see `costa-rica-control-plane.ts` and the
 * shared `mapJurisdictionResolutionToApproval` adapter).
 *
 * `required` is `false` on every catalog entry for the same reason as the
 * evidence catalog: which review types actually apply to a specific action
 * is decided by which `CostaRicaReviewTrigger`s fire (see
 * `costa-rica-review-triggers.ts`), not by static manifest declaration.
 */
export const COSTA_RICA_APPROVAL_REVIEW_TYPES: readonly PolicyPackApprovalReviewType[] = [
  'operator_review',
  'customer_validation',
  'legal_review',
  'counsel_review',
  'tax_review',
  'compliance_review',
  'privacy_review',
  'security_review',
  'business_review',
];

export const COSTA_RICA_APPROVAL_REQUIREMENTS: readonly PolicyPackApprovalRequirement[] = COSTA_RICA_APPROVAL_REVIEW_TYPES.map((reviewType) => ({
  id: `costa-rica-approval-${reviewType.replace(/_/g, '-')}`,
  reviewType,
  required: false,
}));
