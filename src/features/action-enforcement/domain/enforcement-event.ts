export type EnforcementEventType =
  | 'enforcement_requested'
  | 'preflight_started'
  | 'preflight_passed'
  | 'preflight_failed'
  | 'execution_blocked'
  | 'execution_started'
  | 'execution_succeeded'
  | 'execution_failed'
  | 'execution_skipped'
  | 'duplicate_suppressed'
  | 'side_effect_planned'
  | 'side_effect_blocked'
  | 'side_effect_executed'
  | 'enforcement_proof_created'
  | 'enforcement_violation_recorded'
  | 'policy_pack_evaluated'
  | 'policy_pack_blocked'
  | 'policy_pack_warning_recorded';

export interface EnforcementEvent {
  readonly id: string;

  readonly type: EnforcementEventType;

  readonly trustDomainId: string;

  readonly enforcementRequestId?: string;
  readonly enforcementDecisionId?: string;
  readonly executionResultId?: string;
  readonly enforcementProofId?: string;
  readonly violationId?: string;

  readonly actorId?: string;
  readonly principalActorId?: string;

  readonly timestamp: string;

  readonly payload: Readonly<Record<string, unknown>>;

  readonly previousHash?: string;
  readonly eventHash: string;
}
