import { randomUUID } from 'crypto';
import type {
  AccessRequest,
  ConsentDecision,
  ControlPlaneAuditEvent,
  CreateAccessRequestInput,
  DecideAccessRequestInput,
  GrantedAccess,
  ListActiveGrantsInput,
  ListRequestsInput,
  RevokeGrantInput,
} from './types';
import { FileControlPlaneStore } from './store';

function nowIso(): string {
  return new Date().toISOString();
}

export class ControlPlaneService {
  constructor(private readonly store: FileControlPlaneStore = new FileControlPlaneStore()) {}

  createAccessRequest(input: CreateAccessRequestInput): AccessRequest {
    const state = this.store.read();
    const timestamp = nowIso();
    const request: AccessRequest = {
      request_id: randomUUID(),
      subject_id: input.subject_id,
      requester_id: input.requester_id,
      dataset_id: input.dataset_id,
      purpose: input.purpose,
      requested_scope: input.requested_scope ?? [],
      status: 'pending',
      created_at: timestamp,
      updated_at: timestamp,
    };

    state.requests.push(request);
    state.auditEvents.push(this.audit('ACCESS_REQUEST_CREATED', request));
    this.store.write(state);
    return request;
  }

  listRequestsBySubject(input: ListRequestsInput): AccessRequest[] {
    const state = this.store.read();
    return state.requests
      .filter((request) => request.subject_id === input.subject_id)
      .filter((request) => (input.status === undefined ? true : request.status === input.status))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }

  decideAccessRequest(input: DecideAccessRequestInput): { request: AccessRequest; decision: ConsentDecision; grant?: GrantedAccess } {
    const state = this.store.read();
    const request = state.requests.find((item) => item.request_id === input.request_id);

    if (request === undefined) {
      throw new Error(`Access request not found: ${input.request_id}`);
    }
    if (request.subject_id !== input.subject_id) {
      throw new Error('Subject mismatch for access request decision.');
    }
    if (request.status !== 'pending') {
      throw new Error(`Access request is not pending: ${request.request_id}`);
    }

    request.status = input.decision === 'approve' ? 'approved' : 'denied';
    request.updated_at = nowIso();

    const decision: ConsentDecision = {
      decision_id: randomUUID(),
      request_id: request.request_id,
      subject_id: input.subject_id,
      decision: input.decision,
      reason: input.reason,
      decided_at: nowIso(),
    };
    state.decisions.push(decision);

    const decisionEventType = input.decision === 'approve' ? 'ACCESS_REQUEST_APPROVED' : 'ACCESS_REQUEST_DENIED';
    state.auditEvents.push(this.audit(decisionEventType, request, { decision_id: decision.decision_id }));

    let grant: GrantedAccess | undefined;
    if (input.decision === 'approve') {
      grant = {
        grant_id: randomUUID(),
        request_id: request.request_id,
        subject_id: request.subject_id,
        requester_id: request.requester_id,
        dataset_id: request.dataset_id,
        scope: request.requested_scope,
        status: 'active',
        granted_at: nowIso(),
      };
      state.grants.push(grant);
      state.auditEvents.push(this.audit('GRANT_CREATED', request, { grant_id: grant.grant_id }));
    }

    this.store.write(state);
    return { request: { ...request }, decision, grant };
  }

  listActiveGrants(input: ListActiveGrantsInput = {}): GrantedAccess[] {
    const state = this.store.read();
    return state.grants
      .filter((grant) => grant.status === 'active')
      .filter((grant) => (input.subject_id === undefined ? true : grant.subject_id === input.subject_id))
      .filter((grant) => (input.requester_id === undefined ? true : grant.requester_id === input.requester_id))
      .sort((a, b) => Date.parse(b.granted_at) - Date.parse(a.granted_at));
  }

  revokeGrant(input: RevokeGrantInput): GrantedAccess {
    const state = this.store.read();
    const grant = state.grants.find((item) => item.grant_id === input.grant_id);
    if (grant === undefined) {
      throw new Error(`Grant not found: ${input.grant_id}`);
    }

    if (input.subject_id !== undefined && grant.subject_id !== input.subject_id) {
      throw new Error('Subject mismatch for grant revocation.');
    }
    if (input.requester_id !== undefined && grant.requester_id !== input.requester_id) {
      throw new Error('Requester mismatch for grant revocation.');
    }
    if (grant.status === 'revoked') {
      return grant;
    }

    grant.status = 'revoked';
    grant.revoked_at = nowIso();
    state.auditEvents.push({
      event_id: randomUUID(),
      event_type: 'GRANT_REVOKED',
      occurred_at: grant.revoked_at,
      subject_id: grant.subject_id,
      requester_id: grant.requester_id,
      request_id: grant.request_id,
      grant_id: grant.grant_id,
    });

    this.store.write(state);
    return { ...grant };
  }

  listAuditEvents(): ControlPlaneAuditEvent[] {
    const state = this.store.read();
    return state.auditEvents.slice().sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  }

  private audit(
    eventType: ControlPlaneAuditEvent['event_type'],
    request: Pick<AccessRequest, 'request_id' | 'subject_id' | 'requester_id'>,
    metadata?: Record<string, unknown>
  ): ControlPlaneAuditEvent {
    return {
      event_id: randomUUID(),
      event_type: eventType,
      occurred_at: nowIso(),
      request_id: request.request_id,
      subject_id: request.subject_id,
      requester_id: request.requester_id,
      metadata,
    };
  }
}
