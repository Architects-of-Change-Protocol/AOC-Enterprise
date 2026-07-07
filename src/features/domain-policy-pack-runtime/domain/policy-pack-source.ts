export type PolicyPackSourceType =
  | 'customer_policy'
  | 'contract'
  | 'internal_control'
  | 'standard_operating_procedure'
  | 'legal_reference'
  | 'regulatory_reference'
  | 'demo_assumption'
  | 'expert_review'
  | 'other';

export type PolicyPackSourceAuthority =
  | 'demo_only'
  | 'customer_provided'
  | 'internal'
  | 'external_reference'
  | 'counsel_reviewed';

export interface PolicyPackSource {
  readonly id: string;
  readonly type: PolicyPackSourceType;
  readonly title: string;
  readonly reference?: string;
  readonly description?: string;
  readonly authority: PolicyPackSourceAuthority;
  readonly retrievedAt?: string;
  readonly reviewedAt?: string;
  readonly reviewedByActorId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
