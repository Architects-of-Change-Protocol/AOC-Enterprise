import type {
  PolicyPackApprovalRequirement,
  PolicyPackClaimProfile,
  PolicyPackControlPlaneRequirement,
  PolicyPackDomain,
  PolicyPackEvidenceRequirement,
  PolicyPackExportRequirement,
  PolicyPackKind,
  PolicyPackManifest,
  PolicyPackSafeFraming,
  PolicyPackScope,
  PolicyPackSourceStatus,
  PolicyPackValidationStatus,
} from './policy-pack-manifest-types.js';
import { SYSTEM_AUTHORED_SAFE_FRAMING_DEFAULTS } from './policy-pack-manifest-constants.js';

export interface CreatePolicyPackManifestInput {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly kind: PolicyPackKind;
  readonly domain: PolicyPackDomain;
  readonly scope?: Partial<PolicyPackScope>;
  readonly status: PolicyPackValidationStatus;
  readonly sourceStatus: PolicyPackSourceStatus;
  readonly safeFraming?: Partial<PolicyPackSafeFraming>;
  readonly description: string;
  readonly extendsPackIds?: readonly string[];
  readonly requiredPackIds?: readonly string[];
  readonly optionalPackIds?: readonly string[];
  readonly evidenceRequirements?: readonly PolicyPackEvidenceRequirement[];
  readonly approvalRequirements?: readonly PolicyPackApprovalRequirement[];
  readonly exportRequirements?: readonly PolicyPackExportRequirement[];
  readonly controlPlaneRequirements?: readonly PolicyPackControlPlaneRequirement[];
  readonly claimProfile?: Partial<PolicyPackClaimProfile>;
  readonly createdBy?: string;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly supersedesPackId?: string;
  readonly supersededByPackId?: string;
  readonly labels?: readonly string[];
  readonly notes?: readonly string[];
}

const SAFE_LABEL_BY_FRAMING_FLAG: ReadonlyArray<readonly [keyof PolicyPackSafeFraming, string]> = [
  ['notLegalAdvice', 'not_legal_advice'],
  ['notComplianceCertification', 'not_compliance_certification'],
  ['noCompletenessClaim', 'no_completeness_claim'],
  ['noJurisdictionalComplianceClaim', 'no_jurisdictional_compliance_claim'],
  ['partialPolicyModel', 'partial_policy_model'],
  ['requiresCustomerValidation', 'requires_customer_validation'],
  ['requiresCounselReviewWhenApplicable', 'requires_counsel_review_when_applicable'],
  ['requiresDomainExpertReviewWhenApplicable', 'requires_domain_expert_review_when_applicable'],
];

function isSystemAuthoredOrDemo(input: CreatePolicyPackManifestInput): boolean {
  return (
    input.scope?.systemAuthored === true ||
    input.kind === 'system_pack' ||
    input.kind === 'demo_pack' ||
    input.sourceStatus === 'system_authored' ||
    input.sourceStatus === 'demo_fixture'
  );
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function buildScope(input: CreatePolicyPackManifestInput): PolicyPackScope {
  const derivedDefaults: PolicyPackScope = {
    global: input.kind === 'global_baseline',
    jurisdictionSpecific: input.kind === 'jurisdiction_pack',
    domainSpecific: input.kind === 'domain_pack',
    useCaseSpecific: input.kind === 'use_case_pack',
    customerSpecific: input.kind === 'customer_pack',
    // Matches validatePolicyPackManifest's demoOnly requirement, which triggers on
    // sourceStatus === 'demo_fixture' too -- not just kind === 'demo_pack' -- so a
    // demo-sourced jurisdiction/domain/customer pack defaults to a manifest that
    // passes its own validator instead of silently failing it.
    demoOnly: input.kind === 'demo_pack' || input.sourceStatus === 'demo_fixture',
    systemAuthored: input.kind === 'system_pack' || input.kind === 'integration_pack' || input.sourceStatus === 'system_authored',
  };
  return { ...derivedDefaults, ...input.scope };
}

function buildSafeFraming(input: CreatePolicyPackManifestInput): PolicyPackSafeFraming {
  const conservativeDefaults: Required<Pick<PolicyPackSafeFraming, 'notLegalAdvice' | 'notComplianceCertification' | 'noCompletenessClaim' | 'noJurisdictionalComplianceClaim' | 'partialPolicyModel'>> = {
    notLegalAdvice: true,
    notComplianceCertification: true,
    noCompletenessClaim: true,
    noJurisdictionalComplianceClaim: true,
    partialPolicyModel: true,
  };

  const merged: PolicyPackSafeFraming = { ...conservativeDefaults, ...input.safeFraming };

  if (!isSystemAuthoredOrDemo(input)) return merged;

  // System-authored and demo packs can never opt out of the core safe-framing guarantees.
  return { ...merged, ...SYSTEM_AUTHORED_SAFE_FRAMING_DEFAULTS };
}

function deriveSafeLabels(safeFraming: PolicyPackSafeFraming, explicitLabels: readonly string[]): string[] {
  const derived = SAFE_LABEL_BY_FRAMING_FLAG.filter(([flag]) => safeFraming[flag] === true).map(([, label]) => label);
  return dedupe([...derived, ...explicitLabels]);
}

function buildClaimProfile(input: CreatePolicyPackManifestInput, labels: readonly string[]): PolicyPackClaimProfile {
  return {
    allowedClaims: input.claimProfile?.allowedClaims ?? [],
    // The universal POLICY_PACK_PROHIBITED_OVERCLAIM_PHRASES baseline already applies to every
    // pack via evaluatePolicyPackClaimSafety; this field is for pack-specific additions only.
    // Copying the universal list in here would make every manifest fail its own overclaim scan,
    // since the manifest would then contain every phrase the scan is looking for.
    prohibitedClaims: dedupe(input.claimProfile?.prohibitedClaims ?? []),
    requiredDisclaimers: input.claimProfile?.requiredDisclaimers ?? labels,
    claimValidationStatus: input.claimProfile?.claimValidationStatus ?? input.status,
  };
}

/**
 * Builds a `PolicyPackManifest`, normalizing identity fields, forcing safe
 * framing defaults for system-authored/demo packs, deriving safe labels and
 * a claim profile, and defaulting every array field to `[]` rather than
 * leaving it undefined. Never invents a validation status or source status
 * -- both must be supplied explicitly by the caller.
 */
export function createPolicyPackManifest(input: CreatePolicyPackManifestInput): PolicyPackManifest {
  const safeFraming = buildSafeFraming(input);
  const labels = deriveSafeLabels(safeFraming, input.labels ?? []);

  return {
    id: input.id.trim(),
    name: input.name.trim(),
    version: input.version.trim(),

    kind: input.kind,
    domain: input.domain,
    scope: buildScope(input),

    status: input.status,
    sourceStatus: input.sourceStatus,

    safeFraming,

    description: input.description.trim(),

    extendsPackIds: dedupe(input.extendsPackIds ?? []),
    requiredPackIds: dedupe(input.requiredPackIds ?? []),
    optionalPackIds: dedupe(input.optionalPackIds ?? []),

    evidenceRequirements: input.evidenceRequirements ?? [],
    approvalRequirements: input.approvalRequirements ?? [],
    exportRequirements: input.exportRequirements ?? [],
    controlPlaneRequirements: input.controlPlaneRequirements ?? [],

    claimProfile: buildClaimProfile(input, labels),

    ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    ...(input.reviewedBy !== undefined ? { reviewedBy: input.reviewedBy } : {}),
    ...(input.reviewedAt !== undefined ? { reviewedAt: input.reviewedAt } : {}),

    ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
    ...(input.effectiveUntil !== undefined ? { effectiveUntil: input.effectiveUntil } : {}),

    ...(input.supersedesPackId !== undefined ? { supersedesPackId: input.supersedesPackId } : {}),
    ...(input.supersededByPackId !== undefined ? { supersededByPackId: input.supersededByPackId } : {}),

    labels,
    notes: input.notes ?? [],
  };
}
