export { ValidApprovalRequestPolicy } from './valid-approval-request-policy.js';
export { RecognizedApproverPolicy } from './recognized-approver-policy.js';
export { ApproverAuthorityPolicy } from './approver-authority-policy.js';
export { ApprovalScopePolicy } from './approval-scope-policy.js';
export { ApprovalEvidencePolicy } from './approval-evidence-policy.js';
export { SegregationOfDutiesPolicy } from './segregation-of-duties-policy.js';
export { ExpirationPolicy } from './expiration-policy.js';
export { RevocationPolicy } from './revocation-policy.js';
export { DuplicateApprovalPolicy } from './duplicate-approval-policy.js';
export { QuorumPolicy } from './quorum-policy.js';

import { ValidApprovalRequestPolicy } from './valid-approval-request-policy.js';
import { RecognizedApproverPolicy } from './recognized-approver-policy.js';
import { ApproverAuthorityPolicy } from './approver-authority-policy.js';
import { ApprovalScopePolicy } from './approval-scope-policy.js';
import { ApprovalEvidencePolicy } from './approval-evidence-policy.js';
import { SegregationOfDutiesPolicy } from './segregation-of-duties-policy.js';
import { ExpirationPolicy } from './expiration-policy.js';
import { RevocationPolicy } from './revocation-policy.js';
import { DuplicateApprovalPolicy } from './duplicate-approval-policy.js';
import { QuorumPolicy } from './quorum-policy.js';
import type { ApprovalPolicy } from '../domain/approval-policy.js';

// Precedence order: is the request itself usable, then who is attempting to decide
// (recognition, authority, scope), then evidence and conflict-of-interest, then
// time/revocation validity, then duplicate detection, then quorum completeness.
export function createDefaultApprovalPolicyChain(): readonly ApprovalPolicy[] {
  return [
    new ValidApprovalRequestPolicy(),
    new RecognizedApproverPolicy(),
    new ApproverAuthorityPolicy(),
    new ApprovalScopePolicy(),
    new ApprovalEvidencePolicy(),
    new SegregationOfDutiesPolicy(),
    new ExpirationPolicy(),
    new RevocationPolicy(),
    new DuplicateApprovalPolicy(),
    new QuorumPolicy(),
  ];
}

/** The admission gate ApprovalDecisionService runs before accepting a new decision -- excludes quorum, which is evaluated separately after acceptance. */
export function createAdmissionApprovalPolicyChain(): readonly ApprovalPolicy[] {
  return createDefaultApprovalPolicyChain().filter((policy) => policy.id !== 'quorum');
}
