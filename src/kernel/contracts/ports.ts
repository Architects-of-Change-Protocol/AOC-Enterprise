import type {
  EnforcementRecognitionIntegration,
  RecognitionVerificationInput,
  RecognitionVerificationResult,
} from '../../features/action-enforcement/domain/enforcement-context.js';
import type { EnforcementPolicyPackIntegration } from '../../features/action-enforcement/domain/policy-pack-enforcement.js';
import type {
  EnforcementRuntimeClock,
  EnforcementRuntimeIdGenerator,
} from '../../features/action-enforcement/runtime/enforcement-runtime-context.js';

/**
 * Only ports that correspond to a *real, direct* dependency of the kernel's
 * own composition boundary are defined here. `AocKernel` composes exactly
 * one `ActionEnforcementRuntime`, which itself requires a recognition
 * integration and optionally a policy pack integration and a runtime
 * context (clock + id generator) -- those four are the kernel's real ports.
 *
 * `AuthorityProvider`, `ApprovalProvider`, and `EvidenceProvider` are
 * deliberately NOT introduced here: Authority Graph, Approval Runtime, and
 * evidence checking are reached transitively, *inside* whatever concrete
 * `RecognitionProvider` the kernel is given (see
 * `bridgeRecognitionRuntime` in action-enforcement's fixtures for the real
 * example) -- the kernel itself never calls them directly, so a port for
 * them at this boundary would be speculative. `KernelEventSink` is also
 * omitted: nothing in the wrapped engine emits to an external sink today: the
 * kernel returns a self-contained `KernelTrace` instead. See
 * `docs/kernel/AOC_KERNEL_INVARIANTS_V1.md`.
 */
export type RecognitionProvider = EnforcementRecognitionIntegration;
export type { RecognitionVerificationInput, RecognitionVerificationResult };

export type PolicyPackProvider = EnforcementPolicyPackIntegration;

export type KernelClock = EnforcementRuntimeClock;
export type KernelIdGenerator = EnforcementRuntimeIdGenerator;
