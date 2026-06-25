/**
 * SQLite database initialization for agent-passport-web.
 *
 * Opens the database at AGENT_PASSPORT_DB_PATH (default: .data/agent-passport.sqlite).
 * Creates the .data directory if it doesn't exist.
 * Initializes the schema on first run.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

const DEFAULT_DB_PATH = '.data/agent-passport.sqlite';

function resolveDbPath(): string {
  const dbPath = process.env.AGENT_PASSPORT_DB_PATH ?? DEFAULT_DB_PATH;
  // Allow :memory: for tests
  if (dbPath === ':memory:') return ':memory:';
  const absPath = resolve(dbPath);
  const dir = dirname(absPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return absPath;
}

function openDb(dbPath?: string): Database.Database {
  const path = dbPath ?? resolveDbPath();
  const db = new Database(path);

  // Performance & integrity pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initSchema(db);

  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchases (
      id                    TEXT PRIMARY KEY,
      tier                  TEXT NOT NULL,
      status                TEXT NOT NULL DEFAULT 'pending',
      buyer_email           TEXT,
      stripe_session_id     TEXT UNIQUE,
      stripe_payment_intent TEXT,
      passport_id           TEXT,
      enrollment_status     TEXT NOT NULL DEFAULT 'not_started',
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL,
      completed_at          TEXT,
      expired_at            TEXT,
      failed_at             TEXT,
      failure_reason        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_purchases_stripe_session
      ON purchases(stripe_session_id);

    CREATE INDEX IF NOT EXISTS idx_purchases_passport_id
      ON purchases(passport_id);

    CREATE TABLE IF NOT EXISTS passports (
      id                  TEXT PRIMARY KEY,
      purchase_id         TEXT,
      registry_id         TEXT,
      passport_data       TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'active',
      issued_at           TEXT NOT NULL,
      updated_at          TEXT NOT NULL,
      revoked_at          TEXT,
      revoke_reason       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_passports_purchase_id
      ON passports(purchase_id);

    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      id                  TEXT PRIMARY KEY,
      stripe_event_id     TEXT NOT NULL UNIQUE,
      event_type          TEXT NOT NULL,
      raw_payload         TEXT NOT NULL,
      processed           INTEGER NOT NULL DEFAULT 0,
      processed_at        TEXT,
      failed              INTEGER NOT NULL DEFAULT 0,
      failure_reason      TEXT,
      created_at          TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_stripe_event_id
      ON stripe_webhook_events(stripe_event_id);

    CREATE TABLE IF NOT EXISTS organization_registries (
      id                          TEXT PRIMARY KEY,
      registry_id                 TEXT NOT NULL UNIQUE,
      purchase_id                 TEXT NOT NULL,
      tier                        TEXT NOT NULL,
      organization_name           TEXT NOT NULL,
      buyer_email                 TEXT,
      owner_name                  TEXT,
      owner_role                  TEXT,
      registry_status             TEXT NOT NULL,
      governance_level            TEXT NOT NULL,
      max_passports               INTEGER NOT NULL,
      issued_passports            INTEGER NOT NULL,
      remaining_passports         INTEGER NOT NULL,
      stripe_customer_id          TEXT,
      stripe_subscription_id      TEXT,
      admin_access_token_hash     TEXT,
      admin_access_token_created_at TEXT,
      created_at                  TEXT NOT NULL,
      updated_at                  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS organization_registries_purchase_idx
      ON organization_registries(purchase_id);
    CREATE INDEX IF NOT EXISTS organization_registries_buyer_email_idx
      ON organization_registries(buyer_email);

    CREATE TABLE IF NOT EXISTS organization_registry_entitlements (
      id                TEXT PRIMARY KEY,
      registry_id       TEXT NOT NULL,
      purchase_id       TEXT NOT NULL,
      entitlement_type  TEXT NOT NULL,
      max_quantity      INTEGER NOT NULL,
      used_quantity     INTEGER NOT NULL,
      remaining_quantity INTEGER NOT NULL,
      status            TEXT NOT NULL,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS organization_registry_entitlements_registry_idx
      ON organization_registry_entitlements(registry_id);

    CREATE TABLE IF NOT EXISTS organization_registry_passports (
      id                  TEXT PRIMARY KEY,
      registry_id         TEXT NOT NULL,
      passport_id         TEXT NOT NULL,
      purchase_id         TEXT,
      agent_name          TEXT NOT NULL,
      agent_owner         TEXT,
      status              TEXT NOT NULL,
      governance_status   TEXT,
      runtime_guard_ready INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL,
      UNIQUE(registry_id, passport_id)
    );

    CREATE INDEX IF NOT EXISTS organization_registry_passports_registry_idx
      ON organization_registry_passports(registry_id);
    CREATE INDEX IF NOT EXISTS organization_registry_passports_passport_idx
      ON organization_registry_passports(passport_id);
  `);
}

// Singleton
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = openDb();
  }
  return _db;
}

/** For tests: create an isolated in-memory DB (does not affect singleton). */
export function createTestDb(): Database.Database {
  return openDb(':memory:');
}

/** For tests: reset the singleton (call after closing the test DB). */
export function _resetDbSingleton(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
