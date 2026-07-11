import { AOC_CANONICALIZATION_VERSION } from '../governance-store/canonical-json.js';
import { computeDigest, isWellFormedDigest } from '../governance-store/digest.js';
import { AOC_AGENT_PASSPORT_RUNTIME_VERSION, type AgentPassportEvent, type AgentPassportEventType } from './contracts.js';

/**
 * Event-chain digest computation for the Agent Passport Runtime. Reuses the
 * Governance Store's canonical JSON serializer and SHA-256 digest primitive
 * verbatim (`../governance-store/canonical-json.js`, `../governance-store/
 * digest.js`) rather than defining a second, incompatible canonicalizer
 * (mission section 37). Each Passport has its own event chain, scoped to
 * that one aggregate (mission section 36) -- verifying one Passport never
 * requires touching another Passport's history.
 *
 * This is an integrity mechanism only: it detects that stored event bytes
 * changed after append. It is NOT a digital signature and NOT
 * non-repudiation -- see Known Limitations in
 * `docs/enterprise/AOC_AGENT_PASSPORT_RUNTIME.md`.
 */

export interface PassportEventDigestInput {
  readonly eventId: string;
  readonly passportId: string;
  readonly organizationId: string;
  readonly eventType: AgentPassportEventType;
  readonly sequence: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly actorId: string;
  readonly actorType: string;
  readonly occurredAt: string;
  readonly persistedAt: string;
  readonly enterpriseVersion: string;
  readonly passportRuntimeVersion: string;
  readonly previousEventDigest?: string;
}

/** The exact shape digested for one event -- stable field order is irrelevant (canonical JSON sorts keys), but the *set* of fields must stay exactly this. */
export function eventDigestInput(event: PassportEventDigestInput): Record<string, unknown> {
  return {
    eventId: event.eventId,
    passportId: event.passportId,
    organizationId: event.organizationId,
    eventType: event.eventType,
    sequence: event.sequence,
    payload: event.payload,
    actorId: event.actorId,
    actorType: event.actorType,
    occurredAt: event.occurredAt,
    persistedAt: event.persistedAt,
    enterpriseVersion: event.enterpriseVersion,
    passportRuntimeVersion: event.passportRuntimeVersion,
    previousEventDigest: event.previousEventDigest ?? null,
  };
}

export function computeEventDigest(event: PassportEventDigestInput): string {
  return computeDigest(eventDigestInput(event));
}

export interface BuildPassportEventInput {
  readonly eventId: string;
  readonly passportId: string;
  readonly organizationId: string;
  readonly eventType: AgentPassportEventType;
  readonly sequence: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly actorId: string;
  readonly actorType: string;
  readonly occurredAt: string;
  readonly persistedAt: string;
  readonly enterpriseVersion: string;
  readonly previousEventDigest?: string;
}

/** Constructs one fully-formed, digested `AgentPassportEvent`. The Store calls this exactly once per append -- callers never supply a digest themselves. */
export function buildPassportEvent(input: BuildPassportEventInput): AgentPassportEvent {
  const base: PassportEventDigestInput = {
    eventId: input.eventId,
    passportId: input.passportId,
    organizationId: input.organizationId,
    eventType: input.eventType,
    sequence: input.sequence,
    payload: input.payload,
    actorId: input.actorId,
    actorType: input.actorType,
    occurredAt: input.occurredAt,
    persistedAt: input.persistedAt,
    enterpriseVersion: input.enterpriseVersion,
    passportRuntimeVersion: AOC_AGENT_PASSPORT_RUNTIME_VERSION,
    ...(input.previousEventDigest !== undefined ? { previousEventDigest: input.previousEventDigest } : {}),
  };
  return {
    ...base,
    eventDigest: computeEventDigest(base),
  };
}

/** Recomputes and checks every event's digest and chain linkage. Used by both `verification.ts` and the shared store contract tests. */
export function verifyEventChain(events: readonly AgentPassportEvent[]): { readonly valid: boolean; readonly failures: string[] } {
  const failures: string[] = [];
  let previousDigest: string | undefined;

  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  for (let index = 0; index < ordered.length; index += 1) {
    const event = ordered[index];
    if (event === undefined) continue;

    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence) {
      failures.push(`Event '${event.eventId}' has sequence ${event.sequence}, expected ${expectedSequence} (gap or duplicate detected).`);
    }

    if (!isWellFormedDigest(event.eventDigest)) {
      failures.push(`Event '${event.eventId}' has a malformed eventDigest.`);
    } else {
      const recomputed = computeEventDigest(event);
      if (recomputed !== event.eventDigest) {
        failures.push(`Event '${event.eventId}' eventDigest does not match its recomputed digest (payload or metadata tampering detected).`);
      }
    }

    if (index === 0) {
      if (event.previousEventDigest !== undefined) {
        failures.push(`Event '${event.eventId}' is the first event but carries a previousEventDigest.`);
      }
    } else if (event.previousEventDigest !== previousDigest) {
      failures.push(`Event '${event.eventId}' previousEventDigest does not match the prior event's digest (chain break detected).`);
    }

    previousDigest = event.eventDigest;
  }

  return { valid: failures.length === 0, failures };
}

export { AOC_CANONICALIZATION_VERSION };
