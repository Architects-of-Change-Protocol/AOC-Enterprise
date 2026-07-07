import type { ApprovalEvidenceArtifact } from './approval-evidence.js';
import type { ApprovalRequirement, ApprovalRiskLevel } from './approval-requirement.js';
import type { ApprovalRequestStatus } from './approval-status.js';

export type { ApprovalRequestStatus } from './approval-status.js';

export interface ApprovalRequest {
  readonly id: string;

  readonly trustDomainId: string;

  readonly actionRequestId: string;
  readonly recognitionDecisionId?: string;
  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;

  readonly requestedByActorId: string;
  readonly targetActorId: string;
  readonly principalActorId?: string;

  readonly action: string;
  readonly resourceScope: string;
  readonly resourceId?: string;
  readonly capability?: string;

  readonly riskLevel: ApprovalRiskLevel;

  readonly requirement: ApprovalRequirement;

  readonly status: ApprovalRequestStatus;

  readonly evidence: readonly ApprovalEvidenceArtifact[];

  readonly createdAt: string;
  readonly expiresAt?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
