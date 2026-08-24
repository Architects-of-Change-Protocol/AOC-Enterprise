import { decideKernelAuthorityAppend, validateKernelAuthorityAppendInput } from './append-rules.js';
import {
  AOC_KERNEL_AUTHORITY_RUNTIME_VERSION,
  KERNEL_AUTHORITY_SCHEMA_VERSION,
  type AppendKernelAuthorityEventInput,
  type AppendKernelAuthorityEventResult,
  type KernelAuthorityAccessContext,
  type KernelAuthorityEntityKind,
  type KernelAuthorityEvent,
  type KernelAuthorityExternalSubject,
  type KernelAuthorityRecord,
  type KernelAuthorityRecordQuery,
  type KernelAuthorityStoreHealth,
} from './contracts.js';
import { KernelAuthorityError } from './errors.js';
import {
  buildKernelAuthorityEvent,
  compareKernelAuthorityRecords,
  externalSubjectKey,
  readExternalSubject,
  reconstructKernelAuthorityRecord,
  requireKernelAuthorityOperator,
  requireKernelAuthorityReadAccess,
  type KernelAuthorityStore,
} from './kernel-authority-store.js';

export interface CreateInMemoryKernelAuthorityStoreOptions {
  readonly now?: () => string;
  readonly nextId?: (prefix: string) => string;
  readonly runtimeVersion?: string;
}

function chainKey(organizationId: string, entityKind: KernelAuthorityEntityKind, entityId: string): string {
  return `${organizationId} ${entityKind} ${entityId}`;
}

/**
 * In-memory `KernelAuthorityStore`.
 *
 * Real and rule-for-rule identical to the SQLite implementation -- the same
 * append rules, the same digest chain, the same tenancy guards -- but it is
 * emphatically **not durable**: everything it holds dies with the process. It
 * exists for unit tests, fixtures and local development, and the composition
 * root labels it as such in health output so a deployment can never mistake it
 * for restored, operator-provisioned state (mission section 33).
 *
 * A deployment that requires durable authority configures the SQLite provider.
 * This implementation is never substituted for it on failure.
 */
export function createInMemoryKernelAuthorityStore(options: CreateInMemoryKernelAuthorityStoreOptions = {}): KernelAuthorityStore {
  const now = options.now ?? (() => new Date().toISOString());
  const counter = { value: 0 };
  const nextId =
    options.nextId ??
    ((prefix: string) => {
      counter.value += 1;
      return `${prefix}-${counter.value.toString(36)}`;
    });
  const runtimeVersion = options.runtimeVersion ?? AOC_KERNEL_AUTHORITY_RUNTIME_VERSION;

  const chains = new Map<string, KernelAuthorityEvent[]>();
  const idempotency = new Map<string, { readonly payloadDigest: string; readonly entityKind: string; readonly entityId: string }>();
  const externalSubjects = new Map<string, string>();
  let closed = false;

  function assertOpen(): void {
    if (closed) throw new KernelAuthorityError('KERNEL_AUTHORITY_STORE_UNAVAILABLE', 'The Kernel Authority Store has been closed.');
  }

  function loadChain(organizationId: string, entityKind: KernelAuthorityEntityKind, entityId: string): KernelAuthorityEvent[] {
    return chains.get(chainKey(organizationId, entityKind, entityId)) ?? [];
  }

  return {
    providerKind: 'memory',

    async appendEvent(context: KernelAuthorityAccessContext, input: AppendKernelAuthorityEventInput): Promise<AppendKernelAuthorityEventResult> {
      assertOpen();
      const operatorId = requireKernelAuthorityOperator(context);
      validateKernelAuthorityAppendInput(input);

      const existingEvents = loadChain(input.organizationId, input.entityKind, input.entityId);
      const idempotencyMapKey = input.idempotency !== undefined ? `${input.organizationId} ${input.idempotency.idempotencyKey}` : undefined;
      const externalSubject = input.entityKind === 'actor' && input.eventType === 'KernelAuthorityEntityProvisioned' ? readExternalSubject(input.payload) : undefined;
      const boundActorId = externalSubject !== undefined ? externalSubjects.get(externalSubjectKey(input.organizationId, externalSubject)) : undefined;

      const decision = decideKernelAuthorityAppend(input, {
        existingEvents,
        ...(idempotencyMapKey !== undefined && idempotency.has(idempotencyMapKey) ? { idempotencyClaim: idempotency.get(idempotencyMapKey) as { payloadDigest: string; entityKind: string; entityId: string } } : {}),
        ...(boundActorId !== undefined && boundActorId !== input.entityId ? { conflictingExternalSubjectActorId: boundActorId } : {}),
      });

      if (decision.outcome === 'replay') {
        return { event: existingEvents[existingEvents.length - 1] as KernelAuthorityEvent, record: decision.record, replayed: true };
      }

      const timestamp = now();
      const event = buildKernelAuthorityEvent({
        eventId: nextId('kernel-authority-event'),
        organizationId: input.organizationId,
        entityKind: input.entityKind,
        entityId: input.entityId,
        eventType: input.eventType,
        sequence: decision.sequence,
        payload: input.payload,
        provisionedBy: operatorId,
        occurredAt: input.occurredAt ?? timestamp,
        persistedAt: timestamp,
        runtimeVersion,
        ...(decision.previousEventDigest !== undefined ? { previousEventDigest: decision.previousEventDigest } : {}),
      });

      const nextChain = [...existingEvents, event];
      chains.set(chainKey(input.organizationId, input.entityKind, input.entityId), nextChain);
      if (idempotencyMapKey !== undefined) {
        idempotency.set(idempotencyMapKey, { payloadDigest: decision.payloadDigest, entityKind: input.entityKind, entityId: input.entityId });
      }
      if (externalSubject !== undefined) {
        externalSubjects.set(externalSubjectKey(input.organizationId, externalSubject), input.entityId);
      }

      return { event, record: reconstructKernelAuthorityRecord(nextChain), replayed: false };
    },

    async getRecord(context, organizationId, entityKind, entityId): Promise<KernelAuthorityRecord | null> {
      assertOpen();
      requireKernelAuthorityReadAccess(context, organizationId);
      const events = loadChain(organizationId, entityKind, entityId);
      return events.length === 0 ? null : reconstructKernelAuthorityRecord(events);
    },

    async listRecords(context, query: KernelAuthorityRecordQuery): Promise<readonly KernelAuthorityRecord[]> {
      assertOpen();
      requireKernelAuthorityReadAccess(context, query.organizationId);
      const records: KernelAuthorityRecord[] = [];
      for (const events of chains.values()) {
        const first = events[0];
        if (first === undefined || first.organizationId !== query.organizationId) continue;
        if (query.entityKind !== undefined && first.entityKind !== query.entityKind) continue;
        const record = reconstructKernelAuthorityRecord(events);
        if (query.trustDomainId !== undefined && record.trustDomainId !== query.trustDomainId) continue;
        if (query.status !== undefined && record.status !== query.status) continue;
        records.push(record);
      }
      return records.sort(compareKernelAuthorityRecords);
    },

    async listEvents(context, organizationId, entityKind, entityId): Promise<readonly KernelAuthorityEvent[]> {
      assertOpen();
      requireKernelAuthorityReadAccess(context, organizationId);
      return [...loadChain(organizationId, entityKind, entityId)];
    },

    async findActorByExternalSubject(
      context,
      organizationId: string,
      externalSubject: KernelAuthorityExternalSubject,
    ): Promise<KernelAuthorityRecord | null> {
      assertOpen();
      requireKernelAuthorityReadAccess(context, organizationId);
      const actorId = externalSubjects.get(externalSubjectKey(organizationId, externalSubject));
      if (actorId === undefined) return null;
      const events = loadChain(organizationId, 'actor', actorId);
      return events.length === 0 ? null : reconstructKernelAuthorityRecord(events);
    },

    async health(): Promise<KernelAuthorityStoreHealth> {
      return {
        providerKind: 'memory',
        status: closed ? 'unhealthy' : 'healthy',
        readable: !closed,
        writable: !closed,
        schemaVersion: KERNEL_AUTHORITY_SCHEMA_VERSION,
        migrationState: 'current',
        recordCount: chains.size,
      };
    },

    async close(): Promise<void> {
      closed = true;
    },
  };
}
