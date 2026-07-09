/**
 * Structural mirror of `EvidenceRequirement`
 * (`src/features/evidence-source-runtime/domain/evidence-requirement.ts`),
 * re-scoped to PMFreak's evidence vocabulary.
 *
 * This module never imports `EvidenceRequirement`/`EvidenceRuntime` directly:
 * `src/features/evidence-source-runtime` is internal to the root
 * `@aoc-enterprise/runtime` package (not one of its public `exports`
 * subpaths -- '.', './authorization', './audit', './crypto', './adapters'),
 * so a separate `packages/*` workspace member has no legitimate import path
 * to it. The field shape below is intentionally identical to the real
 * `EvidenceRequirement` so that a future sprint which *does* export
 * `evidence-source-runtime` from the root package's public surface can
 * replace this mirror with a real import with no shape changes required of
 * PMFreak callers.
 */
export type PMFreakEvidenceRequirementType =
  | 'project_status_source'
  | 'schedule_baseline'
  | 'dependency_record'
  | 'risk_record'
  | 'mitigation_record'
  | 'deliverable_evidence'
  | 'customer_acceptance_record'
  | 'pm_approval_record'
  | 'change_request_record'
  | 'billing_milestone_record'
  | 'client_communication_draft'
  | 'meeting_minutes'
  | 'scope_statement'
  | 'contract_reference';

export type PMFreakEvidenceRequirementStatus =
  | 'open'
  | 'satisfied'
  | 'partially_satisfied'
  | 'rejected'
  | 'waived'
  | 'expired';

export interface PMFreakEvidenceRequirementMirror {
  readonly id: string;
  readonly type: PMFreakEvidenceRequirementType;
  readonly passportId: string;
  readonly role: string;
  readonly action?: string;
  readonly description: string;
  readonly required: boolean;
  readonly status: PMFreakEvidenceRequirementStatus;
  readonly createdAt: string;
  readonly satisfiedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
