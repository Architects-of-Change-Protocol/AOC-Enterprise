import type { EnforcementAdapter } from './enforcement-adapter.js';
import type { EnforcementDecisionType } from './enforcement-decision.js';
import type { RecognitionVerificationResult } from './enforcement-context.js';
import type { EnforcementRequest } from './enforcement-request.js';
import type { IdempotencyCheckResult } from './idempotency-key.js';

export type EnforcementPolicySeverity = 'info' | 'warning' | 'error' | 'critical';

export interface EnforcementPolicyResult {
  readonly policyId: string;
  readonly passed: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly severity: EnforcementPolicySeverity;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EnforcementPolicyContext {
  readonly now: string;
  readonly request: EnforcementRequest;
  readonly recognitionResult?: RecognitionVerificationResult;
  readonly recognitionMappedDecisionType?: EnforcementDecisionType;
  readonly recognitionMappedReasonCode?: string;
  readonly recognitionMappedReason?: string;
  readonly adapter?: EnforcementAdapter;
  readonly emergencyDeny: boolean;
  readonly idempotency?: IdempotencyCheckResult;
}

export interface EnforcementPolicyOutcome extends EnforcementPolicyResult {
  readonly decisionType?: EnforcementDecisionType;
}

export interface EnforcementPolicy {
  readonly id: string;
  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome;
}
