export { EmergencyDenyPolicy } from './emergency-deny-policy.js';
export { RecognitionRequiredPolicy } from './recognition-required-policy.js';
export { AllowDecisionRequiredPolicy } from './allow-decision-required-policy.js';
export { ApprovalPendingPolicy } from './approval-pending-policy.js';
export { EvidenceRequiredPolicy } from './evidence-required-policy.js';
export { ExternalStandingPolicy } from './external-standing-policy.js';
export { AdapterPermissionPolicy } from './adapter-permission-policy.js';
export { DomainPolicyPackPolicy } from './domain-policy-pack-policy.js';
export { IdempotencyPolicy } from './idempotency-policy.js';
export { ExecutionTimeoutPolicy } from './execution-timeout-policy.js';
export { SideEffectBoundaryPolicy } from './side-effect-boundary-policy.js';
export { DryRunPolicy } from './dry-run-policy.js';
export { PostExecutionRecordPolicy } from './post-execution-record-policy.js';

import type { EnforcementPolicy } from '../domain/enforcement-verification.js';
import { AdapterPermissionPolicy } from './adapter-permission-policy.js';
import { AllowDecisionRequiredPolicy } from './allow-decision-required-policy.js';
import { ApprovalPendingPolicy } from './approval-pending-policy.js';
import { DomainPolicyPackPolicy } from './domain-policy-pack-policy.js';
import { DryRunPolicy } from './dry-run-policy.js';
import { EmergencyDenyPolicy } from './emergency-deny-policy.js';
import { EvidenceRequiredPolicy } from './evidence-required-policy.js';
import { ExecutionTimeoutPolicy } from './execution-timeout-policy.js';
import { ExternalStandingPolicy } from './external-standing-policy.js';
import { IdempotencyPolicy } from './idempotency-policy.js';
import { PostExecutionRecordPolicy } from './post-execution-record-policy.js';
import { RecognitionRequiredPolicy } from './recognition-required-policy.js';
import { SideEffectBoundaryPolicy } from './side-effect-boundary-policy.js';

/**
 * Fixed precedence order: emergency deny wins over everything; recognition
 * must be present and allow before approval/evidence/external-standing are
 * even considered; adapter permission gates the transport regardless of
 * what recognition said. `domain_policy_pack` runs immediately after
 * `adapter_permission` and before `idempotency` -- by the time it runs,
 * every core AOC layer (recognition/authority/approval/handshake/adapter)
 * has already independently passed, so a policy pack `allow` can only ever
 * preserve that outcome, never create one; a policy pack `deny`/
 * `requires_evidence`/`requires_approval`/`requires_authority`/
 * `requires_external_standing` still blocks even though every core layer
 * allowed it. Idempotency, expiry, side-effect boundary and dry-run apply
 * only once both core AOC and domain policy have already cleared.
 */
export function createDefaultEnforcementPolicyChain(): readonly EnforcementPolicy[] {
  return [
    new EmergencyDenyPolicy(),
    new RecognitionRequiredPolicy(),
    new AllowDecisionRequiredPolicy(),
    new ApprovalPendingPolicy(),
    new EvidenceRequiredPolicy(),
    new ExternalStandingPolicy(),
    new AdapterPermissionPolicy(),
    new DomainPolicyPackPolicy(),
    new IdempotencyPolicy(),
    new ExecutionTimeoutPolicy(),
    new SideEffectBoundaryPolicy(),
    new DryRunPolicy(),
    new PostExecutionRecordPolicy(),
  ];
}
