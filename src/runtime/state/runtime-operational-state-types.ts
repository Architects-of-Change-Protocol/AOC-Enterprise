export type RuntimeLifecycleEventType =
  | 'runtime_initialized' | 'authorization_enforced' | 'grant_issued' | 'grant_validated' | 'grant_consumed' | 'grant_revoked' | 'delegation_issued' | 'delegation_validated' | 'delegation_revoked' | 'replay_denied' | 'audit_emitted';
export interface RuntimeContinuityIds { runtimeSessionId: string; orchestrationSessionId: string; continuityEpoch: number; continuityVersion: number; operationalSequenceNumber: number; }
export interface RuntimeOperationalCounters { authorizationEnforcements: number; grantsIssued: number; grantsConsumed: number; grantsRevoked: number; delegationsIssued: number; delegationsRevoked: number; replayDenials: number; auditsEmitted: number; }
export interface RuntimeLifecycleMarker { sequence: number; eventType: RuntimeLifecycleEventType; occurredAt: string; entityId?: string; reasonCodes?: string[]; }
export interface RuntimeOperationalMetadata { runtimeId: string; trustDomain: string; snapshotVersion: 1; createdAt: string; updatedAt: string; health: 'nominal' | 'degraded'; }
export interface RuntimeOperationalSession { startedAt: string; lastActivityAt: string; }
export interface RuntimeOperationalState { continuity: RuntimeContinuityIds; session: RuntimeOperationalSession; metadata: RuntimeOperationalMetadata; activeGrants: Record<string, string>; activeDelegations: Record<string, string>; replay: { deniedNonces: string[]; lastDeniedAt?: string }; counters: RuntimeOperationalCounters; lifecycle: RuntimeLifecycleMarker[]; auditLineage: { lastAuditEventAt?: string; lastAuditEventType?: string }; }
export type RuntimeOperationalSnapshot = RuntimeOperationalState;
export interface RuntimeOperationalStateValidationReport { valid: boolean; errors: string[]; }
