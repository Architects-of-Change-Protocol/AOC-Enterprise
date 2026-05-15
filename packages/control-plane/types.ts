import type {
  AuditEventEnvelope,
  CapabilityToken,
  ConsentGrant,
  ScopedAccessRequest,
} from '@aoc/protocol/contracts';

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
  requested_scope: ScopedAccessRequest['scope'];
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
  scope: ScopedAccessRequest['scope'];
  status: 'active' | 'revoked';
  granted_at: string;
  revoked_at?: string;
  capability_token?: CapabilityToken;
};

export type ControlPlaneAuditEvent = AuditEventEnvelope & {
  event_type: 'ACCESS_REQUEST_CREATED' | 'ACCESS_REQUEST_APPROVED' | 'ACCESS_REQUEST_DENIED' | 'GRANT_CREATED' | 'GRANT_REVOKED';
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
  requested_scope?: ScopedAccessRequest['scope'];
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
