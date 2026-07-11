import { computeDigest } from '../governance-store/digest.js';
import { AgentPassportError } from './errors.js';
import { applyLifecycleTransition, isTerminalStatus } from './lifecycle.js';
import { buildPassportEvent } from './events.js';
import { parseCreatedEventPayload, reconstructAgentPassportFromEvents } from './reconstruction.js';
import { verifyAgentPassport } from './verification.js';
import { canAccessPassportOrganization, requireAccessToOrganization, requirePassportTenantScope, type AgentPassportStore } from './passport-store.js';
import type {
  AgentPassport,
  AgentPassportEvent,
  AgentPassportLoadResult,
  AgentPassportStatus,
  AgentPassportStoreHealth,
  AgentPassportVerificationResult,
  AppendPassportEventInput,
  AppendPassportEventResult,
  PassportAccessContext,
  PassportIdempotencyProbe,
  PassportIdempotencyResolution,
} from './contracts.js';

export interface CreateInMemoryPassportStoreOptions {
  readonly now?: () => string;
  readonly nextId?: (prefix: string) => string;
  readonly enterpriseVersion?: string;
}

interface PassportMeta {
  readonly organizationId: string;
  readonly agentId: string;
}

interface IdempotencyClaim {
  readonly subjectDigest: string;
  readonly passportId: string;
}

function defaultNextId(prefix: string, counterRef: { value: number }): string {
  counterRef.value += 1;
  return `${prefix}-${counterRef.value.toString(36)}-${Date.now().toString(36)}`;
}

/**
 * In-memory `AgentPassportStore` (mission section 53). Atomicity comes from
 * the synchronous commit sections -- no `await` sits between a lookup and
 * its corresponding index update, exactly the same discipline as
 * `createInMemoryEvidenceStore`. Independent of the Governance Store and
 * Evidence Bundle Store (mission section 9): no import of either exists in
 * this file.
 */
export function createInMemoryPassportStore(options: CreateInMemoryPassportStoreOptions = {}): AgentPassportStore {
  const now = options.now ?? (() => new Date().toISOString());
  const counter = { value: 0 };
  const nextId = options.nextId ?? ((prefix: string) => defaultNextId(prefix, counter));
  const enterpriseVersion = options.enterpriseVersion ?? 'unknown';

  const eventsByPassportId = new Map<string, AgentPassportEvent[]>();
  const activeIndex = new Map<string, string>(); // `${organizationId}::${agentId}` -> passportId, while non-terminal
  const passportMeta = new Map<string, PassportMeta>();
  const idempotencyIndex = new Map<string, IdempotencyClaim>();
  let closed = false;

  function assertOpen(): void {
    if (closed) throw new AgentPassportError('PASSPORT_STORE_UNAVAILABLE', 'The Agent Passport Store has been closed.');
  }

  function requireExistingEvents(passportId: string): AgentPassportEvent[] {
    const events = eventsByPassportId.get(passportId);
    if (events === undefined || events.length === 0) {
      throw new AgentPassportError('PASSPORT_NOT_FOUND', `No Agent Passport for passportId '${passportId}'.`);
    }
    return events;
  }

  return {
    providerKind: 'memory',

    async appendEvent(context: PassportAccessContext, input: AppendPassportEventInput): Promise<AppendPassportEventResult> {
      assertOpen();
      requireAccessToOrganization(context, input.organizationId);

      const existing = eventsByPassportId.get(input.passportId) ?? [];

      let currentStatus: AgentPassportStatus | undefined;
      if (existing.length > 0) {
        const currentPassport = reconstructAgentPassportFromEvents(input.passportId, existing);
        currentStatus = currentPassport.status;
        if (currentPassport.organization.organizationId !== input.organizationId) {
          throw new AgentPassportError('PASSPORT_ACCESS_SCOPE_VIOLATION', `Event organizationId '${input.organizationId}' does not match Passport '${input.passportId}' organization '${currentPassport.organization.organizationId}'.`);
        }
      }

      const nextStatus = applyLifecycleTransition(currentStatus, input.eventType);

      let createdAgentId: string | undefined;
      let orgAgentKey: string | undefined;
      if (input.eventType === 'AgentPassportCreated') {
        const { agentId } = parseCreatedEventPayload(input.payload);
        createdAgentId = agentId;
        orgAgentKey = `${input.organizationId}::${agentId}`;
        if (activeIndex.has(orgAgentKey)) {
          throw new AgentPassportError('PASSPORT_ALREADY_EXISTS', `An active (non-terminal) Passport already exists for agentId '${agentId}' in organization '${input.organizationId}'. Issue a new Passport only after the prior one reaches a terminal status.`);
        }
        if (input.idempotency !== undefined) {
          const idKey = `${input.idempotency.scope}::${input.idempotency.idempotencyKey}`;
          if (idempotencyIndex.has(idKey)) {
            throw new AgentPassportError('PASSPORT_IDEMPOTENCY_CONFLICT', `Idempotency key '${input.idempotency.idempotencyKey}' was already claimed within scope '${input.idempotency.scope}'.`);
          }
        }
      }

      const sequence = existing.length + 1;
      const previousEvent = existing[existing.length - 1];

      const event = buildPassportEvent({
        eventId: nextId('passport-event'),
        passportId: input.passportId,
        organizationId: input.organizationId,
        eventType: input.eventType,
        sequence,
        payload: input.payload,
        actorId: input.actorId,
        actorType: input.actorType,
        occurredAt: input.occurredAt ?? now(),
        persistedAt: now(),
        enterpriseVersion,
        ...(previousEvent !== undefined ? { previousEventDigest: previousEvent.eventDigest } : {}),
      });

      // -- Synchronous commit section --
      const updatedEvents = [...existing, event];
      eventsByPassportId.set(input.passportId, updatedEvents);

      if (input.eventType === 'AgentPassportCreated' && createdAgentId !== undefined && orgAgentKey !== undefined) {
        activeIndex.set(orgAgentKey, input.passportId);
        passportMeta.set(input.passportId, { organizationId: input.organizationId, agentId: createdAgentId });
        if (input.idempotency !== undefined) {
          const idKey = `${input.idempotency.scope}::${input.idempotency.idempotencyKey}`;
          idempotencyIndex.set(idKey, { subjectDigest: computeDigest(input.payload.subject), passportId: input.passportId });
        }
      }

      if (isTerminalStatus(nextStatus)) {
        const meta = passportMeta.get(input.passportId);
        if (meta !== undefined) {
          const key = `${meta.organizationId}::${meta.agentId}`;
          if (activeIndex.get(key) === input.passportId) activeIndex.delete(key);
        }
      }
      // -- End commit section --

      const passport = reconstructAgentPassportFromEvents(input.passportId, updatedEvents);
      return { event, passport };
    },

    async resolveIdempotency(_context: PassportAccessContext, probe: PassportIdempotencyProbe): Promise<PassportIdempotencyResolution> {
      assertOpen();
      const idKey = `${probe.idempotency.scope}::${probe.idempotency.idempotencyKey}`;
      const claim = idempotencyIndex.get(idKey);
      if (claim === undefined) return { kind: 'new' };
      if (claim.subjectDigest !== probe.subjectDigest) return { kind: 'conflict' };
      return { kind: 'replay', passportId: claim.passportId };
    },

    async reconstruct(context: PassportAccessContext, passportId: string): Promise<AgentPassportLoadResult> {
      assertOpen();
      const events = requireExistingEvents(passportId);
      requireAccessToOrganization(context, events[0]?.organizationId ?? '');

      try {
        const passport = reconstructAgentPassportFromEvents(passportId, events);
        return { status: 'complete', passport, missingComponents: [], integrityFailures: [] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown reconstruction failure.';
        return { status: 'incomplete', missingComponents: ['passport'], integrityFailures: [message] };
      }
    },

    async listEvents(context: PassportAccessContext, passportId: string): Promise<readonly AgentPassportEvent[]> {
      assertOpen();
      const events = requireExistingEvents(passportId);
      requireAccessToOrganization(context, events[0]?.organizationId ?? '');
      return [...events].sort((a, b) => a.sequence - b.sequence);
    },

    async verify(context: PassportAccessContext, passportId: string): Promise<AgentPassportVerificationResult> {
      assertOpen();
      const events = requireExistingEvents(passportId);
      requireAccessToOrganization(context, events[0]?.organizationId ?? '');
      return verifyAgentPassport({ passportId, events, mode: 'STRUCTURAL', now });
    },

    async findByAgentId(context: PassportAccessContext, agentId: string): Promise<AgentPassport | null> {
      assertOpen();
      requirePassportTenantScope(context);
      const organizationId = context.organizationId;
      if (organizationId === undefined) {
        throw new AgentPassportError('PASSPORT_TENANT_SCOPE_REQUIRED', 'findByAgentId requires an explicit organization scope, including for system callers.');
      }
      const key = `${organizationId}::${agentId}`;
      const passportId = activeIndex.get(key);
      if (passportId === undefined) return null;
      const events = eventsByPassportId.get(passportId);
      if (events === undefined || events.length === 0) return null;
      return reconstructAgentPassportFromEvents(passportId, events);
    },

    async health(): Promise<AgentPassportStoreHealth> {
      return {
        status: closed ? 'unhealthy' : 'healthy',
        readable: !closed,
        writable: !closed,
        schemaVersion: 'aoc.agent-passport.schema.v1',
        migrationState: 'current',
        checkedAt: now(),
      };
    },

    async close(): Promise<void> {
      closed = true;
    },
  };
}

// Re-exported for callers that only need the access-scope check helpers alongside this store.
export { canAccessPassportOrganization };
