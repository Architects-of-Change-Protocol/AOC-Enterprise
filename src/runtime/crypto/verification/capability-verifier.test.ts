import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CapabilityToken } from '@aoc/protocol';
import { verifyCapabilityToken } from './capability-verifier.js';
import type { CapabilityVerificationContext } from './capability-verifier.js';

// Fixtures use ONLY fields that exist on the real @aoc/protocol CapabilityToken
// (vendor/aoc-protocol-0.1.0.tgz, dist/contracts/index.d.ts): schemaVersion,
// tokenId, issuer, subject, resource, scope, constraints?, delegation?,
// expiresAt, notBefore?, revocationRefs?, proof. There is no jti, trust_domain,
// or exp field on this type -- those were invented by the buggy implementation.

function baseToken(overrides: Partial<CapabilityToken> = {}): CapabilityToken {
  return {
    schemaVersion: '1.0.0',
    tokenId: 'tok-good-1',
    issuer: 'issuer-1',
    subject: 'subject-1',
    resource: { kind: 'tenant', id: 'tenant-1' },
    scope: ['read'],
    expiresAt: '2999-01-01T00:00:00.000Z',
    proof: { proofType: 'jwt', proofRef: 'sig-ref-1', issuedAt: '2020-01-01T00:00:00.000Z' },
    ...overrides,
  };
}

function baseCtx(overrides: Partial<CapabilityVerificationContext> = {}): CapabilityVerificationContext {
  return {
    trustDomain: 'enterprise',
    revokedJti: new Set<string>(),
    nowIso: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('verifyCapabilityToken -- security regression (capability token verification bypass)', () => {
  it('rejects an expired token', () => {
    const token = baseToken({ expiresAt: '2000-01-01T00:00:00.000Z' });
    const result = verifyCapabilityToken(token, baseCtx());
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('token_expired'), `expected token_expired, got ${JSON.stringify(result.reasonCodes)}`);
  });

  it('rejects a revoked token', () => {
    const token = baseToken({ tokenId: 'tok-revoked-1' });
    const ctx = baseCtx({ revokedJti: new Set(['tok-revoked-1']) });
    const result = verifyCapabilityToken(token, ctx);
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('token_revoked'), `expected token_revoked, got ${JSON.stringify(result.reasonCodes)}`);
  });

  it('rejects a token with a tampered/invalid proof (no verifiable signature reference)', () => {
    const token = baseToken({ proof: { proofType: 'jwt', issuedAt: '2020-01-01T00:00:00.000Z' } });
    const result = verifyCapabilityToken(token, baseCtx());
    assert.equal(result.valid, false);
  });

  it('rejects a structurally malformed token without throwing', () => {
    const malformedInputs: unknown[] = [null, undefined, {}, 'not-a-token', 42, { tokenId: 123 }];
    for (const input of malformedInputs) {
      assert.doesNotThrow(() => {
        const result = verifyCapabilityToken(input as CapabilityToken, baseCtx());
        assert.equal(result.valid, false, `expected invalid for malformed input ${JSON.stringify(input)}`);
      });
    }
  });

  it('accepts a well-formed, unexpired, non-revoked token with a resolvable proof', () => {
    const result = verifyCapabilityToken(baseToken(), baseCtx());
    assert.equal(result.valid, true, `expected valid, got reasonCodes ${JSON.stringify(result.reasonCodes)}`);
    assert.deepEqual(result.reasonCodes, []);
  });

  it('fails closed when a revocationRef cannot be resolved (no RevocationLookup wired)', () => {
    const token = baseToken({ revocationRefs: ['crl-entry-42'] });
    const result = verifyCapabilityToken(token, baseCtx());
    assert.equal(result.valid, false);
    assert.ok(
      result.reasonCodes.includes('revocation_status_indeterminate'),
      `expected revocation_status_indeterminate, got ${JSON.stringify(result.reasonCodes)}`,
    );
  });
});
