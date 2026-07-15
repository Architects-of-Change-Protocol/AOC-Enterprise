import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toProtocolAuditEventEnvelope } from '../audit-envelope-mapper.js';
import type { ControlPlaneAuditEvent } from '../types.js';

const FULL_EVENT: ControlPlaneAuditEvent = {
  event_id: 'audit-1',
  event_type: 'ACCESS_REQUEST_APPROVED',
  occurred_at: '2026-01-01T00:00:00.000Z',
  subject_id: 'subject-1',
  requester_id: 'requester-1',
  request_id: 'request-1',
  grant_id: 'grant-1',
  metadata: { decision_id: 'decision-1' },
};

const MINIMAL_EVENT: ControlPlaneAuditEvent = {
  event_id: 'audit-2',
  event_type: 'ACCESS_REQUEST_CREATED',
  occurred_at: '2026-01-02T00:00:00.000Z',
  subject_id: 'subject-2',
  requester_id: 'requester-2',
  request_id: 'request-2',
};

describe('toProtocolAuditEventEnvelope', () => {
  it('maps every field explicitly for a fully populated legacy event', () => {
    const envelope = toProtocolAuditEventEnvelope(FULL_EVENT);
    assert.equal(envelope.eventId, 'audit-1');
    assert.equal(envelope.eventType, 'ACCESS_REQUEST_APPROVED');
    assert.equal(envelope.actorId, 'requester-1');
    assert.deepEqual(envelope.subject, { kind: 'control-plane-subject', id: 'subject-1' });
    assert.equal(envelope.correlationId, 'request-1');
    assert.deepEqual(envelope.payload, { metadata: { decision_id: 'decision-1' }, grant_id: 'grant-1' });
  });

  it('maps a minimal event without metadata or grant_id to an empty-but-present payload', () => {
    const envelope = toProtocolAuditEventEnvelope(MINIMAL_EVENT);
    assert.deepEqual(envelope.payload, {});
    assert.equal('metadata' in envelope.payload, false);
    assert.equal('grant_id' in envelope.payload, false);
  });

  it('separates requester (actorId) from subject -- they map to different Protocol fields', () => {
    const envelope = toProtocolAuditEventEnvelope(FULL_EVENT);
    assert.equal(envelope.actorId, FULL_EVENT.requester_id);
    assert.equal(envelope.subject?.id, FULL_EVENT.subject_id);
    assert.notEqual(envelope.actorId, envelope.subject?.id);
  });

  it('maps the single legacy timestamp into both emittedAt and occurredAt, documented as a fallback', () => {
    const envelope = toProtocolAuditEventEnvelope(FULL_EVENT);
    assert.equal(envelope.emittedAt, FULL_EVENT.occurred_at);
    assert.equal(envelope.occurredAt, FULL_EVENT.occurred_at);
  });

  it('maps request_id to correlationId', () => {
    const envelope = toProtocolAuditEventEnvelope(FULL_EVENT);
    assert.equal(envelope.correlationId, 'request-1');
  });

  it('never fabricates reasonCodes -- ControlPlaneAuditEvent has no reason field to map', () => {
    const envelope = toProtocolAuditEventEnvelope(FULL_EVENT);
    assert.equal(envelope.reasonCodes, undefined);
  });

  it('preserves grant_id and metadata inside payload without inventing new keys', () => {
    const envelope = toProtocolAuditEventEnvelope(FULL_EVENT);
    assert.deepEqual(Object.keys(envelope.payload).sort(), ['grant_id', 'metadata']);
  });

  it('does not mutate the input event (no persistence mutation)', () => {
    const before = JSON.stringify(FULL_EVENT);
    toProtocolAuditEventEnvelope(FULL_EVENT);
    assert.equal(JSON.stringify(FULL_EVENT), before);
  });

  it('is deterministic -- the same input always maps to the same output', () => {
    const first = toProtocolAuditEventEnvelope(FULL_EVENT);
    const second = toProtocolAuditEventEnvelope(FULL_EVENT);
    assert.deepEqual(first, second);
  });
});
