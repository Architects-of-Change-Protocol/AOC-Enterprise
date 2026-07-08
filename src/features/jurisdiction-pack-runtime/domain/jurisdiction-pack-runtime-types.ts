import type {
  ApprovalRuntimeReference,
  ControlPlaneReference,
  EvidenceRuntimeReference,
  ExportRuntimeReference,
  PolicyPackCompositionResult,
  PolicyPackManifest,
  PolicyPackValidationStatus,
} from '../../policy-pack-foundation/index.js';

/**
 * An opaque jurisdiction identifier this runtime resolves against. This is
 * never a real ISO country/state/province code and never implies real
 * jurisdictional coverage -- it is only a lookup key for demo/customer
 * jurisdiction packs registered with this runtime. See the fixtures for
 * examples (`demo-jurisdiction-alpha`, `demo-jurisdiction-beta`).
 */
export type JurisdictionCode = string;

/**
 * Registers one `PolicyPackManifest` (built with `kind: 'jurisdiction_pack'`,
 * `domain: 'jurisdiction'` via the Policy Pack Foundation's
 * `createPolicyPackManifest`) under a jurisdiction code. This is the only
 * jurisdiction-specific concept this runtime adds on top of the Foundation --
 * everything else (manifest shape, validation status, safe framing,
 * composition, no-overclaim) is consumed directly from
 * `policy-pack-foundation`, never reimplemented.
 */
export interface JurisdictionPackRegistration {
  readonly jurisdictionCode: JurisdictionCode;
  readonly manifest: PolicyPackManifest;
}

export interface JurisdictionResolutionInput {
  readonly jurisdictionCode: JurisdictionCode;
  /** Additional pack ids (domain packs, customer packs, operator overrides) to compose alongside the resolved jurisdiction pack. */
  readonly requestedPackIds?: readonly string[];
  /**
   * Manifests the jurisdiction pack depends on (e.g. a global baseline pack)
   * but that are not themselves jurisdiction packs, so they are never
   * registered in the `JurisdictionPackRegistry`. Combined with the
   * registry's own manifests before calling `composePolicyPacks`.
   */
  readonly availableManifests?: readonly PolicyPackManifest[];
  /** Defaults to the resolved jurisdiction pack's manifest id. */
  readonly rootPackId?: string;
  readonly requiredValidationStatus?: readonly PolicyPackValidationStatus[];
  /** Deterministic composition id; defaults to a value derived from `jurisdictionCode` and the resolved root pack id -- never a system-clock timestamp or random value. */
  readonly compositionId?: string;
}

export type JurisdictionResolutionStatus = 'resolved' | 'unresolved' | 'ambiguous';

export interface JurisdictionResolutionResult {
  readonly status: JurisdictionResolutionStatus;
  readonly jurisdictionCode: JurisdictionCode;
  readonly matchedPackIds: readonly string[];
  readonly composition?: PolicyPackCompositionResult;
  readonly approvalReferences: readonly ApprovalRuntimeReference[];
  readonly evidenceReferences: readonly EvidenceRuntimeReference[];
  readonly exportReferences: readonly ExportRuntimeReference[];
  readonly controlPlaneReferences: readonly ControlPlaneReference[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}
