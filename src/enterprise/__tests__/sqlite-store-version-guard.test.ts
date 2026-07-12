import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSqlitePassportStore } from '../passport/sqlite-passport-store.js';
import { createSqliteAssuranceStore } from '../assurance/sqlite-assurance-store.js';
import { isAgentPassportError } from '../passport/errors.js';
import { isAssuranceError } from '../assurance/errors.js';

// The stores under test are opened twice against the same on-disk file: once
// to seed a foreign schema version row, then again to assert the runtime
// refuses to open it (fail closed, no silent reuse of a mismatched store).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workDir = mkdtempSync(join(tmpdir(), 'aoc-store-version-guard-'));

function tempDbPath(name: string): string {
  return join(workDir, `${name}.sqlite`);
}

async function seedForeignVersion(dbPath: string, table: string): Promise<void> {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL,
    migration_state TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  )`);
  db.prepare(`INSERT INTO ${table} (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`).run('some.future.schema.v9', '2026-01-01T00:00:00.000Z');
  db.close();
}

describe('SQLite store schema version guards', () => {
  it('passport store refuses to open a database recorded under a different schema version', async () => {
    const dbPath = tempDbPath('passport');
    await seedForeignVersion(dbPath, 'agent_passport_store_versions');

    await assert.rejects(
      () => createSqlitePassportStore(dbPath),
      (error: unknown) => isAgentPassportError(error) && error.code === 'PASSPORT_STORE_UNAVAILABLE',
    );
  });

  it('assurance store refuses to open a database recorded under a different schema version', async () => {
    const dbPath = tempDbPath('assurance');
    await seedForeignVersion(dbPath, 'assurance_store_versions');

    await assert.rejects(
      () => createSqliteAssuranceStore(dbPath),
      (error: unknown) => isAssuranceError(error) && error.code === 'ASSURANCE_STORE_UNAVAILABLE',
    );
  });

  it('passport and assurance stores open cleanly against a fresh database and record their schema version', async () => {
    const passportStore = await createSqlitePassportStore(':memory:');
    const passportHealth = await passportStore.health();
    assert.equal(passportHealth.readable, true);
    await passportStore.close();

    const assuranceStore = await createSqliteAssuranceStore(':memory:');
    const assuranceHealth = await assuranceStore.health();
    assert.equal(assuranceHealth.readable, true);
    await assuranceStore.close();
  });
});
