import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../db.js';
import type { IssuerKeyRepository, IssuerPublicKeyRecord, RegisterIssuerKeyInput, RetireIssuerKeyInput, RevokeIssuerKeyInput, IssuerKeyStatus } from './issuer-key-repository.js';

function map(row: Record<string, string | null>): IssuerPublicKeyRecord {
  return {
    issuerId: row.issuer_id!, keyId: row.key_id!, algorithm: row.algorithm!, publicKeyPem: row.public_key_pem!,
    status: row.status! as IssuerKeyStatus, createdAt: row.created_at!, activatedAt: row.activated_at ?? undefined,
    retiredAt: row.retired_at ?? undefined, revokedAt: row.revoked_at ?? undefined,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : undefined,
  };
}

export class SqliteIssuerKeyRepository implements IssuerKeyRepository {
  constructor(private readonly db: Database.Database = getDb()) {}

  async registerKey(input: RegisterIssuerKeyInput): Promise<void> {
    const now = input.createdAt ?? new Date().toISOString();
    this.db.prepare(`INSERT OR IGNORE INTO issuer_keys
      (issuer_id, key_id, algorithm, public_key_pem, status, created_at, activated_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        input.issuerId, input.keyId, input.algorithm, input.publicKeyPem, input.status ?? 'active', now,
        input.activatedAt ?? now, input.metadata ? JSON.stringify(input.metadata) : null,
      );
    this.db.prepare(`INSERT OR IGNORE INTO issuer_key_events
      (event_id, issuer_id, key_id, event_type, occurred_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(`IKEYEVT-${randomUUID()}`, input.issuerId, input.keyId, 'key_registered', now, JSON.stringify({ status: input.status ?? 'active' }));
  }

  async getActiveKey(issuerId: string): Promise<IssuerPublicKeyRecord | undefined> {
    const row = this.db.prepare(`SELECT * FROM issuer_keys WHERE issuer_id = ? AND status = 'active' ORDER BY activated_at DESC, created_at DESC LIMIT 1`).get(issuerId) as Record<string, string | null> | undefined;
    return row ? map(row) : undefined;
  }
  async getKey(issuerId: string, keyId: string): Promise<IssuerPublicKeyRecord | undefined> {
    const row = this.db.prepare(`SELECT * FROM issuer_keys WHERE issuer_id = ? AND key_id = ?`).get(issuerId, keyId) as Record<string, string | null> | undefined;
    return row ? map(row) : undefined;
  }
  async listKeys(issuerId: string): Promise<IssuerPublicKeyRecord[]> {
    return (this.db.prepare(`SELECT * FROM issuer_keys WHERE issuer_id = ? ORDER BY created_at ASC`).all(issuerId) as Record<string, string | null>[]).map(map);
  }
  async retireKey(input: RetireIssuerKeyInput): Promise<void> { await this.setStatus(input.issuerId, input.keyId, 'retired', 'retired_at', input.occurredAt, input.reason, input.actorId); }
  async revokeKey(input: RevokeIssuerKeyInput): Promise<void> { await this.setStatus(input.issuerId, input.keyId, 'revoked', 'revoked_at', input.occurredAt, input.reason, input.actorId); }
  private async setStatus(issuerId: string, keyId: string, status: IssuerKeyStatus, column: string, at?: string, reason?: string, actorId?: string): Promise<void> {
    const when = at ?? new Date().toISOString();
    this.db.prepare(`UPDATE issuer_keys SET status = ?, ${column} = ? WHERE issuer_id = ? AND key_id = ?`).run(status, when, issuerId, keyId);
    this.db.prepare(`INSERT INTO issuer_key_events (event_id, issuer_id, key_id, event_type, reason, actor_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(`IKEYEVT-${randomUUID()}`, issuerId, keyId, `key_${status}`, reason ?? null, actorId ?? null, when);
  }
}
