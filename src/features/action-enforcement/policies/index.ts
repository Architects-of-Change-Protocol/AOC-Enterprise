export { EmergencyDenyPolicy } from './emergency-deny-policy.js';
export { RecognitionRequiredPolicy } from './recognition-required-policy.js';
export { AllowDecisionRequiredPolicy } from './allow-decision-required-policy.js';
export { ApprovalPendingPolicy } from './approval-pending-policy.js';
export { EvidenceRequiredPolicy } from './evidence-required-policy.js';
export { ExternalStandingPolicy } from './external-standing-policy.js';
export { AdapterPermissionPolicy } from './adapter-permission-policy.js';
export { IdempotencyPolicy } from './idempotency-policy.js';
export { ExecutionTimeoutPolicy } from './execution-timeout-policy.js';
export { SideEffectBoundaryPolicy } from './side-effect-boundary-policy.js';
export { DryRunPolicy } from './dry-run-policy.js';
export { PostExecutionRecordPolicy } from './post-execution-record-policy.js';

import type { EnforcementPolicy } from '../domain/enforcement-verification.js';
import { AdapterPermissionPolicy } from './adapter-permission-policy.js';
import { AllowDecisionRequiredPolicy } from './allow-decision-required-policy.js';
import { ApprovalPendingPolicy } from './approval-pending-policy.js';
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
 * even considered; adapter and idempotency gate the transport regardless of
 * what recognition said; expiry, side-effect boundary and dry-run apply only
 * once every upstream governance check has already cleared.
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
    new IdempotencyPolicy(),
    new ExecutionTimeoutPolicy(),
    new SideEffectBoundaryPolicy(),
    new DryRunPolicy(),
    new PostExecutionRecordPolicy(),
  ];
}
