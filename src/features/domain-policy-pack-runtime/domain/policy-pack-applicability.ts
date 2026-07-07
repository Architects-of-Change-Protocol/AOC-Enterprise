export type PolicyApplicabilityResultType =
  | 'applicable'
  | 'not_applicable'
  | 'expired'
  | 'revoked'
  | 'inactive'
  | 'scope_mismatch';

export interface PolicyApplicabilityResult {
  readonly policyPackId: string;
  readonly policyPackVersionId: string;
  readonly type: PolicyApplicabilityResultType;
  readonly applicable: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
