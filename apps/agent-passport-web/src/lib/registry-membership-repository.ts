import { randomBytes } from 'crypto';
import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import type { RegistryAccountMembershipRecord, RegistryRole, RegistryMembershipStatus } from './buyer-account-types.js';

function nanoid(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

export interface CreateRegistryMembershipInput {
  registryId: string;
  accountId: string;
  role: RegistryRole;
  status?: RegistryMembershipStatus;
  invitedByAccountId?: string | null;
  acceptedAt?: string | null;
}

export function createRegistryMembership(
  input: CreateRegistryMembershipInput,
  db?: Database.Database,
): RegistryAccountMembershipRecord {
  const d = db ?? getDb();
  const now = new Date().toISOString();
  const record: RegistryAccountMembershipRecord = {
    id: nanoid('ram'),
    registry_id: input.registryId,
    account_id: input.accountId,
    role: input.role,
    status: input.status ?? 'active',
    invited_by_account_id: input.invitedByAccountId ?? null,
    accepted_at: input.acceptedAt ?? null,
    created_at: now,
    updated_at: now,
  };
  d.prepare(`
    INSERT INTO registry_account_memberships
      (id, registry_id, account_id, role, status, invited_by_account_id, accepted_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id, record.registry_id, record.account_id, record.role,
    record.status, record.invited_by_account_id, record.accepted_at,
    record.created_at, record.updated_at,
  );
  return record;
}

export function getRegistryMembership(
  registryId: string,
  accountId: string,
  db?: Database.Database,
): RegistryAccountMembershipRecord | null {
  const d = db ?? getDb();
  const row = d.prepare(
    'SELECT * FROM registry_account_memberships WHERE registry_id = ? AND account_id = ?'
  ).get(registryId, accountId) as RegistryAccountMembershipRecord | undefined;
  return row ?? null;
}

export function listRegistryMembershipsByRegistryId(
  registryId: string,
  db?: Database.Database,
): RegistryAccountMembershipRecord[] {
  const d = db ?? getDb();
  return d.prepare(
    "SELECT * FROM registry_account_memberships WHERE registry_id = ? ORDER BY created_at ASC"
  ).all(registryId) as RegistryAccountMembershipRecord[];
}

export function listRegistryMembershipsByAccountId(
  accountId: string,
  db?: Database.Database,
): RegistryAccountMembershipRecord[] {
  const d = db ?? getDb();
  return d.prepare(
    "SELECT * FROM registry_account_memberships WHERE account_id = ? AND status = 'active' ORDER BY created_at ASC"
  ).all(accountId) as RegistryAccountMembershipRecord[];
}

export function updateRegistryMembershipRole(
  input: { registryId: string; accountId: string; role: RegistryRole },
  db?: Database.Database,
): void {
  const d = db ?? getDb();
  const now = new Date().toISOString();
  d.prepare(
    'UPDATE registry_account_memberships SET role = ?, updated_at = ? WHERE registry_id = ? AND account_id = ?'
  ).run(input.role, now, input.registryId, input.accountId);
}

export function removeRegistryMembership(
  input: { registryId: string; accountId: string },
  db?: Database.Database,
): void {
  const d = db ?? getDb();
  const now = new Date().toISOString();
  d.prepare(
    "UPDATE registry_account_memberships SET status = 'removed', updated_at = ? WHERE registry_id = ? AND account_id = ?"
  ).run(now, input.registryId, input.accountId);
}

export function hasActiveRegistryMembership(
  registryId: string,
  accountId: string,
  db?: Database.Database,
): boolean {
  const d = db ?? getDb();
  const row = d.prepare(
    "SELECT id FROM registry_account_memberships WHERE registry_id = ? AND account_id = ? AND status = 'active'"
  ).get(registryId, accountId);
  return !!row;
}
