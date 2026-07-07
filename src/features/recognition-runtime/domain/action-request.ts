import type { EvidenceItem } from './evidence.js';

export interface ActionRequest {
  readonly id: string;
  readonly actorId: string;
  readonly passportId?: string;
  readonly capabilityTokenId?: string;
  readonly trustDomainId: string;
  readonly action: string;
  readonly resource: string;
  readonly principalActorId?: string;
  readonly context?: Readonly<Record<string, string>>;
  readonly evidence?: readonly EvidenceItem[];
  readonly requestedAt: string;
  /** References an existing Approval Runtime proof/request/decision this action claims to be covered by. */
  readonly approvalProofId?: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
}
