import { randomBytes } from 'crypto';
import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import type { BuyerAccountRecord, BuyerAccountPublic } from './buyer-account-types.js';

function nanoid(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

export interface CreateBuyerAccountInput {
  email: string;
  displayName: string | null;
  passwordHash: string;
}

export function createBuyerAccount(
  input: CreateBuyerAccountInput,
  db?: Database.Database,
): BuyerAccountRecord {
  const d = db ?? getDb();
  const now = new Date().toISOString();
  const id = nanoid('ba');
  const accountId = nanoid('acct');
  const record: BuyerAccountRecord = {
    id,
    account_id: accountId,
    email: input.email,
    display_name: input.displayName,
    password_hash: input.passwordHash,
    status: 'active',
    created_at: now,
    updated_at: now,
    last_login_at: null,
  };
  d.prepare(`
    INSERT INTO buyer_accounts (id, account_id, email, display_name, password_hash, status, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.account_id,
    record.email,
    record.display_name,
    record.password_hash,
    record.status,
    record.created_at,
    record.updated_at,
    record.last_login_at,
  );
  return record;
}

export function getBuyerAccountByEmail(email: string, db?: Database.Database): BuyerAccountRecord | null {
  const d = db ?? getDb();
  const row = d.prepare('SELECT * FROM buyer_accounts WHERE email = ?').get(email) as BuyerAccountRecord | undefined;
  return row ?? null;
}

export function getBuyerAccountByAccountId(accountId: string, db?: Database.Database): BuyerAccountRecord | null {
  const d = db ?? getDb();
  const row = d.prepare('SELECT * FROM buyer_accounts WHERE account_id = ?').get(accountId) as BuyerAccountRecord | undefined;
  return row ?? null;
}

export function updateBuyerAccountLastLogin(accountId: string, db?: Database.Database): void {
  const d = db ?? getDb();
  const now = new Date().toISOString();
  d.prepare('UPDATE buyer_accounts SET last_login_at = ?, updated_at = ? WHERE account_id = ?')
    .run(now, now, accountId);
}

export function disableBuyerAccount(accountId: string, db?: Database.Database): void {
  const d = db ?? getDb();
  const now = new Date().toISOString();
  d.prepare("UPDATE buyer_accounts SET status = 'disabled', updated_at = ? WHERE account_id = ?")
    .run(now, accountId);
}

export function toPublicBuyerAccount(record: BuyerAccountRecord): BuyerAccountPublic {
  return {
    accountId: record.account_id,
    email: record.email,
    displayName: record.display_name,
    status: record.status,
  };
}
