/**
 * Foundation Runtime Alignment types.
 *
 * These types describe, truthfully, which Foundation capabilities a given
 * Soberanía Enterprise checkout actually has available versus which are only
 * reference-able seams for a capability that is planned, missing, or
 * disabled. Nothing in this file (or the functions built on top of it)
 * calls into a real runtime -- it only records and validates claims about
 * runtime availability so policy packs never overstate what integrations
 * actually exist.
 */

export type FoundationRuntimeCapability =
  | 'recognition_runtime'
  | 'authority_graph'
  | 'approval_runtime'
  | 'evidence_runtime'
  | 'source_runtime'
  | 'citation_runtime'
  | 'proof_runtime'
  | 'verifiable_export_package'
  | 'control_plane'
  | 'domain_policy_pack_runtime'
  | 'jurisdiction_pack_runtime'
  | 'policy_pack_manifest_standard'
  | 'policy_pack_composition_runtime'
  | 'policy_pack_validation_harness';

export type FoundationRuntimeAvailability = 'available' | 'reference_only' | 'planned' | 'missing' | 'disabled';

export interface FoundationRuntimeIntegrationStatus {
  readonly capability: FoundationRuntimeCapability;
  readonly availability: FoundationRuntimeAvailability;
  readonly modulePath?: string;
  readonly adapterId?: string;
  readonly notes: readonly string[];
}

export type ApprovalRuntimeReviewType =
  | 'operator_review'
  | 'customer_validation'
  | 'legal_review'
  | 'counsel_review'
  | 'tax_review'
  | 'compliance_review'
  | 'security_review'
  | 'privacy_review'
  | 'business_review';

export type ApprovalRuntimeReferenceStatus = 'pending' | 'approved' | 'rejected' | 'not_available' | 'reference_only';

export interface ApprovalRuntimeReference {
  readonly approvalRuntimeRef: string;
  readonly reviewType: ApprovalRuntimeReviewType;
  readonly required: boolean;
  readonly status: ApprovalRuntimeReferenceStatus;
  readonly sourcePackId?: string;
  readonly reasonCode?: string;
}

export type EvidenceRuntimeReferenceStatus = 'present' | 'missing' | 'not_available' | 'reference_only';

export interface EvidenceRuntimeReference {
  readonly evidenceRuntimeRef: string;
  readonly evidenceType: string;
  readonly required: boolean;
  readonly status: EvidenceRuntimeReferenceStatus;
  readonly sourcePackId?: string;
  readonly sourceId?: string;
  readonly citationId?: string;
  readonly proofId?: string;
}

export type SourceRuntimeType =
  | 'customer_policy'
  | 'contract_template'
  | 'authority_record'
  | 'counsel_attestation'
  | 'operator_review'
  | 'external_reference'
  | 'internal_policy'
  | 'demo_fixture';

export type SourceRuntimeReferenceStatus = 'present' | 'missing' | 'not_available' | 'reference_only';

export interface SourceRuntimeReference {
  readonly sourceRuntimeRef: string;
  readonly sourceType: SourceRuntimeType;
  readonly required: boolean;
  readonly status: SourceRuntimeReferenceStatus;
  readonly sourcePackId?: string;
}

export type CitationRuntimeType = 'source_excerpt' | 'policy_reference' | 'attestation_reference' | 'evidence_reference' | 'demo_reference';

export type CitationRuntimeReferenceStatus = 'present' | 'missing' | 'not_available' | 'reference_only';

export interface CitationRuntimeReference {
  readonly citationRuntimeRef: string;
  readonly citationType: CitationRuntimeType;
  readonly required: boolean;
  readonly status: CitationRuntimeReferenceStatus;
  readonly sourcePackId?: string;
}

export type ProofRuntimeType = 'policy_decision' | 'evidence_bundle' | 'approval_record' | 'composition_result' | 'export_bundle' | 'demo_fixture';

export type ProofRuntimeReferenceStatus = 'present' | 'missing' | 'not_available' | 'reference_only';

export interface ProofRuntimeReference {
  readonly proofRuntimeRef: string;
  readonly proofType: ProofRuntimeType;
  readonly required: boolean;
  readonly status: ProofRuntimeReferenceStatus;
  readonly sourcePackId?: string;
}

export type ExportRuntimeType = 'audit_bundle' | 'policy_decision' | 'jurisdiction_resolution' | 'evidence_bundle' | 'composition_bundle' | 'manifest_bundle';

export type ExportRuntimeReferenceStatus = 'available' | 'not_available' | 'reference_only';

export interface ExportRuntimeReference {
  readonly exportRuntimeRef: string;
  readonly exportType: ExportRuntimeType;
  readonly required: boolean;
  readonly status: ExportRuntimeReferenceStatus;
  readonly sourcePackId?: string;
}

export type ControlPlaneSurface = 'policy_pack' | 'jurisdiction_pack' | 'approval' | 'evidence' | 'export' | 'composition' | 'manifest' | 'validation';

export type ControlPlaneReferenceStatus = 'available' | 'not_available' | 'reference_only';

export interface ControlPlaneReference {
  readonly controlPlaneRef: string;
  readonly surface: ControlPlaneSurface;
  readonly displaySafeLabels: readonly string[];
  readonly status: ControlPlaneReferenceStatus;
  readonly sourcePackId?: string;
}

export interface FoundationRuntimeReferenceMap {
  readonly approval?: readonly ApprovalRuntimeReference[];
  readonly evidence?: readonly EvidenceRuntimeReference[];
  readonly source?: readonly SourceRuntimeReference[];
  readonly citation?: readonly CitationRuntimeReference[];
  readonly proof?: readonly ProofRuntimeReference[];
  readonly export?: readonly ExportRuntimeReference[];
  readonly controlPlane?: readonly ControlPlaneReference[];
}

export interface FoundationRuntimeValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export type FoundationRuntimeAlignmentStatus = 'aligned' | 'aligned_with_reference_only_integrations' | 'missing_required_capabilities' | 'blocked';

export interface FoundationRuntimeAlignmentReport {
  readonly status: FoundationRuntimeAlignmentStatus;
  readonly availableCapabilities: readonly FoundationRuntimeCapability[];
  readonly referenceOnlyCapabilities: readonly FoundationRuntimeCapability[];
  readonly plannedCapabilities: readonly FoundationRuntimeCapability[];
  readonly missingCapabilities: readonly FoundationRuntimeCapability[];
  readonly disabledCapabilities: readonly FoundationRuntimeCapability[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly generatedAt?: string;
}
