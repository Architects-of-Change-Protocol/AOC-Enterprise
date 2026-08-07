/**
 * Content Protection evidence events (Slice 2 requirement 24). Deliberately
 * a small, closed, additive event vocabulary scoped to exactly what this
 * slice does -- protecting content -- and nothing execution/authorization
 * related does not exist yet. Never `execution_blocked`,
 * `execution_revoked`, or `kill_switch_triggered`: those describe an
 * `ExecutionGrant` + `KeyBroker` capability this slice does not build (see
 * `key-wrapping-port.ts`'s module doc).
 *
 * Kept as this module's own local event type rather than folded into
 * `../events/enterprise-events.ts`'s closed `EnterpriseEvent` union --
 * `createContentProtectionService` (`service.ts`) accepts an optional
 * `onEvent` callback of exactly this type, so a composition root that wants
 * these events bridged onto the shared Enterprise event publisher can do so
 * by wrapping one call, without this module reaching into or widening a
 * shared, cross-cutting type it does not own.
 */
export type ContentProtectionEventType =
  | 'protection_requested'
  | 'protection_succeeded'
  | 'protection_failed'
  | 'integrity_mismatch'
  | 'ciphertext_stored'
  | 'sovereign_binding_validation_started'
  | 'sovereign_manifest_verified'
  | 'sovereign_content_identity_matched'
  | 'sovereign_binding_rejected'
  | 'protected_resource_activated';

/**
 * Bounded, structured detail only -- ids, states, safe truthful sentences.
 * Never plaintext, never a raw DEK/KEK, never a wrapped-key ciphertext
 * blob, never a provider credential/JWT, never a raw driver/OpenSSL error.
 * `service.ts` constructs every event below from values it already knows
 * are safe to persist on `ProtectedResourceRecord` itself (digests, ids,
 * state, `failureReason`) -- never from an unfiltered caught exception.
 */
export interface ContentProtectionEvent {
  readonly eventId: string;
  readonly type: ContentProtectionEventType;
  readonly occurredAt: string;
  readonly organizationId: string;
  readonly protectedResourceId: string;
  readonly correlationId: string;
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}
