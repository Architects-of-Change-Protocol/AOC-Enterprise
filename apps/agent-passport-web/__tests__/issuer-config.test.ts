import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { _resetIssuerConfigCache } from '../src/lib/issuer-config.js';

describe('PassportIssuerConfig', () => {
  const origNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    _resetIssuerConfigCache();
    // Clear any env vars from previous tests
    delete process.env.PASSPORT_ISSUER_ID;
    delete process.env.PASSPORT_ISSUER_NAME;
    delete process.env.PASSPORT_ISSUER_KEY_ID;
    delete process.env.PASSPORT_SIGNING_SECRET;
  });

  after(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
    _resetIssuerConfigCache();
  });

  it('returns development fallback when NODE_ENV != production', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    const { getPassportIssuerConfig } = await import('../src/lib/issuer-config.js');
    const config = getPassportIssuerConfig();
    assert.equal(config.issuerId, 'dev-issuer');
    assert.equal(config.issuerKeyId, 'dev-hmac-key');
    assert.equal(config.signingSecret, 'dev-only-agent-passport-secret');
    assert.equal(config.isDevelopmentFallback, true);
    assert.equal(config.signingAlgorithm, 'HMAC-SHA256');
  });

  it('uses env vars when set in development', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    process.env.PASSPORT_ISSUER_ID = 'my-dev-issuer';
    process.env.PASSPORT_ISSUER_KEY_ID = 'my-dev-key';
    process.env.PASSPORT_SIGNING_SECRET = 'my-dev-secret-that-is-long-enough';
    const { getPassportIssuerConfig } = await import('../src/lib/issuer-config.js');
    const config = getPassportIssuerConfig();
    assert.equal(config.issuerId, 'my-dev-issuer');
    assert.equal(config.isDevelopmentFallback, false);
  });

  it('throws in production without env vars', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const { getPassportIssuerConfig } = await import('../src/lib/issuer-config.js');
    assert.throws(
      () => getPassportIssuerConfig(),
      /Missing required production env vars/,
    );
  });

  it('getPublicIssuerMetadata returns safe subset (no secret)', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    const { getPublicIssuerMetadata } = await import('../src/lib/issuer-config.js');
    const meta = getPublicIssuerMetadata();
    assert.ok('issuerId' in meta);
    assert.ok('issuerKeyId' in meta);
    assert.ok(!('signingSecret' in meta));
  });
});
