import type { EnforcementDecision } from '../../features/action-enforcement/domain/enforcement-decision.js';
import type { ExecutionResult } from '../../features/action-enforcement/domain/execution-result.js';
import type { KernelEnforcementResult, KernelExecutionOutcome } from '../contracts/kernel-enforcement-result.js';
import type { KernelEvaluationOptions } from '../contracts/kernel-options.js';
import type {
  ApprovalEvaluation,
  ApprovalStatus,
  AuthorityEvaluation,
  EvidenceEvaluation,
  KernelEvaluationResult,
  PolicyEvaluation,
  RecognitionEvaluation,
} from '../contracts/kernel-result.js';
import type { KernelTrace, KernelTraceStep } from '../contracts/kernel-trace.js';
import { mapDecisionToReasonCodes, mapDecisionTypeToStatus } from '../reason-codes/reason-codes.js';
import { AOC_KERNEL_VERSION } from '../versioning.js';

/** Mirrors recognition-runtime's own `RECOGNIZED_DECISION_TYPES` constant (`src/features/recognition-runtime/services/recognition-verifier.ts`) -- duplicated here (not imported) because action-enforcement deliberately never imports recognition-runtime's domain types directly, and the kernel follows that same structural-boundary discipline. */
const RECOGNIZED_RECOGNITION_TYPES: ReadonlySet<string> = new Set(['allow', 'require_human_approval', 'require_more_evidence']);

const RECOGNITION_GATED_POLICY_IDS: ReadonlySet<string> = new Set(['recognition_required', 'allow_decision_required']);
const EVIDENCE_POLICY_ID = 'evidence_required';

function buildRecognitionEvaluation(decision: EnforcementDecision): RecognitionEvaluation {
  const performed = decision.recognitionDecisionType !== undefined;
  const firstFailed = decision.policyResults.find((result) => !result.passed);
  const reasonAttributableToRecognition = firstFailed !== undefined && RECOGNITION_GATED_POLICY_IDS.has(firstFailed.policyId);

  return {
    performed,
    ...(decision.recognitionDecisionId !== undefined ? { decisionId: decision.recognitionDecisionId } : {}),
    ...(decision.recognitionDecisionType !== undefined ? { decisionType: decision.recognitionDecisionType } : {}),
    ...(performed ? { recognized: RECOGNIZED_RECOGNITION_TYPES.has(decision.recognitionDecisionType as string) } : {}),
    ...(reasonAttributableToRecognition ? { reasonCode: decision.reasonCode, reason: decision.reason } : {}),
  };
}

function buildAuthorityEvaluation(decision: EnforcementDecision): AuthorityEvaluation {
  const performed = decision.authorityDecisionId !== undefined || decision.authorityProofId !== undefined;
  return {
    performed,
    ...(decision.authorityDecisionId !== undefined ? { decisionId: decision.authorityDecisionId } : {}),
    ...(decision.authorityProofId !== undefined ? { proofId: decision.authorityProofId } : {}),
  };
}

function buildApprovalEvaluation(decision: EnforcementDecision): ApprovalEvaluation {
  const performed = decision.approvalRequestId !== undefined || decision.approvalDecisionId !== undefined || decision.approvalProofId !== undefined || decision.type === 'approval_required';
  let status: ApprovalStatus = 'not_applicable';
  if (decision.approvalProofId !== undefined) {
    status = 'granted';
  } else if (decision.type === 'approval_required' || decision.approvalRequestId !== undefined || decision.approvalDecisionId !== undefined) {
    status = 'pending';
  }

  return {
    performed,
    status,
    ...(decision.approvalRequestId !== undefined ? { requestId: decision.approvalRequestId } : {}),
    ...(decision.approvalDecisionId !== undefined ? { decisionId: decision.approvalDecisionId } : {}),
    ...(decision.approvalProofId !== undefined ? { proofId: decision.approvalProofId } : {}),
  };
}

function buildPolicyEvaluations(decision: EnforcementDecision): readonly PolicyEvaluation[] {
  return decision.policyResults.map((result) => ({
    policyId: result.policyId,
    passed: result.passed,
    reasonCode: result.reasonCode,
    reason: result.reason,
    severity: result.severity,
    ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
  }));
}

function buildEvidenceEvaluations(decision: EnforcementDecision): readonly EvidenceEvaluation[] {
  return decision.policyResults
    .filter((result) => result.policyId === EVIDENCE_POLICY_ID)
    .map((result) => ({ policyId: result.policyId, passed: result.passed, reasonCode: result.reasonCode, reason: result.reason }));
}

/**
 * Builds the trace in real evaluation order: recognition (which itself
 * already folds in authority + approval upstream, see
 * AOC_KERNEL_CURRENT_EXECUTION_MODEL.md sec. 6/8), authority, approval, then
 * every action-enforcement policy that actually ran. `authority`/`approval`
 * step status is a documented best-effort derivation (see
 * AOC_KERNEL_INVARIANTS_V1.md) -- the structural `RecognitionVerificationResult`
 * does not carry an independent pass/fail flag for those two layers.
 */
function buildTrace(decision: EnforcementDecision, traceLevel: 'basic' | 'full'): KernelTrace {
  const recognition = buildRecognitionEvaluation(decision);
  const authority = buildAuthorityEvaluation(decision);
  const approval = buildApprovalEvaluation(decision);

  const steps: KernelTraceStep[] = [];
  let sequence = 1;

  steps.push({
    sequence: sequence++,
    operator: 'recognition',
    status: !recognition.performed ? 'skipped' : recognition.recognized ? 'passed' : 'failed',
    reasonCodes: recognition.decisionType !== undefined ? [recognition.decisionType] : ['RECOGNITION_MISSING'],
  });

  steps.push({
    sequence: sequence++,
    operator: 'authority',
    status: !authority.performed ? 'skipped' : recognition.recognized ? 'passed' : 'failed',
    reasonCodes: authority.decisionId !== undefined ? [authority.decisionId] : [],
  });

  steps.push({
    sequence: sequence++,
    operator: 'approval',
    status: approval.status === 'granted' ? 'passed' : approval.status === 'pending' ? 'pending' : 'skipped',
    reasonCodes: approval.requestId !== undefined ? [approval.requestId] : [],
  });

  for (const result of decision.policyResults) {
    steps.push({
      sequence: sequence++,
      operator: result.policyId,
      status: result.passed ? 'passed' : 'failed',
      reasonCodes: [result.reasonCode],
      ...(traceLevel === 'full' && result.metadata !== undefined ? { metadata: result.metadata } : {}),
    });
  }

  return { steps, decisionId: decision.id, kernelVersion: AOC_KERNEL_VERSION };
}

export function toKernelEvaluationResult(requestId: string, decision: EnforcementDecision, options: KernelEvaluationOptions | undefined, correlationId?: string): KernelEvaluationResult {
  return {
    requestId,
    decisionId: decision.id,
    status: mapDecisionTypeToStatus(decision.type),
    reasonCodes: mapDecisionToReasonCodes(decision),
    summary: decision.reason,
    recognition: buildRecognitionEvaluation(decision),
    authority: buildAuthorityEvaluation(decision),
    policies: buildPolicyEvaluations(decision),
    approval: buildApprovalEvaluation(decision),
    evidence: buildEvidenceEvaluations(decision),
    trace: buildTrace(decision, options?.traceLevel ?? 'basic'),
    evaluatedAt: decision.decidedAt,
    kernelVersion: AOC_KERNEL_VERSION,
    ...(correlationId !== undefined ? { correlationId } : {}),
  };
}

function toKernelExecutionOutcome<T>(result: ExecutionResult<T>): KernelExecutionOutcome<T> {
  return {
    status: result.status,
    executed: result.executed,
    ...(result.value !== undefined ? { value: result.value } : {}),
    ...(result.errorMessage !== undefined ? { errorMessage: result.errorMessage } : {}),
    ...(result.startedAt !== undefined ? { startedAt: result.startedAt } : {}),
    ...(result.completedAt !== undefined ? { completedAt: result.completedAt } : {}),
  };
}

export function toKernelEnforcementResult<T>(
  requestId: string,
  decision: EnforcementDecision,
  result: ExecutionResult<T>,
  options: KernelEvaluationOptions | undefined,
  correlationId?: string,
): KernelEnforcementResult<T> {
  return {
    ...toKernelEvaluationResult(requestId, decision, options, correlationId),
    execution: toKernelExecutionOutcome(result),
  };
}
