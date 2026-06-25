import { createHash, randomBytes } from 'crypto';
import type Database from 'better-sqlite3';
import {
  createRegistryAdminSession as dbCreateSession,
  getRegistryAdminSession as dbGetSession,
  revokeRegistryAdminSessions as dbRevokeSessions,
} from './organization-registry-repository.js';

export const ADMIN_SESSION_COOKIE = 'aoc_registry_admin_session';
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function nanoid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AdminSessionResult {
  sessionToken: string;
  sessionId: string;
  expiresAt: string;
}

export function createAdminSession(
  registryId: string,
  db?: Database.Database,
): AdminSessionResult {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const sessionId = nanoid('sess');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  dbCreateSession(registryId, sessionId, tokenHash, expiresAt, db);

  return { sessionToken: rawToken, sessionId, expiresAt };
}

export function verifyAdminSession(
  sessionToken: string,
  registryId: string,
  db?: Database.Database,
): boolean {
  const tokenHash = hashSessionToken(sessionToken);
  const session = dbGetSession(tokenHash, db);
  if (!session) return false;
  if (session.registry_id !== registryId) return false;
  if (session.revoked_at) return false;
  if (new Date(session.expires_at) <= new Date()) return false;
  return true;
}

export function revokeAdminSessions(
  registryId: string,
  db?: Database.Database,
): void {
  dbRevokeSessions(registryId, db);
}
