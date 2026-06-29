/**
 * Server-side Agent Passport store facade.
 *
 * Existing call sites use these small wrapper functions; internally they now
 * persist and reload complete passport bundles from SQLite instead of relying
 * on process-local memory.
 */

import type { IssuedAgentPassportBundle } from '@aoc-enterprise/agent-governance';
import { getDb } from './db.js';
import { SqlitePassportRepository } from './persistence/sqlite-passport-repository.js';

export function storePassportBundle(bundle: IssuedAgentPassportBundle): void {
  void new SqlitePassportRepository(getDb()).saveBundle(bundle);
}

function withPersistedStatus(bundle: IssuedAgentPassportBundle, status: string): IssuedAgentPassportBundle {
  return { ...bundle, passport: { ...bundle.passport, status: status as IssuedAgentPassportBundle['passport']['status'] } };
}

export function getPassportBundle(passportId: string): IssuedAgentPassportBundle | undefined {
  const row = getDb().prepare('SELECT bundle_json, status FROM agent_passports WHERE passport_id = ?').get(passportId) as { bundle_json: string; status: string } | undefined;
  return row ? withPersistedStatus(JSON.parse(row.bundle_json) as IssuedAgentPassportBundle, row.status) : undefined;
}

export function getAllPassportIds(): string[] {
  return (getDb().prepare('SELECT passport_id FROM agent_passports ORDER BY created_at ASC').all() as { passport_id: string }[]).map((r) => r.passport_id);
}

export function getPassportRepository(): SqlitePassportRepository {
  return new SqlitePassportRepository(getDb());
}
