export type PolicyConditionOperator = 'all' | 'any' | 'not';

export type PolicyPredicateOperator =
  | 'equals'
  | 'not_equals'
  | 'includes'
  | 'not_includes'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'exists'
  | 'not_exists';

export type PolicyPredicateField =
  | 'trustDomainId'
  | 'actorId'
  | 'actorType'
  | 'principalActorId'
  | 'action'
  | 'capability'
  | 'resourceScope'
  | 'riskLevel'
  | 'jurisdiction'
  | 'country'
  | 'industry'
  | 'domain'
  | 'amount'
  | 'currency'
  | 'counterpartyId'
  | 'dataDomains'
  | 'sideEffectType'
  | 'hasApprovalProof'
  | 'hasAuthorityProof'
  | 'hasHandshakeProof'
  | 'hasRequiredEvidence'
  | 'metadata';

export interface PolicyGroupCondition {
  readonly type: 'group';
  readonly operator: PolicyConditionOperator;
  readonly conditions: readonly PolicyCondition[];
}

export interface PolicyPredicateCondition {
  readonly type: 'predicate';
  readonly field: PolicyPredicateField;
  readonly operator: PolicyPredicateOperator;
  readonly value?: unknown;
  readonly metadataPath?: string;
}

export type PolicyCondition = PolicyGroupCondition | PolicyPredicateCondition;
