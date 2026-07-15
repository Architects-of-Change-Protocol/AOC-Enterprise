import type {
  CapabilityToken,
  ConsentGrant,
  ScopedAccessRequest,
} from '@aoc/protocol';

export type AccessRequestStatus = 'pending' | 'approved' | 'denied';

/**
 * Runtime-only persistence projection for a protocol scoped access request.
 */
export type AccessRequestRecord = {
  request_id: string;
  subject_id: string;
  requester_id: string;
  dataset_id: string;
  purpose: string;
  requested_scope: ScopedAccessRequest['requestedScope'];
  status: AccessRequestStatus;
  created_at: string;
  updated_at: string;
};

export type ConsentDecisionRecord = {
  decision_id: string;
  request_id: string;
  subject_id: string;
  decision: 'approve' | 'deny';
  consent_grant?: ConsentGrant;
  reason?: string;
  decided_at: string;
};

export type GrantedAccessRecord = {
  grant_id: string;
  request_id: string;
  subject_id: string;
  requester_id: string;
  dataset_id: string;
  scope: ScopedAccessRequest['requestedScope'];
  status: 'active' | 'revoked';
  granted_at: string;
  revoked_at?: string;
  capability_token?: CapabilityToken;
};

export type ControlPlaneAuditEventType =
  | 'ACCESS_REQUEST_CREATED'
  | 'ACCESS_REQUEST_APPROVED'
  | 'ACCESS_REQUEST_DENIED'
  | 'GRANT_CREATED'
  | 'GRANT_REVOKED';

/**
 * Enterprise's legacy, snake_case, persisted audit event shape (see
 * `.aoc-control-plane.json` via `FileControlPlaneStore`). This is
 * deliberately NOT `AuditEventEnvelope & {...}` -- it is a standalone,
 * Enterprise-owned persisted shape, decoupled from AOC Protocol's contract.
 * `audit-envelope-mapper.ts` is the sole, explicit boundary between this
 * legacy shape and the real `@aoc/protocol` `AuditEventEnvelope`; nothing
 * else in this package should structurally cast or spread between the two.
 */
export type ControlPlaneAuditEvent = {
  event_id: string;
  event_type: ControlPlaneAuditEventType;
  occurred_at: string;
  subject_id: string;
  requester_id: string;
  request_id: string;
  grant_id?: string;
  metadata?: Record<string, unknown>;
};

export type ControlPlaneState = {
  requests: AccessRequestRecord[];
  decisions: ConsentDecisionRecord[];
  grants: GrantedAccessRecord[];
  auditEvents: ControlPlaneAuditEvent[];
};

export type CreateAccessRequestInput = {
  subject_id: string;
  requester_id: string;
  dataset_id: string;
  purpose: string;
  requested_scope?: ScopedAccessRequest['requestedScope'];
};

export type DecideAccessRequestInput = {
  request_id: string;
  subject_id: string;
  decision: 'approve' | 'deny';
  reason?: string;
};

export type RevokeGrantInput = { grant_id: string; subject_id?: string; requester_id?: string };

export type ListRequestsInput = { subject_id: string; status?: AccessRequestStatus };

export type ListActiveGrantsInput = { subject_id?: string; requester_id?: string };
