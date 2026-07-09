/**
 * Structural mirror of `RecognitionCapabilityToken`
 * (`src/features/recognition-runtime/domain/capability-token.ts`), re-scoped
 * to PMFreak's capability vocabulary.
 *
 * This module never imports `RecognitionCapabilityToken` directly:
 * `src/features/recognition-runtime` is internal to the root
 * `@aoc-enterprise/runtime` package and is not part of its public `exports`
 * map, so a separate `packages/*` workspace member has no legitimate import
 * path to it. The field shape is intentionally identical to the real
 * capability token (minus its optional `proof` field, which references
 * `RecognitionProof` -- another internal-only type this package does not
 * need) so a future sprint that exports `recognition-runtime` from the root
 * package's public surface can replace this mirror with a real import.
 */
export type PMFreakCapabilityTokenRiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'prohibited';

export type PMFreakCapabilityTokenStatus = 'valid' | 'expired' | 'suspended' | 'revoked';

export interface PMFreakCapabilityConstraintsMirror {
  readonly prohibitedActions: readonly string[];
}

export interface PMFreakCapabilityDelegationMirror {
  readonly delegable: boolean;
  readonly delegatedFromTokenId?: string;
  readonly delegationDepth: number;
  readonly maxDelegationDepth: number;
}

export interface PMFreakCapabilityEvidenceRequirementMirror {
  readonly action: string;
  readonly requiredEvidenceTypes: readonly string[];
}

export interface PMFreakCapabilityApprovalRequirementMirror {
  readonly actions: readonly string[];
  readonly requiredApproverRoleIds?: readonly string[];
}

export interface PMFreakCapabilityTokenMirror {
  readonly id: string;
  readonly passportId: string;
  readonly role: string;
  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly jurisdiction?: string;
  readonly constraints: PMFreakCapabilityConstraintsMirror;
  readonly delegation: PMFreakCapabilityDelegationMirror;
  readonly evidenceRequirements: readonly PMFreakCapabilityEvidenceRequirementMirror[];
  readonly approvalRequirement?: PMFreakCapabilityApprovalRequirementMirror;
  readonly riskLevel: PMFreakCapabilityTokenRiskLevel;
  readonly status: PMFreakCapabilityTokenStatus;
  readonly issuedAt: string;
  readonly expiresAt?: string;
}
