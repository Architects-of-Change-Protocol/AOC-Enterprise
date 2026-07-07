import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildTimeline, type TimelineSourceEvents } from '../services/control-plane-timeline-service.js';

const EMPTY: TimelineSourceEvents = {
  recognitionEvents: [],
  authorityEvents: [],
  approvalEvents: [],
  handshakeEvents: [],
  enforcementEvents: [],
};

describe('ControlPlaneTimelineService', () => {
  it('normalizes recognition events', () => {
    const timeline = buildTimeline({
      ...EMPTY,
      recognitionEvents: [{ id: 'e1', eventType: 'capability_token_revoked', actorId: 'a1', trustDomainId: 't1', timestamp: '2026-01-01T00:00:01.000Z', payload: {}, eventHash: 'h1' }],
    });
    assert.equal(timeline.length, 1);
    assert.equal(timeline[0]!.source, 'recognition');
    assert.equal(timeline[0]!.status, 'danger');
  });

  it('normalizes authority events', () => {
    const timeline = buildTimeline({
      ...EMPTY,
      authorityEvents: [{ id: 'e1', type: 'authority_grant_issued', trustDomainId: 't1', timestamp: '2026-01-01T00:00:01.000Z', payload: {}, eventHash: 'h1' }],
    });
    assert.equal(timeline.length, 1);
    assert.equal(timeline[0]!.source, 'authority');
    assert.equal(timeline[0]!.status, 'success');
  });

  it('normalizes approval events', () => {
    const timeline = buildTimeline({
      ...EMPTY,
      approvalEvents: [{ id: 'e1', type: 'approval_rejected', trustDomainId: 't1', timestamp: '2026-01-01T00:00:01.000Z', payload: {}, eventHash: 'h1' }],
    });
    assert.equal(timeline.length, 1);
    assert.equal(timeline[0]!.source, 'approval');
    assert.equal(timeline[0]!.status, 'danger');
  });

  it('normalizes handshake events', () => {
    const timeline = buildTimeline({
      ...EMPTY,
      handshakeEvents: [{ id: 'e1', type: 'handshake_accepted', localTrustDomainId: 't1', timestamp: '2026-01-01T00:00:01.000Z', payload: {}, eventHash: 'h1' }],
    });
    assert.equal(timeline.length, 1);
    assert.equal(timeline[0]!.source, 'handshake');
    assert.equal(timeline[0]!.status, 'success');
  });

  it('normalizes enforcement events', () => {
    const timeline = buildTimeline({
      ...EMPTY,
      enforcementEvents: [{ id: 'e1', type: 'execution_blocked', trustDomainId: 't1', timestamp: '2026-01-01T00:00:01.000Z', payload: {}, eventHash: 'h1' }],
    });
    assert.equal(timeline.length, 1);
    assert.equal(timeline[0]!.source, 'enforcement');
    assert.equal(timeline[0]!.status, 'danger');
  });

  it('sorts by timestamp descending', () => {
    const timeline = buildTimeline({
      ...EMPTY,
      enforcementEvents: [
        { id: 'e1', type: 'enforcement_requested', trustDomainId: 't1', timestamp: '2026-01-01T00:00:01.000Z', payload: {}, eventHash: 'h1' },
        { id: 'e2', type: 'execution_succeeded', trustDomainId: 't1', timestamp: '2026-01-01T00:00:03.000Z', payload: {}, eventHash: 'h2' },
        { id: 'e3', type: 'preflight_started', trustDomainId: 't1', timestamp: '2026-01-01T00:00:02.000Z', payload: {}, eventHash: 'h3' },
      ],
    });
    assert.deepEqual(timeline.map((item) => item.id), ['e2', 'e3', 'e1']);
  });

  it('preserves source across a mixed merge', () => {
    const timeline = buildTimeline({
      recognitionEvents: [{ id: 'r1', eventType: 'recognition_decision', actorId: 'a', trustDomainId: 't', timestamp: '2026-01-01T00:00:01.000Z', payload: {}, eventHash: 'h' }],
      authorityEvents: [{ id: 'a1', type: 'authority_proof_created', trustDomainId: 't', timestamp: '2026-01-01T00:00:02.000Z', payload: {}, eventHash: 'h' }],
      approvalEvents: [],
      handshakeEvents: [],
      enforcementEvents: [],
    });
    assert.deepEqual(
      timeline.map((item) => item.source),
      ['authority', 'recognition'],
    );
  });

  it('links related proof ids', () => {
    const timeline = buildTimeline({
      ...EMPTY,
      enforcementEvents: [
        {
          id: 'e1',
          type: 'enforcement_proof_created',
          trustDomainId: 't1',
          enforcementProofId: 'proof-1',
          timestamp: '2026-01-01T00:00:01.000Z',
          payload: {},
          eventHash: 'h1',
        },
      ],
    });
    assert.equal(timeline[0]!.relatedProofId, 'proof-1');
  });

  it('links related decision ids', () => {
    const timeline = buildTimeline({
      ...EMPTY,
      approvalEvents: [
        {
          id: 'e1',
          type: 'approval_approved',
          trustDomainId: 't1',
          approvalDecisionId: 'decision-1',
          timestamp: '2026-01-01T00:00:01.000Z',
          payload: {},
          eventHash: 'h1',
        },
      ],
    });
    assert.equal(timeline[0]!.relatedDecisionId, 'decision-1');
  });
});
