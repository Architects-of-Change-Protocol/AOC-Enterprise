import type { CitationTargetType } from './citation.js';

/** Describes why evidence is being evaluated or linked for a particular decision. */
export interface EvidenceDecisionContext {
  readonly id: string;
  readonly trustDomainId: string;
  readonly targetType: CitationTargetType;
  readonly targetId: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly capability?: string;
  readonly resourceScope?: string;
  readonly policyDecisionId?: string;
  readonly policyProofId?: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;
  readonly recognitionDecisionId?: string;
  readonly enforcementDecisionId?: string;
  readonly enforcementProofId?: string;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
