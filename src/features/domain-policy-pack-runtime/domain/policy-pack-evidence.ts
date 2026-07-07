export type PolicyEvidenceRequirementType =
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
  | 'external_reference';

export interface PolicyEvidenceRequirement {
  readonly id: string;
  readonly type: PolicyEvidenceRequirementType;
  readonly description: string;
  readonly required: boolean;
  readonly sourceRuleId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
