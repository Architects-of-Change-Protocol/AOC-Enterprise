import type { KernelTrace } from './kernel-trace.js';

/**
 * Coarse, stable status bucket. The wrapped engine's `EnforcementDecisionType`
 * has 11 variants; this collapses them into 4 per the kernel's public
 * contract. The mapping (documented in `reason-codes/reason-codes.ts`) is:
 *   - allowed            <- execute_allowed, dry_run_allowed
 *   - denied             <- execution_blocked, adapter_denied, emergency_denied, expired,
 *                           invalid_request, duplicate_suppressed (already executed once under
 *                           this idempotency key; the engine deliberately will not run it again --
 *                           `allowedToExecute` is false for this decision type in the wrapped engine
 *                           too, see `EXECUTABLE_DECISION_TYPES`. `ACTION_DUPLICATE_SUPPRESSED` in
 *                           `reasonCodes` distinguishes it from a genuine governance denial.)
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

/**
 * One governed right's coverage verdict from the configured
 * `GovernedAuthorityProvider`, reported per right so a two-right action's
 * denial names the right that actually failed rather than the action as a
 * whole.
 *
 * `holderRef` is reported alongside because it is frequently *not* the
 * requesting actor, and a reviewer reading a denial needs to see whose
 * authority was checked.
 */
export interface GovernedRightEvaluation {
  readonly governedRight: string;
  readonly holderRef: string;
  readonly outcome: string;
  /**
   * Whether recognized governed authority was actually *verified* to cover
   * this right — not whether the request was let through.
   *
   * A right on an unenrolled resource is `covered: false` with the enclosing
   * `enforced: false`: the request proceeds under the legacy compatibility
   * policy, and reporting that as coverage would assert a check that never
   * happened.
   */
  readonly covered: boolean;
}

/**
 * The governed-authority half of an authority evaluation: whether the typed,
 * right-scoped check ran, and what it found for each right the action
 * declared.
 *
 * `performed: false` with no results means the action declared no governed
 * right, or no provider is configured -- both of which are ordinary and
 * neither of which is a finding. `enforced` distinguishes "ran and the
 * resource is enrolled" from "ran and this deployment holds no authority state
 * for the resource at all", which is the distinction the legacy compatibility
 * policy turns on.
 */
export interface GovernedAuthorityEvaluation {
  readonly performed: boolean;
  readonly enforced: boolean;
  readonly rights: readonly GovernedRightEvaluation[];
}

/** Derived from the `authorityDecisionId`/`authorityProofId` references a recognition result carries -- Authority Graph's own decision object is not visible across the structural `EnforcementRecognitionIntegration` boundary, so no `valid` field is fabricated here -- plus, when configured, the governed-authority verdict `AocKernel` obtained directly from its own provider port. */
export interface AuthorityEvaluation {
  readonly performed: boolean;
  readonly decisionId?: string;
  readonly proofId?: string;
  /** Present only when a `GovernedAuthorityProvider` is configured. Absent means the kernel asked no governed-right question, not that one passed. */
  readonly governedAuthority?: GovernedAuthorityEvaluation;
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
