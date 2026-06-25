import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import type { RegistryTeamInvitationRecord, RegistryRole } from './buyer-account-types.js';

function nanoid(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const INVITATION_EXPIRY_DAYS = 14;

export interface CreateRegistryTeamInvitationInput {
  registryId: string;
  invitedEmail: string;
  role: RegistryRole;
  invitedByAccountId?: string | null;
}

export interface CreateInvitationResult {
  record: RegistryTeamInvitationRecord;
  rawToken: string;
}

export function createRegistryTeamInvitation(
  input: CreateRegistryTeamInvitationInput,
  db?: Database.Database,
): CreateInvitationResult {
  const d = db ?? getDb();
  const now = new Date().toISOString();
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const record: RegistryTeamInvitationRecord = {
    id: nanoid('rti'),
    invitation_id: nanoid('inv'),
    registry_id: input.registryId,
    invited_email: input.invitedEmail,
    role: input.role,
    invitation_token_hash: tokenHash,
    invited_by_account_id: input.invitedByAccountId ?? null,
    status: 'pending',
    created_at: now,
    expires_at: expiresAt,
    accepted_at: null,
    revoked_at: null,
  };
  d.prepare(`
    INSERT INTO registry_team_invitations
      (id, invitation_id, registry_id, invited_email, role, invitation_token_hash,
       invited_by_account_id, status, created_at, expires_at, accepted_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
  `).run(
    record.id, record.invitation_id, record.registry_id, record.invited_email,
    record.role, record.invitation_token_hash, record.invited_by_account_id,
    record.status, record.created_at, record.expires_at,
  );
  return { record, rawToken };
}

export function getRegistryTeamInvitationByInvitationId(
  invitationId: string,
  db?: Database.Database,
): RegistryTeamInvitationRecord | null {
  const d = db ?? getDb();
  const row = d.prepare('SELECT * FROM registry_team_invitations WHERE invitation_id = ?')
    .get(invitationId) as RegistryTeamInvitationRecord | undefined;
  return row ?? null;
}

export function getRegistryTeamInvitationByToken(
  token: string,
  db?: Database.Database,
): RegistryTeamInvitationRecord | null {
  const d = db ?? getDb();
  const tokenHash = hashToken(token);
  // Fetch by matching hash
  const rows = d.prepare(
    "SELECT * FROM registry_team_invitations WHERE status = 'pending'"
  ).all() as RegistryTeamInvitationRecord[];
  for (const row of rows) {
    const stored = Buffer.from(row.invitation_token_hash, 'hex');
    const candidate = Buffer.from(tokenHash, 'hex');
    if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) {
      return row;
    }
  }
  return null;
}

export function listRegistryTeamInvitationsByRegistryId(
  registryId: string,
  db?: Database.Database,
): RegistryTeamInvitationRecord[] {
  const d = db ?? getDb();
  return d.prepare(
    'SELECT * FROM registry_team_invitations WHERE registry_id = ? ORDER BY created_at DESC'
  ).all(registryId) as RegistryTeamInvitationRecord[];
}

export function acceptRegistryTeamInvitation(
  input: { invitationId: string },
  db?: Database.Database,
): void {
  const d = db ?? getDb();
  const now = new Date().toISOString();
  d.prepare(
    "UPDATE registry_team_invitations SET status = 'accepted', accepted_at = ? WHERE invitation_id = ?"
  ).run(now, input.invitationId);
}

export function revokeRegistryTeamInvitation(
  input: { invitationId: string },
  db?: Database.Database,
): void {
  const d = db ?? getDb();
  const now = new Date().toISOString();
  d.prepare(
    "UPDATE registry_team_invitations SET status = 'revoked', revoked_at = ? WHERE invitation_id = ?"
  ).run(now, input.invitationId);
}

export function markExpiredRegistryTeamInvitations(db?: Database.Database): void {
  const d = db ?? getDb();
  const now = new Date().toISOString();
  d.prepare(
    "UPDATE registry_team_invitations SET status = 'expired' WHERE status = 'pending' AND expires_at < ?"
  ).run(now);
}
