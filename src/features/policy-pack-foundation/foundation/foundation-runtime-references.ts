import type {
  ApprovalRuntimeReference,
  ApprovalRuntimeReferenceStatus,
  CitationRuntimeReference,
  CitationRuntimeReferenceStatus,
  ControlPlaneReference,
  ControlPlaneReferenceStatus,
  EvidenceRuntimeReference,
  EvidenceRuntimeReferenceStatus,
  ExportRuntimeReference,
  ExportRuntimeReferenceStatus,
  FoundationRuntimeCapability,
  FoundationRuntimeIntegrationStatus,
  FoundationRuntimeReferenceMap,
  ProofRuntimeReference,
  ProofRuntimeReferenceStatus,
  SourceRuntimeReference,
  SourceRuntimeReferenceStatus,
} from './foundation-runtime-types.js';
import { findFoundationRuntimeCapabilityStatus } from './foundation-runtime-capabilities.js';

export interface CreateFoundationRuntimeReferenceMapInput {
  readonly capabilities: readonly FoundationRuntimeIntegrationStatus[];
  readonly approval?: readonly ApprovalRuntimeReference[];
  readonly evidence?: readonly EvidenceRuntimeReference[];
  readonly source?: readonly SourceRuntimeReference[];
  readonly citation?: readonly CitationRuntimeReference[];
  readonly proof?: readonly ProofRuntimeReference[];
  readonly export?: readonly ExportRuntimeReference[];
  readonly controlPlane?: readonly ControlPlaneReference[];
}

/**
 * Statuses that, for a given reference category, only ever mean "no runtime
 * execution is being claimed" -- these are always safe to keep regardless of
 * whether the underlying Foundation capability is actually available.
 */
const SAFE_APPROVAL_STATUSES: readonly ApprovalRuntimeReferenceStatus[] = ['not_available', 'reference_only'];
const SAFE_EVIDENCE_STATUSES: readonly EvidenceRuntimeReferenceStatus[] = ['not_available', 'reference_only'];
const SAFE_SOURCE_STATUSES: readonly SourceRuntimeReferenceStatus[] = ['not_available', 'reference_only'];
const SAFE_CITATION_STATUSES: readonly CitationRuntimeReferenceStatus[] = ['not_available', 'reference_only'];
const SAFE_PROOF_STATUSES: readonly ProofRuntimeReferenceStatus[] = ['not_available', 'reference_only'];
const SAFE_EXPORT_STATUSES: readonly ExportRuntimeReferenceStatus[] = ['not_available', 'reference_only'];
const SAFE_CONTROL_PLANE_STATUSES: readonly ControlPlaneReferenceStatus[] = ['not_available', 'reference_only'];

function isCapabilityAvailable(
  capabilities: readonly FoundationRuntimeIntegrationStatus[],
  capability: FoundationRuntimeCapability,
): boolean {
  return findFoundationRuntimeCapabilityStatus(capabilities, capability)?.availability === 'available';
}

/** `missing`/`disabled` capabilities clamp to `not_available`; `reference_only`/`planned` clamp to `reference_only`. */
function clampUnavailableStatus(capabilities: readonly FoundationRuntimeIntegrationStatus[], capability: FoundationRuntimeCapability): 'not_available' | 'reference_only' {
  const availability = findFoundationRuntimeCapabilityStatus(capabilities, capability)?.availability ?? 'missing';
  return availability === 'missing' || availability === 'disabled' ? 'not_available' : 'reference_only';
}

function normalizeApprovalReference(ref: ApprovalRuntimeReference, capabilities: readonly FoundationRuntimeIntegrationStatus[]): ApprovalRuntimeReference {
  if (isCapabilityAvailable(capabilities, 'approval_runtime') || SAFE_APPROVAL_STATUSES.includes(ref.status)) return { ...ref };
  return { ...ref, status: clampUnavailableStatus(capabilities, 'approval_runtime') };
}

function normalizeEvidenceReference(ref: EvidenceRuntimeReference, capabilities: readonly FoundationRuntimeIntegrationStatus[]): EvidenceRuntimeReference {
  if (isCapabilityAvailable(capabilities, 'evidence_runtime') || SAFE_EVIDENCE_STATUSES.includes(ref.status)) return { ...ref };
  return { ...ref, status: clampUnavailableStatus(capabilities, 'evidence_runtime') };
}

function normalizeSourceReference(ref: SourceRuntimeReference, capabilities: readonly FoundationRuntimeIntegrationStatus[]): SourceRuntimeReference {
  if (isCapabilityAvailable(capabilities, 'source_runtime') || SAFE_SOURCE_STATUSES.includes(ref.status)) return { ...ref };
  return { ...ref, status: clampUnavailableStatus(capabilities, 'source_runtime') };
}

function normalizeCitationReference(ref: CitationRuntimeReference, capabilities: readonly FoundationRuntimeIntegrationStatus[]): CitationRuntimeReference {
  if (isCapabilityAvailable(capabilities, 'citation_runtime') || SAFE_CITATION_STATUSES.includes(ref.status)) return { ...ref };
  return { ...ref, status: clampUnavailableStatus(capabilities, 'citation_runtime') };
}

function normalizeProofReference(ref: ProofRuntimeReference, capabilities: readonly FoundationRuntimeIntegrationStatus[]): ProofRuntimeReference {
  if (isCapabilityAvailable(capabilities, 'proof_runtime') || SAFE_PROOF_STATUSES.includes(ref.status)) return { ...ref };
  return { ...ref, status: clampUnavailableStatus(capabilities, 'proof_runtime') };
}

function normalizeExportReference(ref: ExportRuntimeReference, capabilities: readonly FoundationRuntimeIntegrationStatus[]): ExportRuntimeReference {
  if (isCapabilityAvailable(capabilities, 'verifiable_export_package') || SAFE_EXPORT_STATUSES.includes(ref.status)) return { ...ref };
  return { ...ref, status: clampUnavailableStatus(capabilities, 'verifiable_export_package') };
}

function normalizeControlPlaneReference(ref: ControlPlaneReference, capabilities: readonly FoundationRuntimeIntegrationStatus[]): ControlPlaneReference {
  if (isCapabilityAvailable(capabilities, 'control_plane') || SAFE_CONTROL_PLANE_STATUSES.includes(ref.status)) return { ...ref, displaySafeLabels: [...ref.displaySafeLabels] };
  return { ...ref, status: clampUnavailableStatus(capabilities, 'control_plane'), displaySafeLabels: [...ref.displaySafeLabels] };
}

/**
 * Normalizes every reference category against the real Foundation capability
 * statuses. A reference that claims an "executed" status (e.g. `approved`,
 * `present`, `available`) for a capability that is not actually `available`
 * is clamped down to `reference_only` (capability is `reference_only`/`planned`)
 * or `not_available` (capability is `missing`/`disabled`) -- callers can never
 * make this map claim more than the underlying Foundation capability supports.
 */
export function createFoundationRuntimeReferenceMap(input: CreateFoundationRuntimeReferenceMapInput): FoundationRuntimeReferenceMap {
  const { capabilities } = input;
  const result: {
    approval?: readonly ApprovalRuntimeReference[];
    evidence?: readonly EvidenceRuntimeReference[];
    source?: readonly SourceRuntimeReference[];
    citation?: readonly CitationRuntimeReference[];
    proof?: readonly ProofRuntimeReference[];
    export?: readonly ExportRuntimeReference[];
    controlPlane?: readonly ControlPlaneReference[];
  } = {};

  if (input.approval !== undefined) result.approval = input.approval.map((ref) => normalizeApprovalReference(ref, capabilities));
  if (input.evidence !== undefined) result.evidence = input.evidence.map((ref) => normalizeEvidenceReference(ref, capabilities));
  if (input.source !== undefined) result.source = input.source.map((ref) => normalizeSourceReference(ref, capabilities));
  if (input.citation !== undefined) result.citation = input.citation.map((ref) => normalizeCitationReference(ref, capabilities));
  if (input.proof !== undefined) result.proof = input.proof.map((ref) => normalizeProofReference(ref, capabilities));
  if (input.export !== undefined) result.export = input.export.map((ref) => normalizeExportReference(ref, capabilities));
  if (input.controlPlane !== undefined) result.controlPlane = input.controlPlane.map((ref) => normalizeControlPlaneReference(ref, capabilities));

  return result;
}
