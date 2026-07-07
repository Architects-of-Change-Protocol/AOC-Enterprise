/**
 * The result of checking whether evidence currently on file satisfies a set
 * of EvidenceRequirements. `valid` reflects evidence completeness only -- it
 * is never a legal-sufficiency conclusion, and a caller must never treat
 * `valid: true` as proof of legal compliance.
 */
export interface EvidenceValidationResult {
  readonly id: string;
  readonly valid: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly missingRequirementIds: readonly string[];
  readonly rejectedEvidenceArtifactIds: readonly string[];
  readonly expiredEvidenceArtifactIds: readonly string[];
  readonly staleSourceDocumentIds: readonly string[];
  readonly requirementIds: readonly string[];
  readonly satisfiedRequirementIds: readonly string[];
  readonly proofId?: string;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
