/**
 * Passport repository — SQLite-backed persistence for issued passport records.
 *
 * The full passport bundle (JSON) is stored as a TEXT column so the governance
 * package schema can evolve independently of the DB schema.
 */

import type Database from 'better-sqlite3';
import { getDb } from './db.js';

export type PassportRecordStatus = 'active' | 'revoked' | 'suspended';

export interface PassportRecord {
  id: string;
  purchaseId: string | null;
  registryId: string | null;
  passportData: string; // JSON string
  status: PassportRecordStatus;
  issuedAt: string;
  updatedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

interface PassportRow {
  id: string;
  purchase_id: string | null;
  registry_id: string | null;
  passport_data: string;
  status: string;
  issued_at: string;
  updated_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
}

function rowToRecord(row: PassportRow): PassportRecord {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    registryId: row.registry_id,
    passportData: row.passport_data,
    status: row.status as PassportRecordStatus,
    issuedAt: row.issued_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
  };
}

export function createPassportRecord(
  passportId: string,
  purchaseId: string | null,
  passportData: string,
  db?: Database.Database,
  registryId?: string,
): PassportRecord {
  const database = db ?? getDb();
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO passports (id, purchase_id, registry_id, passport_data, status, issued_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(passportId, purchaseId, registryId ?? null, passportData, now, now);

  return getPassportByPassportId(passportId, database)!;
}

export function getPassportByPassportId(
  passportId: string,
  db?: Database.Database,
): PassportRecord | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT * FROM passports WHERE id = ?`)
    .get(passportId) as PassportRow | undefined;
  return row ? rowToRecord(row) : null;
}

export interface PassportListItem {
  passportId: string;
  purchaseId: string;
  status: PassportRecordStatus;
  issuedAt: string;
}

export function listPassports(db?: Database.Database): PassportListItem[] {
  const database = db ?? getDb();
  const rows = database
    .prepare(`SELECT id, purchase_id, status, issued_at FROM passports ORDER BY issued_at DESC`)
    .all() as Array<{ id: string; purchase_id: string; status: string; issued_at: string }>;

  return rows.map((r) => ({
    passportId: r.id,
    purchaseId: r.purchase_id,
    status: r.status as PassportRecordStatus,
    issuedAt: r.issued_at,
  }));
}

export function updatePassportStatus(
  passportId: string,
  status: PassportRecordStatus,
  reason?: string,
  db?: Database.Database,
): PassportRecord | null {
  const database = db ?? getDb();
  const now = new Date().toISOString();

  if (status === 'revoked') {
    database
      .prepare(
        `UPDATE passports SET status = ?, revoked_at = ?, revoke_reason = ?, updated_at = ? WHERE id = ?`,
      )
      .run(status, now, reason ?? null, now, passportId);
  } else {
    database
      .prepare(`UPDATE passports SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, now, passportId);
  }

  return getPassportByPassportId(passportId, database);
}
