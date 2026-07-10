import type { KernelTrace } from './kernel-trace.js';

/**
 * Coarse, stable status bucket. The wrapped engine's `EnforcementDecisionType`
 * has 11 variants; this collapses them into 4 per the kernel's public
 * contract. The mapping (documented in `reason-codes/reason-codes.ts`) is:
 *   - allowed            <- execute_allowed, dry_run_allowed, duplicate_suppressed
 *   - denied             <- execution_blocked, adapter_denied, emergency_denied, expired, invalid_request
 *   - approval_required  <- approval_required, evidence_required, external_handshake_required
 *   - indeterminate      <- a kernel-boundary failure (e.g. an unhandled throw from the
 *                           recognition provider) that the wrapped engine itself does not
 *                           catch -- see AOC_KERNEL_INVARIANTS_V1.md
 * `reasonCodes` (not `status`) is the fine-grained, stable machine-readable signal --
 * `approval_required` status does not by itself distinguish "needs human approval" from
 * "needs more evidence"; the reason codes do.
 */
export type KernelDecisionStatus = 'allowed' | 'denied' | 'approval_required' | 'indeterminate';

/** Reflects only what `RecognitionVerificationResult` exposes structurally -- not recognition-runtime's internal per-policy chain, which is not visible across that structural boundary. */
export interface RecognitionEvaluation {
  readonly performed: boolean;
  readonly decisionId?: string;
  readonly decisionType?: string;
  readonly recognized?: boolean;
  readonly reasonCode?: string;
  readonly reason?: string;
}

/** Derived solely from the `authorityDecisionId`/`authorityProofId` references a recognition result carries -- Authority Graph's own decision object is not visible across the structural `EnforcementRecognitionIntegration` boundary, so no `valid` field is fabricated here. */
export interface AuthorityEvaluation {
  readonly performed: boolean;
  readonly decisionId?: string;
  readonly proofId?: string;
}

/** One-to-one with `EnforcementPolicyResult` from the wrapped engine's own (action-enforcement) policy chain. */
export interface PolicyEvaluation {
  readonly policyId: string;
  readonly passed: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly severity: 'info' | 'warning' | 'error' | 'critical';
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type ApprovalStatus = 'not_applicable' | 'pending' | 'granted';

/** `status: 'rejected'` was considered and omitted: the structural `RecognitionVerificationResult` does not reliably distinguish an approval rejection from other hard-block reasons -- see AOC_KERNEL_INVARIANTS_V1.md. */
export interface ApprovalEvaluation {
  readonly performed: boolean;
  readonly status: ApprovalStatus;
  readonly requestId?: string;
  readonly decisionId?: string;
  readonly proofId?: string;
}

/** One entry per `evidence_required`-policy result the wrapped engine's own chain recorded. */
export interface EvidenceEvaluation {
  readonly policyId: string;
  readonly passed: boolean;
  readonly reasonCode: string;
  readonly reason: string;
}

export interface KernelEvaluationResult {
  readonly requestId: string;
  readonly decisionId: string;
  readonly status: KernelDecisionStatus;
  readonly reasonCodes: readonly string[];
  readonly summary: string;
  readonly recognition: RecognitionEvaluation;
  readonly authority: AuthorityEvaluation;
  readonly policies: readonly PolicyEvaluation[];
  readonly approval: ApprovalEvaluation;
  readonly evidence: readonly EvidenceEvaluation[];
  readonly trace: KernelTrace;
  readonly evaluatedAt: string;
  readonly kernelVersion: string;
  readonly correlationId?: string;
}
