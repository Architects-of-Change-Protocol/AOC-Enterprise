import type {
  PolicyPackApprovalRequirement,
  PolicyPackEvidenceRequirement,
  PolicyPackManifest,
  PolicyPackValidationStatus,
} from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import type { PolicyPackCompositionDecision, PolicyPackCompositionResult } from '../../policy-pack-foundation/composition/policy-pack-composition-types.js';

/**
 * AOC Jurisdiction Pack Runtime -- Policy Pack Foundation alignment layer.
 *
 * This module does not encode any real jurisdiction's law, does not provide
 * legal advice, and does not certify jurisdictional compliance. It is
 * infrastructure only: a jurisdiction-shaped specialization of the shared
 * `PolicyPackManifest` standard, `PolicyPackValidationStatus` trust lattice,
 * and no-overclaim harness defined in `policy-pack-foundation`. See this
 * feature's README for the full alignment rationale.
 */

/**
 * The subset of `PolicyPackValidationStatus` that is meaningful for a
 * jurisdiction pack's own lifecycle. This is a narrowing `Extract`, not an
 * independent status enum -- every value here is still a real
 * `PolicyPackValidationStatus`, and satisfaction between two
 * `JurisdictionValidationStatus` values must always be decided by
 * `satisfiesPolicyPackValidationStatus`, never by a second lattice.
 */
export type JurisdictionValidationStatus = Extract<
  PolicyPackValidationStatus,
  | 'demo_baseline'
  | 'customer_provided'
  | 'customer_validated'
  | 'counsel_review_requested'
  | 'counsel_reviewed'
  | 'counsel_attested'
  | 'expired'
  | 'superseded'
  | 'disabled'
>;

/**
 * Identifies a jurisdiction a pack is scoped to. `jurisdictionId` is an
 * opaque identifier -- this module never validates it against a real list of
 * countries/regions/legal systems, and this repo does not ship any real
 * jurisdiction identifiers (e.g. no `'costa_rica'`, no `'us_de'`).
 */
export interface JurisdictionDescriptor {
  readonly jurisdictionId: string;
  readonly label: string;
  readonly countryCode?: string;
  readonly regionCode?: string;
}

/** Jurisdiction-specific flavor of an evidence requirement, layered on the shared `PolicyPackEvidenceRequirement` shape rather than replacing it. */
export type JurisdictionEvidenceType = 'jurisdiction_basis_source' | 'counsel_attestation_source' | 'customer_provided_source' | 'operator_reference_source';

export interface JurisdictionEvidenceRequirement extends PolicyPackEvidenceRequirement {
  readonly jurisdictionEvidenceType?: JurisdictionEvidenceType;
}

/** Jurisdiction-specific flavor of an approval/review requirement, layered on the shared `PolicyPackApprovalRequirement` shape rather than replacing it. */
export type JurisdictionReviewType = 'counsel_review' | 'customer_validation' | 'operator_review';

export interface JurisdictionReviewRequirement extends PolicyPackApprovalRequirement {
  readonly jurisdictionReviewType?: JurisdictionReviewType;
}

/**
 * A generic, non-legal jurisdiction-pack obligation that is not itself an
 * evidence, approval, export, or Control Plane requirement -- e.g. "attach a
 * reference explaining why this jurisdiction applies". This never encodes
 * jurisdiction-specific law; it is a structural placeholder a future,
 * counsel-reviewed jurisdiction pack can populate.
 */
export interface JurisdictionPackRequirement {
  readonly id: string;
  readonly description: string;
  readonly required: boolean;
  readonly reasonCode?: string;
}

/**
 * A jurisdiction pack, specialized from the shared `PolicyPackManifest`
 * standard rather than duplicating it. `manifest` is the single source of
 * truth for identity, trust status, safe framing, dependencies, and
 * evidence/approval/export/Control-Plane requirements; `evidenceRequirements`
 * and `reviewRequirements` are the same requirement objects the manifest
 * carries, narrowed to their jurisdiction-flavored types for convenience.
 */
export interface JurisdictionPack {
  readonly manifest: PolicyPackManifest;
  readonly jurisdiction: JurisdictionDescriptor;
  readonly requirements: readonly JurisdictionPackRequirement[];
  readonly evidenceRequirements: readonly JurisdictionEvidenceRequirement[];
  readonly reviewRequirements: readonly JurisdictionReviewRequirement[];
}

/** The result of resolving a single jurisdiction pack -- a thin, named view over the shared `PolicyPackCompositionResult`, never a parallel decision model. */
export interface JurisdictionPackResolution {
  readonly packId: string;
  readonly jurisdiction: JurisdictionDescriptor;
  readonly composition: PolicyPackCompositionResult;
  readonly validationStatusSatisfied: boolean;
  readonly decision: PolicyPackCompositionDecision;
}
