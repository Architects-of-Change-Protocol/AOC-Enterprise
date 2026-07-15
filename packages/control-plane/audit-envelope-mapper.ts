import type { AuditEventEnvelope, ResourceRef } from '@aoc/protocol';
import type { ControlPlaneAuditEvent } from './types.js';

/**
 * Explicit, sole boundary between Enterprise's legacy, persisted, snake_case
 * `ControlPlaneAuditEvent` (see `.aoc-control-plane.json` via
 * `FileControlPlaneStore`, and `types.ts`) and AOC Protocol's canonical
 * `AuditEventEnvelope`. Every field is mapped by hand -- no structural cast,
 * no object spread from one shape into the other -- so a future Protocol
 * field-shape change surfaces here as a compiler error, not a silent runtime
 * drift.
 *
 * This does not change what Enterprise persists (`.aoc-control-plane.json`
 * keeps the exact same snake_case shape) or what `ControlPlaneService`'s
 * existing public methods return; it is an opt-in conversion for a caller
 * that specifically needs a real Protocol envelope.
 *
 * Only the legacy-to-Protocol direction is implemented. There is no
 * demonstrated production need today for Enterprise's control plane to
 * ingest a Protocol `AuditEventEnvelope` and convert it back into the legacy
 * shape (nothing in this codebase produces/receives Protocol envelopes for
 * control-plane events) -- a `fromProtocolAuditEventEnvelope` would exist
 * only for symmetry, which the sprint that added this mapper explicitly
 * disallows. Add it only alongside a real, evidenced call site.
 */
export function toProtocolAuditEventEnvelope(event: ControlPlaneAuditEvent): AuditEventEnvelope {
  const payload: Record<string, unknown> = {
    ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
    ...(event.grant_id === undefined ? {} : { grant_id: event.grant_id }),
  };

  return {
    eventId: event.event_id,
    eventType: event.event_type,
    // Enterprise's control-plane events carry exactly one timestamp
    // (`occurred_at`) -- they do not distinguish "when the underlying fact
    // happened" from "when this envelope was emitted". Mapping the same
    // value into both of Protocol's timestamp fields is a documented
    // fallback for that lack of distinction, not an assumption that the two
    // will always coincide for every future event source.
    emittedAt: event.occurred_at,
    occurredAt: event.occurred_at,
    // The principal that performed/requested the action this event
    // describes is Enterprise's `requester_id` -- not `subject_id`, which
    // identifies the data subject the event is about (see `subject` below).
    actorId: event.requester_id,
    // Protocol's `subject` requires a structured `ResourceRef`, not a bare
    // string. Enterprise's control-plane domain has no separate resource-kind
    // taxonomy for "the data subject a request concerns" today, so `kind`
    // below is a minimal, explicitly documented literal identifying what
    // `subject_id` denotes in this mapping -- it is not an assertion about a
    // broader Enterprise resource-kind vocabulary, and no tenant context
    // exists on `ControlPlaneAuditEvent` to populate `tenantId`.
    subject: subjectResourceRef(event.subject_id),
    // Correlates this event with the access-request operation it belongs to.
    correlationId: event.request_id,
    // No `reason` or machine-readable reason-code field exists on
    // ControlPlaneAuditEvent today -- omit `reasonCodes` rather than
    // fabricate one from free text or absent data.
    payload,
  };
}

function subjectResourceRef(subjectId: string): ResourceRef {
  return { kind: 'control-plane-subject', id: subjectId };
}
