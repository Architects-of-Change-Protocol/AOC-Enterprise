import type { AgentRuntimeGuardEvent, RuntimeGuardEventSink } from '@aoc-enterprise/agent-governance';
import { SqliteAuditEventRepository } from '../persistence/sqlite-audit-event-repository.js';

export class PersistentRuntimeGuardEventSink implements RuntimeGuardEventSink {
  constructor(private readonly repository = new SqliteAuditEventRepository()) {}
  async emit(event: AgentRuntimeGuardEvent): Promise<void> {
    await this.repository.recordRuntimeGuardEvent(event);
  }
}
