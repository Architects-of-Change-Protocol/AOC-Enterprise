export const OPERATIONAL_EVENT_TYPES = {
  INGESTION_STARTED: 'ingestion_started',
  INGESTION_COMPLETED: 'ingestion_completed',
  INGESTION_FAILED: 'ingestion_failed',
  ESCALATION_TRIGGERED: 'escalation_triggered',
  ESCALATION_RESOLVED: 'escalation_resolved',
  BLOCKER_DETECTED: 'blocker_detected',
  BLOCKER_CLEARED: 'blocker_cleared',
  INTERVENTION_CREATED: 'intervention_created',
  INTERVENTION_OUTCOME_RECORDED: 'intervention_outcome_recorded',
  STAKEHOLDER_SIGNAL_RECEIVED: 'stakeholder_signal_received',
  DEPENDENCY_CHANGED: 'dependency_changed',
  TIMELINE_DRIFT_DETECTED: 'timeline_drift_detected',
  CONTINUITY_STATE_UPDATED: 'continuity_state_updated',
  OPERATIONAL_DIGEST_GENERATED: 'operational_digest_generated',
  MEMORY_STORED: 'memory_stored',
  MEMORY_RETRIEVED: 'memory_retrieved',
  MEMORY_RETRIEVAL_BLOCKED: 'memory_retrieval_blocked',
  QUOTA_EXHAUSTED: 'quota_exhausted',
  BILLING_ENFORCEMENT_APPLIED: 'billing_enforcement_applied',
  RUNTIME_RECOVERY_INITIATED: 'runtime_recovery_initiated',
  COGNITION_INTERVENTION_TRIGGERED: 'cognition_intervention_triggered',
} as const;

export type OperationalEventType = typeof OPERATIONAL_EVENT_TYPES[keyof typeof OPERATIONAL_EVENT_TYPES];

export interface OperationalEventEnvelope {
  readonly eventId: string;
  readonly eventType: OperationalEventType;
  readonly occurredAt: string;
  readonly correlationId?: string;
  readonly actorId?: string;
  readonly tenantId: string;
  readonly orgId?: string;
  readonly projectId?: string;
  readonly workspaceId?: string;
  readonly reasonCodes?: ReadonlyArray<string>;
  readonly severity?: 'info' | 'warn' | 'error' | 'critical';
  readonly payload?: Readonly<Record<string, unknown>>;
}
