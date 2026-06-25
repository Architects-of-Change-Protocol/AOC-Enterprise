import { createHash, randomBytes } from 'crypto';
import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import { getBuyerAccountByAccountId, toPublicBuyerAccount } from './buyer-account-repository.js';
import type { BuyerAccountPublic, BuyerAccountSessionRecord } from './buyer-account-types.js';

export const BUYER_ACCOUNT_SESSION_COOKIE = 'aoc_buyer_account_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function nanoid(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface BuyerAccountSessionResult {
  sessionToken: string;
  sessionId: string;
  expiresAt: string;
}

export function createBuyerAccountSession(accountId: string, db?: Database.Database): BuyerAccountSessionResult {
  const d = db ?? getDb();
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const sessionId = nanoid('bas');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  d.prepare(`
    INSERT INTO buyer_account_sessions (id, session_id, session_token_hash, account_id, created_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `).run(nanoid('bas_id'), sessionId, tokenHash, accountId, now, expiresAt);
  return { sessionToken: rawToken, sessionId, expiresAt };
}

export function verifyBuyerAccountSession(sessionToken: string, db?: Database.Database): BuyerAccountSessionRecord | null {
  const d = db ?? getDb();
  const tokenHash = hashToken(sessionToken);
  const row = d.prepare('SELECT * FROM buyer_account_sessions WHERE session_token_hash = ?').get(tokenHash) as BuyerAccountSessionRecord | undefined;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at) <= new Date()) return null;
  return row;
}

export function getBuyerAccountFromSessionToken(sessionToken: string, db?: Database.Database): BuyerAccountPublic | null {
  const session = verifyBuyerAccountSession(sessionToken, db);
  if (!session) return null;
  const account = getBuyerAccountByAccountId(session.account_id, db);
  if (!account || account.status !== 'active') return null;
  return toPublicBuyerAccount(account);
}

export function revokeBuyerAccountSession(sessionToken: string, db?: Database.Database): void {
  const d = db ?? getDb();
  const tokenHash = hashToken(sessionToken);
  const now = new Date().toISOString();
  d.prepare('UPDATE buyer_account_sessions SET revoked_at = ? WHERE session_token_hash = ?').run(now, tokenHash);
}

export function revokeAllBuyerAccountSessions(accountId: string, db?: Database.Database): void {
  const d = db ?? getDb();
  const now = new Date().toISOString();
  d.prepare('UPDATE buyer_account_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL').run(now, accountId);
}

export function getBuyerAccountSessionCookieOptions(expiresAt?: string): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = expiresAt
    ? Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
    : Math.floor(SESSION_DURATION_MS / 1000);
  return [
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
    isProduction ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}
