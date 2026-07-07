import type { ApprovalEvidenceArtifact } from './approval-evidence.js';
import type { ApprovalRiskLevel } from './approval-requirement.js';

export interface ApprovalContext {
  readonly trustDomainId: string;
  readonly requesterActorId: string;
  readonly targetActorId: string;
  readonly principalActorId?: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly riskLevel: ApprovalRiskLevel;
  readonly evidence: readonly ApprovalEvidenceArtifact[];
  readonly requestedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
