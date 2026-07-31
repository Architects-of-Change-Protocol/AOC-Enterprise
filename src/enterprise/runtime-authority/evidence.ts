import { canonicalSerialize } from '../governance-store/canonical-json.js';
import { computeDigest, isWellFormedDigest } from '../governance-store/digest.js';
import type {
  RuntimeEvidenceActorType,
  RuntimeEvidenceEvent,
  RuntimeEvidenceEventType,
} from './contracts.js';

/**
 * Tamper-evident, hash-chained evidence log (mission section 7). Reuses the
 * Governance Store's exact canonicalization/digest primitives
 * (`aoc.canonical-json.v1`, `sha256:<hex>`) rather than inventing a second
 * one, per the repository's own reuse discipline (see
 * `ADR-ENTERPRISE-GOVERNANCE-STORE.md`). Each event's `eventHash` is
 * `computeDigest({ ...eventWithoutHash, previousHash })` -- so a change to
 * any earlier event, or a deletion/reorder, changes that event's own hash
 * and every hash chained after it. This is the same integrity model the
 * Governance Store documents: an *integrity* mechanism (detects tampering
 * after the fact), not a signature and not external anchoring -- v1 does not
 * claim non-repudiation or protection against a privileged store admin who
 * rewrites an entire chain consistently.
 */

export interface RuntimeEvidenceEventInput {
  readonly tenantId: string;
  readonly runtimeId: string;
  readonly agentId?: string;
  readonly eventType: RuntimeEvidenceEventType;
  readonly actorType: RuntimeEvidenceActorType;
  readonly actorId: string;
  readonly capability?: string;
  readonly resource?: Readonly<Record<string, unknown>>;
  readonly decision?: 'ALLOW' | 'DENY';
  readonly reason?: string;
  readonly policyVersion?: string;
  readonly leaseId?: string;
  readonly correlationId: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

/** Fields that must never appear in an evidence payload (mission section 7: "no secrets in evidence payloads"). Defense-in-depth: values under these keys are redacted even if a caller passes them. */
const SENSITIVE_PAYLOAD_KEYS = new Set(['signature', 'privateKey', 'secret', 'password', 'apiKey', 'token', 'authorization']);

function redactSensitivePayload(payload: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    redacted[key] = SENSITIVE_PAYLOAD_KEYS.has(key) ? '[REDACTED]' : value;
  }
  return redacted;
}

export interface RuntimeEvidenceChainVerificationResult {
  readonly valid: boolean;
  readonly eventCount: number;
  /** The first event whose recomputed hash (or `previousHash` linkage) does not match, if any -- proof of exactly where tampering was introduced. */
  readonly firstInvalidEventId?: string;
  readonly failureReason?: string;
}

export interface RuntimeEvidenceLog {
  /** Appends one event to `runtimeId`'s chain, computing `previousHash`/`eventHash` from the current tail. Append-only: no update/delete method exists. */
  append(input: RuntimeEvidenceEventInput): RuntimeEvidenceEvent;
  list(runtimeId: string): readonly RuntimeEvidenceEvent[];
  listByTenant(tenantId: string): readonly RuntimeEvidenceEvent[];
  /** Recomputes every hash in `runtimeId`'s chain from stored content and compares against the stored `eventHash`/`previousHash` -- "recompute, never trust", mirroring the Governance Store's own verifier. */
  verify(runtimeId: string): RuntimeEvidenceChainVerificationResult;
}

function computeEventHash(event: Omit<RuntimeEvidenceEvent, 'eventHash'>): string {
  return computeDigest(event);
}

/** In-memory, append-only evidence log. `nextId`/`now` are injected so tests are deterministic. Production hardening (durable storage) is a documented next step -- see the ADR's "Known limitations". */
export function createInMemoryRuntimeEvidenceLog(options: { readonly now?: () => string; readonly nextId?: (prefix: string) => string } = {}): RuntimeEvidenceLog {
  const now = options.now ?? (() => new Date().toISOString());
  let counter = 0;
  const nextId = options.nextId ?? ((prefix: string) => {
    counter += 1;
    return `${prefix}-${counter.toString(36)}-${Date.now().toString(36)}`;
  });

  const chains = new Map<string, RuntimeEvidenceEvent[]>();

  return {
    append(input: RuntimeEvidenceEventInput): RuntimeEvidenceEvent {
      const chain = chains.get(input.runtimeId) ?? [];
      const previous = chain[chain.length - 1];
      const previousHash = previous?.eventHash;

      const base: Omit<RuntimeEvidenceEvent, 'eventHash'> = {
        eventId: nextId('evidence'),
        tenantId: input.tenantId,
        runtimeId: input.runtimeId,
        ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
        eventType: input.eventType,
        actorType: input.actorType,
        actorId: input.actorId,
        ...(input.capability !== undefined ? { capability: input.capability } : {}),
        ...(input.resource !== undefined ? { resource: input.resource } : {}),
        ...(input.decision !== undefined ? { decision: input.decision } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.policyVersion !== undefined ? { policyVersion: input.policyVersion } : {}),
        ...(input.leaseId !== undefined ? { leaseId: input.leaseId } : {}),
        correlationId: input.correlationId,
        ...(previousHash !== undefined ? { previousHash } : {}),
        occurredAt: now(),
        payload: redactSensitivePayload(input.payload ?? {}),
      };

      const eventHash = computeEventHash(base);
      const event: RuntimeEvidenceEvent = { ...base, eventHash };

      // -- synchronous commit: no await between read and write, matching the
      // Passport/Evidence stores' own append discipline.
      chains.set(input.runtimeId, [...chain, event]);
      return event;
    },

    list(runtimeId: string): readonly RuntimeEvidenceEvent[] {
      return [...(chains.get(runtimeId) ?? [])];
    },

    listByTenant(tenantId: string): readonly RuntimeEvidenceEvent[] {
      const events: RuntimeEvidenceEvent[] = [];
      for (const chain of chains.values()) {
        for (const event of chain) {
          if (event.tenantId === tenantId) events.push(event);
        }
      }
      return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },

    verify(runtimeId: string): RuntimeEvidenceChainVerificationResult {
      const chain = chains.get(runtimeId) ?? [];
      let previousHash: string | undefined;

      for (const event of chain) {
        if (event.previousHash !== previousHash) {
          return {
            valid: false,
            eventCount: chain.length,
            firstInvalidEventId: event.eventId,
            failureReason: `Event '${event.eventId}' declares previousHash '${event.previousHash ?? '(none)'}' but the preceding event in the chain hashes to '${previousHash ?? '(none)'}'.`,
          };
        }

        const { eventHash: storedHash, ...rest } = event;
        if (!isWellFormedDigest(storedHash)) {
          return { valid: false, eventCount: chain.length, firstInvalidEventId: event.eventId, failureReason: `Event '${event.eventId}' has a malformed eventHash.` };
        }
        const recomputed = computeEventHash(rest);
        if (recomputed !== storedHash) {
          return {
            valid: false,
            eventCount: chain.length,
            firstInvalidEventId: event.eventId,
            failureReason: `Event '${event.eventId}' content does not match its recorded eventHash (stored '${storedHash}', recomputed '${recomputed}'); the event was modified after being appended.`,
          };
        }

        previousHash = storedHash;
      }

      return { valid: true, eventCount: chain.length };
    },
  };
}

/** Exposed for callers (e.g. the demo script, the dashboard) that want to display the canonical serialization of an event without recomputing digests by hand. */
export function canonicalEvidenceEventBytes(event: RuntimeEvidenceEvent): string {
  const { eventHash, ...rest } = event;
  void eventHash;
  return canonicalSerialize(rest);
}
