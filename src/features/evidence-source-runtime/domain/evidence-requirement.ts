export type EvidenceRequirementType =
  | 'contract'
  | 'purchase_order'
  | 'invoice'
  | 'event_record'
  | 'approval_memo'
  | 'authority_proof'
  | 'identity_proof'
  | 'customer_policy'
  | 'data_classification'
  | 'risk_assessment'
  | 'human_comment'
  | 'system_log'
  | 'external_reference'
  | 'external_attestation'
  | 'manual_note'
  | 'other';

export type EvidenceRequirementSource =
  | 'recognition'
  | 'approval'
  | 'policy_pack'
  | 'action_enforcement'
  | 'authority'
  | 'external_handshake'
  | 'manual';

export type EvidenceRequirementStatus =
  | 'open'
  | 'satisfied'
  | 'partially_satisfied'
  | 'rejected'
  | 'waived'
  | 'expired';

/**
 * A requirement that some evidence be presented. This runtime can represent
 * requirements it originates itself (`source: 'manual'`) as well as
 * requirements structurally mapped in from another runtime's own evidence
 * requirement shape (policy pack, approval, recognition, enforcement) --
 * `sourceRequirementId`/`sourceRuleId` trace back to that origin so this
 * requirement is never mistaken for one this runtime invented independently.
 */
export interface EvidenceRequirement {
  readonly id: string;
  readonly type: EvidenceRequirementType;
  readonly source: EvidenceRequirementSource;
  readonly sourceRequirementId?: string;
  readonly sourceRuleId?: string;
  readonly policyPackVersionId?: string;
  readonly policyDecisionId?: string;
  readonly approvalRequestId?: string;
  readonly recognitionDecisionId?: string;
  readonly enforcementDecisionId?: string;
  readonly trustDomainId: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly capability?: string;
  readonly resourceScope?: string;
  readonly description: string;
  readonly required: boolean;
  readonly status: EvidenceRequirementStatus;
  readonly createdAt: string;
  readonly satisfiedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
