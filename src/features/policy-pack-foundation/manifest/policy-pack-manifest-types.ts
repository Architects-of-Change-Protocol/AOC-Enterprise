/**
 * The Policy Pack Manifest Standard.
 *
 * A universal manifest shape for every Soberanía policy pack -- global baseline,
 * legal baseline, jurisdiction, domain, use-case, customer, demo, security,
 * privacy, financial, healthcare, AI-governance and project-governance
 * packs alike. This is a horizontal metadata/composition/claim-safety layer;
 * it is deliberately independent of `domain-policy-pack-runtime`'s
 * evaluation-time `PolicyPack`/`PolicyPackVersion` domain types (rule
 * conditions, effects, obligations). A future pack can carry both: a
 * `PolicyPackManifest` describing what it is, and a `PolicyPack` describing
 * what it evaluates.
 */

export type PolicyPackKind = 'global_baseline' | 'domain_pack' | 'jurisdiction_pack' | 'use_case_pack' | 'customer_pack' | 'demo_pack' | 'system_pack' | 'integration_pack';

/**
 * Classification labels only -- `domain` never implies compliance.
 * `domain: 'healthcare'` does not mean HIPAA-compliant; `domain: 'finance'`
 * does not mean financial-regulation-compliant; `domain: 'jurisdiction'`
 * does not mean jurisdictionally compliant. See `PolicyPackSafeFraming`.
 */
export type PolicyPackDomain =
  | 'general'
  | 'legal'
  | 'jurisdiction'
  | 'sports'
  | 'payments'
  | 'smart_contracts'
  | 'privacy'
  | 'security'
  | 'finance'
  | 'healthcare'
  | 'labor'
  | 'consumer'
  | 'ai_governance'
  | 'project_governance'
  | 'custom';

export interface PolicyPackScope {
  readonly global: boolean;
  readonly jurisdictionSpecific: boolean;
  readonly domainSpecific: boolean;
  readonly useCaseSpecific: boolean;
  readonly customerSpecific: boolean;
  readonly demoOnly: boolean;
  readonly systemAuthored: boolean;
}

export type PolicyPackValidationStatus =
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

export type PolicyPackSourceStatus =
  | 'system_authored'
  | 'demo_fixture'
  | 'customer_provided'
  | 'customer_validated'
  | 'counsel_provided'
  | 'counsel_reviewed'
  | 'counsel_attested'
  | 'operator_provided'
  | 'external_reference'
  | 'unknown';

export interface PolicyPackSafeFraming {
  readonly notLegalAdvice: boolean;
  readonly notComplianceCertification: boolean;
  readonly noCompletenessClaim: boolean;
  readonly noJurisdictionalComplianceClaim: boolean;
  readonly partialPolicyModel: boolean;
  readonly requiresCustomerValidation?: boolean;
  readonly requiresCounselReviewWhenApplicable?: boolean;
  readonly requiresDomainExpertReviewWhenApplicable?: boolean;
}

export type PolicyPackApprovalReviewType =
  | 'operator_review'
  | 'customer_validation'
  | 'legal_review'
  | 'counsel_review'
  | 'tax_review'
  | 'compliance_review'
  | 'security_review'
  | 'privacy_review'
  | 'business_review';

export interface PolicyPackEvidenceRequirement {
  readonly id: string;
  readonly evidenceType: string;
  readonly required: boolean;
  readonly runtimeRef?: string;
  readonly sourceRuntimeRef?: string;
  readonly citationRuntimeRef?: string;
  readonly proofRuntimeRef?: string;
}

export interface PolicyPackApprovalRequirement {
  readonly id: string;
  readonly reviewType: PolicyPackApprovalReviewType;
  readonly required: boolean;
  readonly runtimeRef?: string;
  readonly reasonCode?: string;
}

export type PolicyPackExportType = 'audit_bundle' | 'policy_decision' | 'composition_bundle' | 'manifest_bundle' | 'evidence_bundle' | 'approval_bundle';

export interface PolicyPackExportRequirement {
  readonly id: string;
  readonly exportType: PolicyPackExportType;
  readonly required: boolean;
  readonly runtimeRef?: string;
}

export type PolicyPackControlPlaneSurface = 'policy_pack' | 'manifest' | 'composition' | 'validation' | 'evidence' | 'approval' | 'export';

export interface PolicyPackControlPlaneRequirement {
  readonly id: string;
  readonly surface: PolicyPackControlPlaneSurface;
  readonly required: boolean;
  readonly runtimeRef?: string;
  readonly safeDisplayLabels: readonly string[];
}

export interface PolicyPackClaimProfile {
  readonly allowedClaims: readonly string[];
  readonly prohibitedClaims: readonly string[];
  readonly requiredDisclaimers: readonly string[];
  readonly claimValidationStatus: PolicyPackValidationStatus;
}

export interface PolicyPackManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  readonly kind: PolicyPackKind;
  readonly domain: PolicyPackDomain;
  readonly scope: PolicyPackScope;

  readonly status: PolicyPackValidationStatus;
  readonly sourceStatus: PolicyPackSourceStatus;

  readonly safeFraming: PolicyPackSafeFraming;

  readonly description: string;

  readonly extendsPackIds: readonly string[];
  readonly requiredPackIds: readonly string[];
  readonly optionalPackIds: readonly string[];

  readonly evidenceRequirements: readonly PolicyPackEvidenceRequirement[];
  readonly approvalRequirements: readonly PolicyPackApprovalRequirement[];
  readonly exportRequirements: readonly PolicyPackExportRequirement[];
  readonly controlPlaneRequirements: readonly PolicyPackControlPlaneRequirement[];

  readonly claimProfile: PolicyPackClaimProfile;

  readonly createdBy?: string;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;

  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;

  readonly supersedesPackId?: string;
  readonly supersededByPackId?: string;

  readonly labels: readonly string[];
  readonly notes: readonly string[];
}
