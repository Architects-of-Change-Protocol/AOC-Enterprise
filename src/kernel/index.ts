export { AocKernel, createAocKernel } from './AocKernel.js';
export type { AocKernelOptions } from './AocKernel.js';

export { AOC_KERNEL_VERSION } from './versioning.js';

export type {
  ActorReference,
  ActionDescriptor,
  TargetReference,
  OrganizationReference,
  KernelEvaluationRequest,
  KernelEvaluationOptions,
  KernelDecisionStatus,
  RecognitionEvaluation,
  AuthorityEvaluation,
  PolicyEvaluation,
  ApprovalEvaluation,
  ApprovalStatus,
  EvidenceEvaluation,
  KernelEvaluationResult,
  KernelTrace,
  KernelTraceStep,
  KernelTraceStepStatus,
  KernelExecutionStatus,
  KernelExecutionOutcome,
  KernelEnforcementResult,
  RecognitionProvider,
  RecognitionVerificationInput,
  RecognitionVerificationResult,
  PolicyPackProvider,
  KernelClock,
  KernelIdGenerator,
} from './contracts/index.js';
export { KERNEL_CONTRACT_IDS } from './contracts/index.js';

export { AOC_KERNEL_REASON_CODES } from './reason-codes/reason-codes.js';
export type { AocKernelReasonCode } from './reason-codes/reason-codes.js';

export { KernelError, KernelValidationError, KernelConfigurationError, KernelDependencyError, KernelInvariantError, KernelExecutionError } from './errors/kernel-errors.js';
