/**
 * Soberanía Enterprise Evidence Bundle v1 (PR-005) -- portable, disclosure-
 * governed projections of Governance Store records. See
 * `docs/enterprise/AOC_EVIDENCE_BUNDLE.md`.
 */

export {
  AOC_EVIDENCE_BUNDLE_VERSION,
  EVIDENCE_BUNDLE_SCHEMA_VERSION,
  EVIDENCE_PROJECTION_ENGINE_VERSION,
  EVIDENCE_CONTRACT_IDS,
  EVIDENCE_FIELD_KEYS,
} from './contracts.js';
export type {
  DisclosureLevel,
  DisclosurePolicy,
  EvidenceFieldKey,
  EvidenceDisclosureMetadata,
  EvidenceSource,
  EvidenceSubject,
  EvidenceSubjectType,
  EvidenceTraceStep,
  EvidenceEventSummary,
  EvidenceContent,
  EvidenceIntegrityMetadata,
  EvidenceProvenance,
  EvidenceReference,
  EvidenceReferenceType,
  EvidenceBundle,
  EvidenceBundleState,
  EvidenceBundleRecord,
  EvidenceIntegrityFailure,
  EvidenceVerificationResult,
} from './contracts.js';

export { EvidenceError, isEvidenceError } from './errors.js';
export type { EvidenceErrorCode } from './errors.js';

export {
  FULL_DISCLOSURE_POLICY,
  AUDITOR_DISCLOSURE_POLICY,
  PARTNER_DISCLOSURE_POLICY,
  CUSTOMER_DISCLOSURE_POLICY,
  PUBLIC_DISCLOSURE_POLICY,
  getDisclosurePolicy,
  findDisclosurePolicyById,
  listDisclosurePolicies,
} from './disclosure-policies.js';

export { buildEvidenceBundle, bundleDigestInput, verificationDigestInput, EVIDENCE_DISCLOSURE_REDACTED_VALUE } from './projector.js';
export type { EvidenceProjectionDependencies } from './projector.js';

export { verifyEvidenceBundle } from './verifier.js';

export { createInMemoryEvidenceStore } from './evidence-store.js';
export type { EvidenceStore, CreateEvidenceStoreOptions } from './evidence-store.js';

export { createEvidenceService } from './evidence-service.js';
export type { EvidenceService, EvidenceServiceDependencies, BuildEvidenceBundleInput } from './evidence-service.js';
