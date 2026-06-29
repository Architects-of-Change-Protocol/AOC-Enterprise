import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { AgentRuntimeGuardEvent } from '@aoc-enterprise/agent-governance';
import { getDb } from '../db.js';
import type { AuditEventRepository, PassportStatusEventInput, PassportVerificationEventInput } from './audit-event-repository.js';

const json = (v: unknown) => JSON.stringify(v ?? null);
const parse = <T>(s: string | null | undefined, fallback: T): T => s ? JSON.parse(s) as T : fallback;
const id = (prefix: string) => `${prefix}-${randomUUID()}`;

export class SqliteAuditEventRepository implements AuditEventRepository {
  constructor(private readonly db: Database.Database = getDb()) {}

  async recordPassportStatusEvent(input: PassportStatusEventInput): Promise<void> {
    this.db.prepare(`INSERT INTO passport_status_events
      (event_id, passport_id, event_type, previous_status, new_status, reason, actor_id, occurred_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        input.eventId ?? id('PSEVT'), input.passportId, input.eventType, input.previousStatus ?? null,
        input.newStatus ?? null, input.reason ?? null, input.actorId ?? null, input.occurredAt ?? new Date().toISOString(),
        input.payload ? json(input.payload) : null,
      );
  }

  async recordPassportVerificationEvent(input: PassportVerificationEventInput): Promise<void> {
    this.db.prepare(`INSERT INTO passport_verification_events
      (event_id, passport_id, verification_result, reason_codes_json, actor_id, request_context_json, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        input.eventId ?? id('PVEVT'), input.passportId, input.verificationResult, json(input.reasonCodes),
        input.actorId ?? null, input.requestContext ? json(input.requestContext) : null, input.occurredAt ?? new Date().toISOString(),
      );
  }

  async recordRuntimeGuardEvent(event: AgentRuntimeGuardEvent): Promise<void> {
    this.db.prepare(`INSERT OR REPLACE INTO runtime_guard_audit_events
      (event_id, passport_id, request_id, decision_id, event_type, actor_id, outcome, reason_codes_json, payload_json, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        event.eventId, event.passportId, event.requestId, event.decisionId ?? null, event.type, event.actorId,
        typeof event.metadata?.['outcome'] === 'string' ? event.metadata['outcome'] : null,
        json(event.reasonCodes), json(event), event.occurredAt,
      );
  }

  async listRuntimeGuardEventsForPassport(passportId: string): Promise<AgentRuntimeGuardEvent[]> {
    const rows = this.db.prepare(`SELECT payload_json FROM runtime_guard_audit_events WHERE passport_id = ? ORDER BY occurred_at ASC`).all(passportId) as { payload_json: string }[];
    return rows.map((r) => JSON.parse(r.payload_json) as AgentRuntimeGuardEvent);
  }

  async listPassportStatusEvents(passportId: string): Promise<PassportStatusEventInput[]> {
    const rows = this.db.prepare(`SELECT * FROM passport_status_events WHERE passport_id = ? ORDER BY occurred_at ASC`).all(passportId) as Array<Record<string, string | null>>;
    return rows.map((r) => ({
      eventId: r.event_id!, passportId: r.passport_id!, eventType: r.event_type!, previousStatus: r.previous_status ?? undefined,
      newStatus: r.new_status ?? undefined, reason: r.reason ?? undefined, actorId: r.actor_id ?? undefined,
      occurredAt: r.occurred_at!, payload: parse(r.payload_json, undefined as unknown as Record<string, unknown> | undefined),
    }));
  }
}
