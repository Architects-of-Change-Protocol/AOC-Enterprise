import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { _resetIssuerConfigCache } from '../src/lib/issuer-config.js';
import {
  signAgentPassportPayload,
  verifyAgentPassportPayload,
  canonicalJson,
} from '../src/lib/passport-issuer.js';

// Use dev fallback (NODE_ENV=test)
before(() => {
  _resetIssuerConfigCache();
  (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
});

after(() => {
  _resetIssuerConfigCache();
});

describe('canonicalJson', () => {
  it('sorts keys alphabetically', () => {
    const result = canonicalJson({ z: 1, a: 2, m: 3 });
    assert.equal(result, '{"a":2,"m":3,"z":1}');
  });

  it('excludes signature field', () => {
    const result = canonicalJson({ id: 'test', signature: 'abc', name: 'x' });
    assert.ok(!result.includes('signature'));
    assert.ok(result.includes('"id"'));
  });

  it('sorts nested object keys', () => {
    const result = canonicalJson({ b: { z: 1, a: 2 }, a: 1 });
    assert.equal(result, '{"a":1,"b":{"a":2,"z":1}}');
  });
});

describe('signAgentPassportPayload / verifyAgentPassportPayload', () => {
  it('signs a payload and produces a hex signature', () => {
    const payload = { passportId: 'pp_001', agentName: 'TestBot', issuedAt: '2024-01-01T00:00:00Z' };
    const result = signAgentPassportPayload(payload);
    assert.ok(result.signature.match(/^[0-9a-f]{64}$/));
    assert.equal(result.algorithm, 'HMAC-SHA256');
    assert.ok(result.issuerKeyId.length > 0);
    assert.ok(result.signedAt.length > 0);
  });

  it('verifies a valid signature', () => {
    const payload = { passportId: 'pp_002', agentName: 'TestBot' };
    const { signature } = signAgentPassportPayload(payload);
    const result = verifyAgentPassportPayload(payload, signature);
    assert.equal(result.valid, true);
  });

  it('rejects a tampered payload', () => {
    const payload = { passportId: 'pp_003', agentName: 'TestBot' };
    const { signature } = signAgentPassportPayload(payload);
    const tampered = { ...payload, agentName: 'EvilBot' };
    const result = verifyAgentPassportPayload(tampered, signature);
    assert.equal(result.valid, false);
  });

  it('rejects a bad signature string', () => {
    const payload = { passportId: 'pp_004', agentName: 'TestBot' };
    const result = verifyAgentPassportPayload(payload, 'deadbeef'.repeat(8));
    assert.equal(result.valid, false);
  });

  it('signature is deterministic (same payload → same signature)', () => {
    const payload = { passportId: 'pp_005', agentName: 'TestBot', score: 42 };
    const r1 = signAgentPassportPayload(payload);
    const r2 = signAgentPassportPayload(payload);
    assert.equal(r1.signature, r2.signature);
  });

  it('signature is key-order independent (canonical JSON)', () => {
    const p1 = { a: 1, b: 2 };
    const p2 = { b: 2, a: 1 };
    const s1 = signAgentPassportPayload(p1).signature;
    const s2 = signAgentPassportPayload(p2).signature;
    assert.equal(s1, s2);
  });
});
