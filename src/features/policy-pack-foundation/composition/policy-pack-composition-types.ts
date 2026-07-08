import type { PolicyPackApprovalRequirement, PolicyPackControlPlaneRequirement, PolicyPackEvidenceRequirement, PolicyPackExportRequirement, PolicyPackManifest, PolicyPackSafeFraming, PolicyPackValidationStatus } from '../manifest/policy-pack-manifest-types.js';

export interface PolicyPackCompositionInput {
  readonly compositionId: string;
  readonly rootPackId: string;
  readonly requestedPackIds: readonly string[];
  readonly availableManifests: readonly PolicyPackManifest[];
  readonly requiredValidationStatus?: readonly PolicyPackValidationStatus[];
  readonly requestedAt?: string;
}

export type PolicyPackDependencyType = 'extends' | 'requires' | 'optional';

export interface PolicyPackDependencyEdge {
  readonly fromPackId: string;
  readonly toPackId: string;
  readonly dependencyType: PolicyPackDependencyType;
  readonly satisfied: boolean;
}

export type PolicyPackCompositionDecision =
  | 'allow'
  | 'hold'
  | 'deny'
  | 'require_review'
  | 'require_approval'
  | 'require_customer_validation'
  | 'require_counsel_review'
  | 'require_domain_expert_review'
  | 'require_compliance_review';

export interface PolicyPackCompositionResult {
  readonly compositionId: string;
  readonly rootPackId: string;

  readonly composed: boolean;

  readonly includedPackIds: readonly string[];
  readonly missingPackIds: readonly string[];
  readonly expiredPackIds: readonly string[];
  readonly supersededPackIds: readonly string[];
  readonly disabledPackIds: readonly string[];

  readonly dependencyGraph: readonly PolicyPackDependencyEdge[];

  readonly validationStatusSatisfied: boolean;

  readonly requiredEvidence: readonly PolicyPackEvidenceRequirement[];
  readonly requiredApprovals: readonly PolicyPackApprovalRequirement[];
  readonly requiredExports: readonly PolicyPackExportRequirement[];
  readonly requiredControlPlaneSurfaces: readonly PolicyPackControlPlaneRequirement[];

  readonly safeFraming: PolicyPackSafeFraming;

  readonly decision: PolicyPackCompositionDecision;

  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}
