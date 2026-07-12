import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { AgentPassportError } from './errors.js';
import { applyLifecycleTransition } from './lifecycle.js';
import { buildPassportEvent } from './events.js';
import { computeDigest } from '../governance-store/digest.js';
import { AGENT_PASSPORT_SCHEMA_VERSION, parseCreatedEventPayload, reconstructAgentPassportFromEvents } from './reconstruction.js';
import { verifyAgentPassport } from './verification.js';
import { requireAccessToOrganization, requirePassportTenantScope, type AgentPassportStore } from './passport-store.js';
import type {
  AgentPassport,
  AgentPassportEvent,
  AgentPassportEventType,
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

export interface CreateSqlitePassportStoreOptions {
  readonly now?: () => string;
  readonly nextId?: (prefix: string) => string;
  readonly enterpriseVersion?: string;
  readonly busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Schema (`aoc.agent-passport.schema.v1`). Three tables only (mission
// section 35): events are canonical, `agent_passports` is a reconstructable
// projection cache (never a second source of truth -- every column on it is
// re-derivable from `agent_passport_events`), and `agent_passport_idempotency`
// records issuance idempotency claims. A partial UNIQUE index enforces
// "only one non-terminal Passport per (organization, agent)" (mission
// section 11) at the database layer, in addition to the application-level
// check performed before insert.
// ---------------------------------------------------------------------------
const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS agent_passport_store_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL,
    migration_state TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_passports (
    passport_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    passport_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    latest_sequence INTEGER NOT NULL,
    latest_event_digest TEXT NOT NULL,
    current_status TEXT NOT NULL,
    schema_version TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_passports_active_org_agent
    ON agent_passports(organization_id, agent_id)
    WHERE current_status IN ('draft', 'active', 'suspended');
  CREATE INDEX IF NOT EXISTS idx_agent_passports_org ON agent_passports(organization_id);

  CREATE TABLE IF NOT EXISTS agent_passport_events (
    event_id TEXT PRIMARY KEY,
    passport_id TEXT NOT NULL REFERENCES agent_passports(passport_id),
    organization_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    previous_event_digest TEXT,
    event_digest TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    persisted_at TEXT NOT NULL,
    enterprise_version TEXT NOT NULL,
    passport_runtime_version TEXT NOT NULL,
    UNIQUE(passport_id, sequence)
  );
  CREATE INDEX IF NOT EXISTS idx_agent_passport_events_passport ON agent_passport_events(passport_id, sequence);

  CREATE TABLE IF NOT EXISTS agent_passport_idempotency (
    scope TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    subject_digest TEXT NOT NULL,
    passport_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (scope, idempotency_key)
  );
`;

interface PassportProjectionRow {
  readonly passport_id: string;
  readonly organization_id: string;
  readonly agent_id: string;
  readonly current_status: string;
}

interface EventRow {
  readonly event_id: string;
  readonly passport_id: string;
  readonly organization_id: string;
  readonly sequence: number;
  readonly event_type: string;
  readonly payload_json: string;
  readonly previous_event_digest: string | null;
  readonly event_digest: string;
  readonly actor_id: string;
  readonly actor_type: string;
  readonly occurred_at: string;
  readonly persisted_at: string;
  readonly enterprise_version: string;
  readonly passport_runtime_version: string;
}

function rowToEvent(row: EventRow): AgentPassportEvent {
  return {
    eventId: row.event_id,
    passportId: row.passport_id,
    organizationId: row.organization_id,
    eventType: row.event_type as AgentPassportEventType,
    sequence: row.sequence,
    payload: JSON.parse(row.payload_json) as Readonly<Record<string, unknown>>,
    actorId: row.actor_id,
    actorType: row.actor_type,
    occurredAt: row.occurred_at,
    persistedAt: row.persisted_at,
    enterpriseVersion: row.enterprise_version,
    passportRuntimeVersion: row.passport_runtime_version,
    ...(row.previous_event_digest !== null ? { previousEventDigest: row.previous_event_digest } : {}),
    eventDigest: row.event_digest,
  };
}

function resolveBusyTimeoutMs(value: number | undefined): number {
  const timeout = value ?? DEFAULT_BUSY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new RangeError(`busyTimeoutMs must be a positive integer, received '${String(value)}'.`);
  }
  return timeout;
}

function sqliteErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

function resolveOnDisk(dbPath: string): string {
  const absPath = resolve(dbPath);
  const dir = dirname(absPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return absPath;
}

function defaultNextId(prefix: string, counterRef: { value: number }): string {
  counterRef.value += 1;
  return `${prefix}-${counterRef.value.toString(36)}-${Date.now().toString(36)}`;
}

/**
 * SQLite-backed `AgentPassportStore` (mission section 53), `better-sqlite3`
 * loaded lazily, hand-written SQL. Every `appendEvent` call runs inside one
 * synchronous `db.transaction(...)` -- better-sqlite3 is synchronous, so no
 * other in-process caller can interleave, and the partial unique index plus
 * `(passport_id, sequence)` uniqueness serialize cross-process writers too.
 */
export async function createSqlitePassportStore(dbPath: string, options: CreateSqlitePassportStoreOptions = {}): Promise<AgentPassportStore> {
  const { default: Database } = await import('better-sqlite3');

  const now = options.now ?? (() => new Date().toISOString());
  const counter = { value: 0 };
  const nextId = options.nextId ?? ((prefix: string) => defaultNextId(prefix, counter));
  const enterpriseVersion = options.enterpriseVersion ?? 'unknown';

  const path = dbPath === ':memory:' ? ':memory:' : resolveOnDisk(dbPath);
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma(`busy_timeout = ${resolveBusyTimeoutMs(options.busyTimeoutMs)}`);
  db.exec(SCHEMA_V1);

  const latestVersion = db.prepare(`SELECT schema_version FROM agent_passport_store_versions ORDER BY id DESC LIMIT 1`).get() as { schema_version: string } | undefined;
  if (latestVersion === undefined) {
    db.prepare(`INSERT INTO agent_passport_store_versions (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`).run(AGENT_PASSPORT_SCHEMA_VERSION, now());
  } else if (latestVersion.schema_version !== AGENT_PASSPORT_SCHEMA_VERSION) {
    db.close();
    throw new AgentPassportError(
      'PASSPORT_STORE_UNAVAILABLE',
      `Agent Passport Store schema version '${latestVersion.schema_version}' is not supported by this runtime (expected '${AGENT_PASSPORT_SCHEMA_VERSION}'). Refusing to open the store.`,
    );
  }

  const insertPassportProjection = db.prepare(`INSERT INTO agent_passports
    (passport_id, organization_id, agent_id, agent_type, passport_version, created_at, created_by, latest_sequence, latest_event_digest, current_status, schema_version)
    VALUES (@passportId, @organizationId, @agentId, @agentType, @passportVersion, @createdAt, @createdBy, @latestSequence, @latestEventDigest, @currentStatus, @schemaVersion)`);
  const updatePassportProjection = db.prepare(`UPDATE agent_passports SET latest_sequence = @latestSequence, latest_event_digest = @latestEventDigest, current_status = @currentStatus WHERE passport_id = @passportId`);
  const insertEvent = db.prepare(`INSERT INTO agent_passport_events
    (event_id, passport_id, organization_id, sequence, event_type, payload_json, previous_event_digest, event_digest, actor_id, actor_type, occurred_at, persisted_at, enterprise_version, passport_runtime_version)
    VALUES (@eventId, @passportId, @organizationId, @sequence, @eventType, @payloadJson, @previousEventDigest, @eventDigest, @actorId, @actorType, @occurredAt, @persistedAt, @enterpriseVersion, @passportRuntimeVersion)`);
  const insertIdempotency = db.prepare(`INSERT INTO agent_passport_idempotency (scope, idempotency_key, subject_digest, passport_id, created_at) VALUES (@scope, @idempotencyKey, @subjectDigest, @passportId, @createdAt)`);

  const selectProjectionByOrgAgentActive = db.prepare(`SELECT * FROM agent_passports WHERE organization_id = ? AND agent_id = ? AND current_status IN ('draft', 'active', 'suspended')`);
  const selectEventsByPassportId = db.prepare(`SELECT * FROM agent_passport_events WHERE passport_id = ? ORDER BY sequence ASC`);
  const selectIdempotencyClaim = db.prepare(`SELECT * FROM agent_passport_idempotency WHERE scope = ? AND idempotency_key = ?`);

  let closed = false;

  function assertOpen(): void {
    if (closed) throw new AgentPassportError('PASSPORT_STORE_UNAVAILABLE', 'The Agent Passport Store has been closed.');
  }

  function loadEvents(passportId: string): AgentPassportEvent[] {
    return (selectEventsByPassportId.all(passportId) as EventRow[]).map(rowToEvent);
  }

  function requireExistingEvents(passportId: string): AgentPassportEvent[] {
    const events = loadEvents(passportId);
    if (events.length === 0) {
      throw new AgentPassportError('PASSPORT_NOT_FOUND', `No Agent Passport for passportId '${passportId}'.`);
    }
    return events;
  }

  return {
    providerKind: 'sqlite',

    async appendEvent(context: PassportAccessContext, input: AppendPassportEventInput): Promise<AppendPassportEventResult> {
      assertOpen();
      requireAccessToOrganization(context, input.organizationId);

      const runAppend = db.transaction(() => {
        const existing = loadEvents(input.passportId);

        let currentStatus: AgentPassportStatus | undefined;
        if (existing.length > 0) {
          const currentPassport = reconstructAgentPassportFromEvents(input.passportId, existing);
          currentStatus = currentPassport.status;
          if (currentPassport.organization.organizationId !== input.organizationId) {
            throw new AgentPassportError('PASSPORT_ACCESS_SCOPE_VIOLATION', `Event organizationId '${input.organizationId}' does not match Passport '${input.passportId}' organization '${currentPassport.organization.organizationId}'.`);
          }
        }

        const nextStatus = applyLifecycleTransition(currentStatus, input.eventType);

        let created: { readonly agentId: string; readonly agentType: string; readonly passportVersion: string } | undefined;
        if (input.eventType === 'AgentPassportCreated') {
          created = parseCreatedEventPayload(input.payload);
          const activeRow = selectProjectionByOrgAgentActive.get(input.organizationId, created.agentId) as PassportProjectionRow | undefined;
          if (activeRow !== undefined && activeRow.passport_id !== input.passportId) {
            throw new AgentPassportError('PASSPORT_ALREADY_EXISTS', `An active (non-terminal) Passport already exists for agentId '${created.agentId}' in organization '${input.organizationId}'. Issue a new Passport only after the prior one reaches a terminal status.`);
          }
          if (input.idempotency !== undefined) {
            const claim = selectIdempotencyClaim.get(input.idempotency.scope, input.idempotency.idempotencyKey);
            if (claim !== undefined) {
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

        if (input.eventType === 'AgentPassportCreated' && created !== undefined) {
          try {
            insertPassportProjection.run({
              passportId: input.passportId,
              organizationId: input.organizationId,
              agentId: created.agentId,
              agentType: created.agentType,
              passportVersion: created.passportVersion,
              createdAt: event.occurredAt,
              createdBy: event.actorId,
              latestSequence: event.sequence,
              latestEventDigest: event.eventDigest,
              currentStatus: nextStatus,
              schemaVersion: AGENT_PASSPORT_SCHEMA_VERSION,
            });
          } catch (error) {
            if (sqliteErrorCode(error)?.startsWith('SQLITE_CONSTRAINT') === true) {
              throw new AgentPassportError('PASSPORT_ALREADY_EXISTS', `An active (non-terminal) Passport already exists for agentId '${created.agentId}' in organization '${input.organizationId}'.`);
            }
            throw error;
          }
          if (input.idempotency !== undefined) {
            insertIdempotency.run({
              scope: input.idempotency.scope,
              idempotencyKey: input.idempotency.idempotencyKey,
              subjectDigest: computeDigest(input.payload.subject),
              passportId: input.passportId,
              createdAt: event.persistedAt,
            });
          }
        } else {
          updatePassportProjection.run({
            passportId: input.passportId,
            latestSequence: event.sequence,
            latestEventDigest: event.eventDigest,
            currentStatus: nextStatus,
          });
        }

        insertEvent.run({
          eventId: event.eventId,
          passportId: event.passportId,
          organizationId: event.organizationId,
          sequence: event.sequence,
          eventType: event.eventType,
          payloadJson: JSON.stringify(event.payload),
          previousEventDigest: event.previousEventDigest ?? null,
          eventDigest: event.eventDigest,
          actorId: event.actorId,
          actorType: event.actorType,
          occurredAt: event.occurredAt,
          persistedAt: event.persistedAt,
          enterpriseVersion: event.enterpriseVersion,
          passportRuntimeVersion: event.passportRuntimeVersion,
        });

        return event;
      });

      const event = runAppend();
      const passport = reconstructAgentPassportFromEvents(input.passportId, loadEvents(input.passportId));
      return { event, passport };
    },

    async resolveIdempotency(_context: PassportAccessContext, probe: PassportIdempotencyProbe): Promise<PassportIdempotencyResolution> {
      assertOpen();
      const claim = selectIdempotencyClaim.get(probe.idempotency.scope, probe.idempotency.idempotencyKey) as { subject_digest: string; passport_id: string } | undefined;
      if (claim === undefined) return { kind: 'new' };
      if (claim.subject_digest !== probe.subjectDigest) return { kind: 'conflict' };
      return { kind: 'replay', passportId: claim.passport_id };
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
      return events;
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
      const row = selectProjectionByOrgAgentActive.get(organizationId, agentId) as PassportProjectionRow | undefined;
      if (row === undefined) return null;
      const events = loadEvents(row.passport_id);
      if (events.length === 0) return null;
      return reconstructAgentPassportFromEvents(row.passport_id, events);
    },

    async health(): Promise<AgentPassportStoreHealth> {
      let readable = false;
      let writable = false;
      let migrationState = 'unknown';
      try {
        const row = db.prepare(`SELECT schema_version, migration_state FROM agent_passport_store_versions ORDER BY id DESC LIMIT 1`).get() as { schema_version: string; migration_state: string } | undefined;
        readable = true;
        migrationState = row?.migration_state ?? 'unknown';
        writable = !closed;
      } catch {
        readable = false;
      }
      return {
        status: closed || !readable || !writable ? 'unhealthy' : 'healthy',
        readable,
        writable,
        schemaVersion: AGENT_PASSPORT_SCHEMA_VERSION,
        migrationState,
        checkedAt: now(),
      };
    },

    async close(): Promise<void> {
      if (!closed) {
        closed = true;
        db.close();
      }
    },
  };
}
