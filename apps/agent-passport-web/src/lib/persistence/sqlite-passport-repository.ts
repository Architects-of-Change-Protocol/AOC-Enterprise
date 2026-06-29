import type Database from 'better-sqlite3';
import type { IssuedAgentPassportBundle } from '@aoc-enterprise/agent-governance';
import { getDb } from '../db.js';
import type { PassportRepository, RevokePassportInput, UpdatePassportStatusInput } from './passport-repository.js';
import { SqliteAuditEventRepository } from './sqlite-audit-event-repository.js';

function withStatus(bundle: IssuedAgentPassportBundle, status: string): IssuedAgentPassportBundle {
  return { ...bundle, passport: { ...bundle.passport, status: status as IssuedAgentPassportBundle['passport']['status'] } };
}

export class SqlitePassportRepository implements PassportRepository {
  private readonly audit: SqliteAuditEventRepository;
  constructor(private readonly db: Database.Database = getDb()) { this.audit = new SqliteAuditEventRepository(db); }

  async saveBundle(bundle: IssuedAgentPassportBundle): Promise<void> {
    const p = bundle.passport;
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT created_at FROM agent_passports WHERE passport_id = ?').get(p.passportId) as { created_at: string } | undefined;
    this.db.prepare(`INSERT OR REPLACE INTO agent_passports
      (passport_id, agent_name, owner_id, owner_name, purpose, jurisdiction, status, governance_level, autonomy_level, risk_tier,
       issuer, issuer_key_id, passport_hash, constitution_hash, policy_manifest_hash, passport_json, constitution_json,
       policy_manifest_json, runtime_seal_json, bundle_json, issued_at, expires_at, created_at, updated_at, revoked_at, revocation_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT revoked_at FROM agent_passports WHERE passport_id = ?), NULL),
        COALESCE((SELECT revocation_reason FROM agent_passports WHERE passport_id = ?), NULL))`).run(
        p.passportId, p.agentName, p.ownerId, p.ownerName, p.purpose, p.jurisdiction, p.status, p.governanceLevel,
        p.autonomyLevel, p.riskTier, p.issuer, p.signature.keyId, p.passportHash, p.constitutionHash, p.policyManifestHash,
        JSON.stringify(p), JSON.stringify(bundle.constitution), JSON.stringify(bundle.policyManifest), JSON.stringify(bundle.runtimeSeal),
        JSON.stringify(bundle), p.issuedAt, p.expiresAt ?? null, existing?.created_at ?? now, now, p.passportId, p.passportId,
      );
    if (!existing) {
      await this.audit.recordPassportStatusEvent({ passportId: p.passportId, eventType: 'issued', newStatus: p.status, actorId: p.ownerId, occurredAt: p.issuedAt });
    }
  }

  async getBundle(passportId: string): Promise<IssuedAgentPassportBundle | undefined> {
    const row = this.db.prepare('SELECT bundle_json, status FROM agent_passports WHERE passport_id = ?').get(passportId) as { bundle_json: string; status: string } | undefined;
    if (!row) return undefined;
    return withStatus(JSON.parse(row.bundle_json) as IssuedAgentPassportBundle, row.status);
  }

  async listPassportIds(): Promise<string[]> {
    return (this.db.prepare('SELECT passport_id FROM agent_passports ORDER BY created_at ASC').all() as { passport_id: string }[]).map((r) => r.passport_id);
  }

  async listBundles(): Promise<IssuedAgentPassportBundle[]> {
    const ids = await this.listPassportIds();
    const out: IssuedAgentPassportBundle[] = [];
    for (const passportId of ids) {
      const bundle = await this.getBundle(passportId);
      if (bundle) out.push(bundle);
    }
    return out;
  }

  async updateStatus(input: UpdatePassportStatusInput): Promise<void> {
    const current = this.db.prepare('SELECT status, bundle_json FROM agent_passports WHERE passport_id = ?').get(input.passportId) as { status: string; bundle_json: string } | undefined;
    if (!current) return;
    const at = input.occurredAt ?? new Date().toISOString();
    const bundle = withStatus(JSON.parse(current.bundle_json) as IssuedAgentPassportBundle, input.status);
    this.db.prepare(`UPDATE agent_passports SET status = ?, passport_json = ?, bundle_json = ?, updated_at = ? WHERE passport_id = ?`)
      .run(input.status, JSON.stringify(bundle.passport), JSON.stringify(bundle), at, input.passportId);
    await this.audit.recordPassportStatusEvent({ passportId: input.passportId, eventType: current.status === input.status ? 'status_changed' : input.status, previousStatus: current.status, newStatus: input.status, reason: input.reason, actorId: input.actorId, occurredAt: at });
  }

  async revokePassport(input: RevokePassportInput): Promise<void> {
    const current = this.db.prepare('SELECT status, bundle_json FROM agent_passports WHERE passport_id = ?').get(input.passportId) as { status: string; bundle_json: string } | undefined;
    if (!current) return;
    const at = input.occurredAt ?? new Date().toISOString();
    const bundle = withStatus(JSON.parse(current.bundle_json) as IssuedAgentPassportBundle, 'revoked');
    this.db.prepare(`UPDATE agent_passports SET status = 'revoked', revoked_at = ?, revocation_reason = ?, passport_json = ?, bundle_json = ?, updated_at = ? WHERE passport_id = ?`)
      .run(at, input.reason, JSON.stringify(bundle.passport), JSON.stringify(bundle), at, input.passportId);
    await this.audit.recordPassportStatusEvent({ passportId: input.passportId, eventType: 'revoked', previousStatus: current.status, newStatus: 'revoked', reason: input.reason, actorId: input.actorId, occurredAt: at });
  }
}
