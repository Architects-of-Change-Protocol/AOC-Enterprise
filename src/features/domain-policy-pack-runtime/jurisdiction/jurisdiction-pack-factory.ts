import type { PolicyPackManifest, PolicyPackSourceStatus } from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import { createPolicyPackManifest } from '../../policy-pack-foundation/manifest/policy-pack-manifest-factory.js';
import { JURISDICTION_VALIDATION_STATUSES } from './jurisdiction-pack-constants.js';
import type {
  JurisdictionDescriptor,
  JurisdictionEvidenceRequirement,
  JurisdictionPack,
  JurisdictionPackRequirement,
  JurisdictionReviewRequirement,
  JurisdictionValidationStatus,
} from './jurisdiction-pack-types.js';

export interface CreateJurisdictionPackInput {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly jurisdiction: JurisdictionDescriptor;
  readonly status: JurisdictionValidationStatus;
  readonly sourceStatus: PolicyPackSourceStatus;
  readonly description: string;
  readonly extendsPackIds?: readonly string[];
  readonly requiredPackIds?: readonly string[];
  readonly optionalPackIds?: readonly string[];
  readonly requirements?: readonly JurisdictionPackRequirement[];
  readonly evidenceRequirements?: readonly JurisdictionEvidenceRequirement[];
  readonly reviewRequirements?: readonly JurisdictionReviewRequirement[];
  readonly labels?: readonly string[];
  readonly notes?: readonly string[];
  readonly createdBy?: string;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly supersedesPackId?: string;
  readonly supersededByPackId?: string;
}

const CUSTOMER_STATUSES: readonly JurisdictionValidationStatus[] = ['customer_provided', 'customer_validated'];

/**
 * Builds a `JurisdictionPack` by deriving its `PolicyPackManifest` through
 * `createPolicyPackManifest` -- this never constructs a manifest-shaped
 * object by hand, so every safe-framing/claim-profile guarantee the
 * Foundation enforces (see `createPolicyPackManifest`) applies here too.
 * `noJurisdictionalComplianceClaim` is always forced to `true`: a jurisdiction
 * pack built by this factory can never claim jurisdictional compliance,
 * regardless of caller input.
 */
export function createJurisdictionPack(input: CreateJurisdictionPackInput): JurisdictionPack {
  const evidenceRequirements = input.evidenceRequirements ?? [];
  const reviewRequirements = input.reviewRequirements ?? [];

  const requiresCounselReviewWhenApplicable = reviewRequirements.some((requirement) => requirement.required);
  const requiresCustomerValidation = CUSTOMER_STATUSES.includes(input.status);
  // `validatePolicyPackManifest` requires `scope.demoOnly = true` for any manifest
  // whose sourceStatus is `demo_fixture`, but `createPolicyPackManifest` only
  // derives `demoOnly` from `kind === 'demo_pack'` -- jurisdiction packs keep
  // `kind: 'jurisdiction_pack'` even when they are demo fixtures, so that flag
  // must be set explicitly here.
  const isDemoFixture = input.sourceStatus === 'demo_fixture';

  const manifest: PolicyPackManifest = createPolicyPackManifest({
    id: input.id,
    name: input.name,
    version: input.version,
    kind: 'jurisdiction_pack',
    domain: 'jurisdiction',
    status: input.status,
    sourceStatus: input.sourceStatus,
    description: input.description,
    // `exactOptionalPropertyTypes` rejects explicitly assigning `undefined` to an
    // optional property -- array-typed fields default to `[]` (createPolicyPackManifest
    // treats a missing array the same as an empty one), and scalar-typed fields are
    // included only when actually present.
    extendsPackIds: input.extendsPackIds ?? [],
    requiredPackIds: input.requiredPackIds ?? [],
    optionalPackIds: input.optionalPackIds ?? [],
    evidenceRequirements,
    approvalRequirements: reviewRequirements,
    ...(isDemoFixture ? { scope: { demoOnly: true } } : {}),
    safeFraming: {
      noJurisdictionalComplianceClaim: true,
      ...(requiresCounselReviewWhenApplicable ? { requiresCounselReviewWhenApplicable: true } : {}),
      ...(requiresCustomerValidation ? { requiresCustomerValidation: true } : {}),
    },
    labels: input.labels ?? [],
    notes: input.notes ?? [],
    ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    ...(input.reviewedBy !== undefined ? { reviewedBy: input.reviewedBy } : {}),
    ...(input.reviewedAt !== undefined ? { reviewedAt: input.reviewedAt } : {}),
    ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
    ...(input.effectiveUntil !== undefined ? { effectiveUntil: input.effectiveUntil } : {}),
    ...(input.supersedesPackId !== undefined ? { supersedesPackId: input.supersedesPackId } : {}),
    ...(input.supersededByPackId !== undefined ? { supersededByPackId: input.supersededByPackId } : {}),
  });

  return {
    manifest,
    jurisdiction: input.jurisdiction,
    requirements: input.requirements ?? [],
    evidenceRequirements,
    reviewRequirements,
  };
}

/** A `JurisdictionPack` already carries its `PolicyPackManifest` directly; this exists so callers never need to know that. */
export function toPolicyPackManifest(jurisdictionPack: JurisdictionPack): PolicyPackManifest {
  return jurisdictionPack.manifest;
}

export function isJurisdictionValidationStatus(status: PolicyPackManifest['status']): status is JurisdictionValidationStatus {
  return (JURISDICTION_VALIDATION_STATUSES as readonly string[]).includes(status);
}

export interface FromPolicyPackManifestOptions {
  readonly requirements?: readonly JurisdictionPackRequirement[];
  readonly evidenceRequirements?: readonly JurisdictionEvidenceRequirement[];
  readonly reviewRequirements?: readonly JurisdictionReviewRequirement[];
}

/**
 * Wraps an existing `PolicyPackManifest` (e.g. one produced elsewhere in the
 * Foundation, or loaded from a registry) as a `JurisdictionPack`, instead of
 * rebuilding it. Never invents jurisdiction-specific evidence/review
 * requirements that were not already present on the manifest or supplied by
 * the caller.
 */
export function fromPolicyPackManifest(manifest: PolicyPackManifest, jurisdiction: JurisdictionDescriptor, options?: FromPolicyPackManifestOptions): JurisdictionPack {
  return {
    manifest,
    jurisdiction,
    requirements: options?.requirements ?? [],
    evidenceRequirements: options?.evidenceRequirements ?? manifest.evidenceRequirements,
    reviewRequirements: options?.reviewRequirements ?? manifest.approvalRequirements,
  };
}
