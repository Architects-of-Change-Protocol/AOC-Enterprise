import type { PolicyPackScope } from './policy-pack-scope.js';
import type { PolicyPackRule } from './policy-pack-rule.js';
import type { PolicyPackSource } from './policy-pack-source.js';

export type PolicyPackVersionStatus = 'draft' | 'active' | 'deprecated' | 'revoked' | 'superseded';

export type PolicyPackLegalCompleteness =
  | 'not_legal_advice'
  | 'partial_policy_model'
  | 'customer_provided_policy'
  | 'verified_by_customer'
  | 'verified_by_counsel';

export interface PolicyPackVersion {
  readonly id: string;
  readonly policyPackId: string;
  readonly version: string;
  readonly status: PolicyPackVersionStatus;
  readonly scope: PolicyPackScope;
  readonly rules: readonly PolicyPackRule[];
  readonly sources: readonly PolicyPackSource[];
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly supersedesVersionId?: string;
  readonly demoOnly: boolean;
  readonly legalCompleteness: PolicyPackLegalCompleteness;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
