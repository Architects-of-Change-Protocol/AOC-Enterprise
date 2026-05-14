export type AccessRequestStatus = 'pending' | 'approved' | 'denied';

export type AccessRequest = {
  request_id: string;
  subject_id: string;
  requester_id: string;
  dataset_id: string;
  purpose: string;
  requested_scope: string[];
  status: AccessRequestStatus;
  created_at: string;
  updated_at: string;
};

export type ConsentDecision = {
  decision_id: string;
  request_id: string;
  subject_id: string;
  decision: 'approve' | 'deny';
  reason?: string;
  decided_at: string;
};

export type GrantedAccess = {
  grant_id: string;
  request_id: string;
  subject_id: string;
  requester_id: string;
  dataset_id: string;
  scope: string[];
  status: 'active' | 'revoked';
  granted_at: string;
  revoked_at?: string;
};

export type ControlPlaneAuditEvent = {
  event_id: string;
  event_type:
    | 'ACCESS_REQUEST_CREATED'
    | 'ACCESS_REQUEST_APPROVED'
    | 'ACCESS_REQUEST_DENIED'
    | 'GRANT_CREATED'
    | 'GRANT_REVOKED';
  occurred_at: string;
  subject_id?: string;
  requester_id?: string;
  request_id?: string;
  grant_id?: string;
  metadata?: Record<string, unknown>;
};

export type ControlPlaneState = {
  requests: AccessRequest[];
  decisions: ConsentDecision[];
  grants: GrantedAccess[];
  auditEvents: ControlPlaneAuditEvent[];
};

export type CreateAccessRequestInput = {
  subject_id: string;
  requester_id: string;
  dataset_id: string;
  purpose: string;
  requested_scope?: string[];
};

export type DecideAccessRequestInput = {
  request_id: string;
  subject_id: string;
  decision: 'approve' | 'deny';
  reason?: string;
};

export type RevokeGrantInput = {
  grant_id: string;
  subject_id?: string;
  requester_id?: string;
};

export type ListRequestsInput = {
  subject_id: string;
  status?: AccessRequestStatus;
};

export type ListActiveGrantsInput = {
  subject_id?: string;
  requester_id?: string;
};
