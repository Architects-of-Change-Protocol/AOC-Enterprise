export type EnforcementViolationType =
  | 'recognition_denied'
  | 'authority_denied'
  | 'approval_missing'
  | 'approval_invalid'
  | 'external_standing_missing'
  | 'external_standing_invalid'
  | 'side_effect_denied'
  | 'idempotency_violation'
  | 'adapter_denied'
  | 'emergency_denied'
  | 'request_expired'
  | 'execution_error';

export type EnforcementViolationSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface EnforcementViolation {
  readonly id: string;

  readonly enforcementRequestId: string;

  readonly type: EnforcementViolationType;

  readonly reasonCode: string;
  readonly reason: string;

  readonly severity: EnforcementViolationSeverity;

  readonly detectedAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
