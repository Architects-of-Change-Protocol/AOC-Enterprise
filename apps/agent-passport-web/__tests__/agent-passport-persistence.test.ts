import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { evaluateAgentRuntimeGuard, verifyAgentPassport, verifyAgentRuntimeSeal } from '@aoc-enterprise/agent-governance';
import { enrollAgent, verifyAgentPassportBundle, createSampleAgentPassport } from '../src/lib/passport-adapter.js';
import { _resetDbSingleton, getDb } from '../src/lib/db.js';
import { SqlitePassportRepository } from '../src/lib/persistence/sqlite-passport-repository.js';
import { SqliteIssuerKeyRepository } from '../src/lib/persistence/sqlite-issuer-key-repository.js';
import { SqliteAuditEventRepository } from '../src/lib/persistence/sqlite-audit-event-repository.js';
import { PersistentRuntimeGuardEventSink } from '../src/lib/runtime-guard/persistent-event-sink.js';
import { createIssuerSignerFromEnv, getIssuerSignerConfigFromEnv } from '../src/lib/issuer/issuer-signer.js';

const input = {
  agentName: 'Persistent Test Agent', ownerId: 'owner-persist', ownerName: 'Persistent Owner',
  purpose: 'Test persistence across repository recreation.', jurisdiction: 'US', autonomyLevel: 'low' as const,
  riskTier: 'low' as const, dataAccess: ['public_docs'], tools: ['read_record'], prohibitedActions: ['delete_all'],
  humanApprovalRequiredActions: [], escalationRules: [{ trigger: 'delete_all', action: 'block' }], createdBy: 'persistence-test',
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aoc-passport-'));
  process.env.AOC_AGENT_PASSPORT_DB_PATH = join(dir, 'passport.sqlite');
  process.env.AOC_ALLOW_DEV_SIGNER = 'true';
  delete process.env.AOC_ISSUER_PRIVATE_KEY_PEM;
  delete process.env.AOC_ISSUER_PUBLIC_KEY_PEM;
  delete process.env.AOC_ISSUER_ID;
  delete process.env.AOC_ISSUER_KEY_ID;
  _resetDbSingleton();
});
afterEach(() => { _resetDbSingleton(); rmSync(dir, { recursive: true, force: true }); });

describe('Agent Passport SQLite persistence', () => {
  it('saves, reloads, lists, and verifies a passport after repository recreation', async () => {
    const bundle = await enrollAgent(input);
    const passportId = bundle.passport.passportId;
    assert.ok((await new SqlitePassportRepository(getDb()).listPassportIds()).includes(passportId));

    _resetDbSingleton();
    const repo = new SqlitePassportRepository(getDb());
    const reloaded = await repo.getBundle(passportId);
    assert.ok(reloaded);
    assert.equal(reloaded.passport.passportId, passportId);

    const signer = createIssuerSignerFromEnv();
    assert.equal((await verifyAgentPassport(reloaded.passport, { signer })).valid, true);
    assert.equal((await verifyAgentRuntimeSeal(reloaded.runtimeSeal, reloaded.passport, { signer }, { allowIssued: true })).valid, true);
    assert.equal((await verifyAgentPassportBundle(passportId))?.passportResult.valid, true);
  });

  it('keeps sample passport idempotent with persistent storage', async () => {
    const a = await createSampleAgentPassport();
    _resetDbSingleton();
    const b = await createSampleAgentPassport();
    assert.equal(a.passport.passportId, b.passport.passportId);
  });

  it('persists revocation/status and runtime guard denies revoked passports', async () => {
    const bundle = await enrollAgent(input);
    const passportId = bundle.passport.passportId;
    await new SqlitePassportRepository(getDb()).revokePassport({ passportId, reason: 'test_revocation', actorId: 'tester' });
    _resetDbSingleton();

    const repo = new SqlitePassportRepository(getDb());
    const revoked = await repo.getBundle(passportId);
    assert.ok(revoked);
    assert.equal(revoked.passport.status, 'revoked');

    const decision = await evaluateAgentRuntimeGuard({
      request: { requestId: 'req-revoked', passportId, actorId: 'tester', requestedAction: 'read_record', actionCategory: 'read_data', toolName: 'read_record', dataCategories: ['public_docs'], requestedAt: new Date().toISOString() },
      passport: revoked.passport, runtimeSeal: revoked.runtimeSeal, policyManifest: revoked.policyManifest, options: { allowIssuedPassport: true },
    }, { signer: createIssuerSignerFromEnv() });
    assert.equal(decision.outcome, 'deny');
    assert.ok(decision.reasonCodes.includes('runtime_guard.passport_revoked'));

    const events = await new SqliteAuditEventRepository(getDb()).listPassportStatusEvents?.(passportId);
    assert.ok(events?.some((e) => e.eventType === 'revoked' && e.reason === 'test_revocation'));
  });

  it('persists runtime guard audit events and roundtrips reason codes/payload', async () => {
    const bundle = await enrollAgent(input);
    const sink = new PersistentRuntimeGuardEventSink(new SqliteAuditEventRepository(getDb()));
    await evaluateAgentRuntimeGuard({
      request: { requestId: 'req-audit', passportId: bundle.passport.passportId, actorId: 'tester', requestedAction: 'delete_all', actionCategory: 'execute_tool', toolName: 'read_record', dataCategories: ['public_docs'], requestedAt: new Date().toISOString() },
      passport: bundle.passport, runtimeSeal: bundle.runtimeSeal, policyManifest: bundle.policyManifest, options: { allowIssuedPassport: true },
    }, { signer: createIssuerSignerFromEnv(), eventSink: sink });

    const events = await new SqliteAuditEventRepository(getDb()).listRuntimeGuardEventsForPassport(bundle.passport.passportId);
    assert.ok(events.length > 0);
    assert.ok(events.some((e) => e.reasonCodes.includes('runtime_guard.action_prohibited')));
    assert.equal(events[0].passportId, bundle.passport.passportId);
  });
});

describe('Issuer key registry and signer boundary', () => {
  it('registers active, retired, and revoked issuer keys', async () => {
    const repo = new SqliteIssuerKeyRepository(getDb());
    await repo.registerKey({ issuerId: 'issuer-a', keyId: 'key-1', algorithm: 'hmac-sha256', publicKeyPem: 'public-1' });
    assert.equal((await repo.getActiveKey('issuer-a'))?.keyId, 'key-1');
    await repo.retireKey({ issuerId: 'issuer-a', keyId: 'key-1', reason: 'rotation' });
    assert.equal((await repo.getKey('issuer-a', 'key-1'))?.status, 'retired');
    await repo.registerKey({ issuerId: 'issuer-a', keyId: 'key-2', algorithm: 'hmac-sha256', publicKeyPem: 'public-2' });
    await repo.revokeKey({ issuerId: 'issuer-a', keyId: 'key-2', reason: 'compromised' });
    const keys = await repo.listKeys('issuer-a');
    assert.deepEqual(keys.map((k) => k.status), ['retired', 'revoked']);
  });

  it('records issuer id/key id metadata without exposing private key in public payload', async () => {
    process.env.AOC_ISSUER_ID = 'issuer-prod-like';
    process.env.AOC_ISSUER_KEY_ID = 'key-prod-like';
    process.env.AOC_ISSUER_PRIVATE_KEY_PEM = 'super-secret-test-private-key';
    process.env.AOC_ISSUER_PUBLIC_KEY_PEM = 'public-test-key';
    const bundle = await enrollAgent(input);
    assert.equal(bundle.passport.issuer, 'issuer-prod-like');
    assert.equal(bundle.passport.signature.keyId, 'key-prod-like');
    assert.equal(bundle.passport.metadata?.['issuerKeyId'], 'key-prod-like');
    const verification = await verifyAgentPassportBundle(bundle.passport.passportId);
    const serializedPublic = JSON.stringify(verification?.publicPayload);
    assert.ok(!serializedPublic.includes('super-secret-test-private-key'));
  });

  it('production mode without signer env fails safely', () => {
    const old = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
    delete process.env.AOC_ISSUER_PRIVATE_KEY_PEM;
    delete process.env.AOC_ISSUER_PUBLIC_KEY_PEM;
    delete process.env.AOC_ISSUER_ID;
    delete process.env.AOC_ISSUER_KEY_ID;
    assert.throws(() => getIssuerSignerConfigFromEnv(), /requires AOC_ISSUER_ID/);
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = old;
  });
});
