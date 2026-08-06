import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  decryptContent,
  digestsEqual,
  encryptContent,
  generateDek,
  generateNonce,
  sha256Hex,
  AUTH_TAG_LENGTH_BYTES,
  DEK_LENGTH_BYTES,
  NONCE_LENGTH_BYTES,
} from '../content-protection/aead.js';
import { buildContentProtectionAad } from '../content-protection/aad.js';
import { requireContentProtectionEncryptionProfile, CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1 } from '../content-protection/encryption-profile.js';
import { isContentProtectionError } from '../content-protection/errors.js';
import { createDevLocalKeyWrappingProvider } from '../content-protection/key-wrapping-port.js';

function aadFor(overrides: Partial<{ protectedResourceId: string; organizationId: string; resourceId: string }> = {}) {
  return buildContentProtectionAad({
    protectedResourceId: overrides.protectedResourceId ?? 'pr-1',
    organizationId: overrides.organizationId ?? 'org-a',
    resource: { kind: 'document', id: overrides.resourceId ?? 'resource-1' },
    encryptionProfile: CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1,
  });
}

describe('Content Protection -- low-level AEAD primitives (Slice 2 Tests A-G)', () => {
  it('Test A: round trip -- plaintext -> encrypt -> decrypt -> same bytes', () => {
    const plaintext = Buffer.from('the quick brown fox jumps over the lazy dog', 'utf8');
    const key = generateDek();
    const nonce = generateNonce();
    const aad = aadFor();

    assert.equal(key.length, DEK_LENGTH_BYTES);
    assert.equal(nonce.length, NONCE_LENGTH_BYTES);

    const { ciphertext, authTag } = encryptContent({ plaintext, key, nonce, aad });
    assert.equal(authTag.length, AUTH_TAG_LENGTH_BYTES);
    assert.notDeepEqual(ciphertext, plaintext);

    const decrypted = decryptContent({ ciphertext, key, nonce, authTag, aad });
    assert.deepEqual(decrypted, plaintext);
  });

  it('Test B: randomized encryption -- same plaintext encrypted twice yields different ciphertext, both decrypt correctly', () => {
    const plaintext = Buffer.from('identical plaintext', 'utf8');
    const key1 = generateDek();
    const key2 = generateDek();
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    const aad = aadFor();

    assert.notDeepEqual(key1, key2, 'two DEKs must not collide');
    assert.notDeepEqual(nonce1, nonce2, 'two nonces must not collide');

    const first = encryptContent({ plaintext, key: key1, nonce: nonce1, aad });
    const second = encryptContent({ plaintext, key: key2, nonce: nonce2, aad });

    assert.notDeepEqual(first.ciphertext, second.ciphertext, 'ciphertext must differ because DEK/nonce differ');

    assert.deepEqual(decryptContent({ ...first, key: key1, nonce: nonce1, aad }), plaintext);
    assert.deepEqual(decryptContent({ ...second, key: key2, nonce: nonce2, aad }), plaintext);
  });

  it('Test C: ciphertext tamper -- modifying ciphertext bytes causes authentication failure', () => {
    const plaintext = Buffer.from('sensitive content', 'utf8');
    const key = generateDek();
    const nonce = generateNonce();
    const aad = aadFor();
    const { ciphertext, authTag } = encryptContent({ plaintext, key, nonce, aad });

    const tampered = Buffer.from(ciphertext);
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;

    assert.throws(
      () => decryptContent({ ciphertext: tampered, key, nonce, authTag, aad }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_AUTHENTICATION_FAILED',
    );
  });

  it('Test D: authentication tag tamper -- modifying the auth tag causes authentication failure', () => {
    const plaintext = Buffer.from('sensitive content', 'utf8');
    const key = generateDek();
    const nonce = generateNonce();
    const aad = aadFor();
    const { ciphertext, authTag } = encryptContent({ plaintext, key, nonce, aad });

    const tamperedTag = Buffer.from(authTag);
    tamperedTag[0] = (tamperedTag[0]! ^ 0xff) & 0xff;

    assert.throws(
      () => decryptContent({ ciphertext, key, nonce, authTag: tamperedTag, aad }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_AUTHENTICATION_FAILED',
    );
  });

  it('Test E: wrong key -- decrypting with a different key fails', () => {
    const plaintext = Buffer.from('sensitive content', 'utf8');
    const key = generateDek();
    const wrongKey = generateDek();
    const nonce = generateNonce();
    const aad = aadFor();
    const { ciphertext, authTag } = encryptContent({ plaintext, key, nonce, aad });

    assert.throws(
      () => decryptContent({ ciphertext, key: wrongKey, nonce, authTag, aad }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_AUTHENTICATION_FAILED',
    );
  });

  it('Test F: wrong AAD/context -- ciphertext moved to a different logical context fails to decrypt', () => {
    const plaintext = Buffer.from('sensitive content', 'utf8');
    const key = generateDek();
    const nonce = generateNonce();
    const originalAad = aadFor({ protectedResourceId: 'pr-1', organizationId: 'org-a' });
    const { ciphertext, authTag } = encryptContent({ plaintext, key, nonce, aad: originalAad });

    const differentTenantAad = aadFor({ protectedResourceId: 'pr-1', organizationId: 'org-b' });
    assert.throws(
      () => decryptContent({ ciphertext, key, nonce, authTag, aad: differentTenantAad }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_AUTHENTICATION_FAILED',
    );

    const differentResourceAad = aadFor({ protectedResourceId: 'pr-2', organizationId: 'org-a' });
    assert.throws(
      () => decryptContent({ ciphertext, key, nonce, authTag, aad: differentResourceAad }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_AUTHENTICATION_FAILED',
    );

    // Correct AAD still decrypts -- proves the failures above are genuinely about context binding, not a broken fixture.
    assert.deepEqual(decryptContent({ ciphertext, key, nonce, authTag, aad: originalAad }), plaintext);
  });

  it('Test G: unknown encryption profile -- fails closed, never falls back to a default algorithm', () => {
    assert.throws(
      () => requireContentProtectionEncryptionProfile('AOC-ENTERPRISE-PROTECTION-V0-DOES-NOT-EXIST'),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_UNSUPPORTED_ENCRYPTION_PROFILE',
    );
    assert.throws(
      () => requireContentProtectionEncryptionProfile(undefined),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_UNSUPPORTED_ENCRYPTION_PROFILE',
    );
    // The one supported profile resolves cleanly.
    const descriptor = requireContentProtectionEncryptionProfile(CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1);
    assert.equal(descriptor.algorithm, 'aes-256-gcm');
    assert.equal(descriptor.keySizeBits, 256);
  });

  it('digest helpers: sha256Hex is deterministic and digestsEqual is a real comparison', () => {
    const a = sha256Hex(Buffer.from('hello', 'utf8'));
    const b = sha256Hex(Buffer.from('hello', 'utf8'));
    const c = sha256Hex(Buffer.from('hello!', 'utf8'));
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.ok(digestsEqual(a, b));
    assert.ok(!digestsEqual(a, c));
  });
});

describe('Content Protection -- KeyWrappingPort dev-local provider (structural non-production safeguards)', () => {
  it('refuses to construct without the explicit allowNonProductionKeyWrapping: true opt-in', () => {
    assert.throws(
      // @ts-expect-error -- deliberately omitting the required literal-true option to prove it cannot be constructed by accident.
      () => createDevLocalKeyWrappingProvider({}),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_KEY_WRAPPING_MISCONFIGURED',
    );
  });

  it('refuses to construct when NODE_ENV=production, even with the opt-in flag set', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(
        () => createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true }),
        (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_KEY_WRAPPING_MISCONFIGURED',
      );
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });

  it('wraps and unwraps a DEK round trip', async () => {
    const provider = createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true });
    const dek = generateDek();
    const context = { protectedResourceId: 'pr-1', organizationId: 'org-a' };

    const wrapped = await provider.wrapKey(dek, context);
    assert.notEqual(wrapped.wrappedDek, dek.toString('base64'), 'wrapped material must not equal the raw DEK');

    const unwrapped = await provider.unwrapKey(wrapped, context);
    assert.deepEqual(unwrapped, dek);
  });

  it('two separately-constructed instances (simulating a process restart) cannot unwrap each other\'s wrapped material -- proves the KEK is ephemeral, never shared/persistent', async () => {
    const providerA = createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true });
    const providerB = createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true });
    const dek = generateDek();
    const context = { protectedResourceId: 'pr-1', organizationId: 'org-a' };

    const wrapped = await providerA.wrapKey(dek, context);
    await assert.rejects(
      () => providerB.unwrapKey(wrapped, context),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_KEY_WRAPPING_FAILED',
    );
  });

  it('wrong context fails to unwrap even with the correct KEK', async () => {
    const provider = createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true });
    const dek = generateDek();
    const wrapped = await provider.wrapKey(dek, { protectedResourceId: 'pr-1', organizationId: 'org-a' });

    await assert.rejects(
      () => provider.unwrapKey(wrapped, { protectedResourceId: 'pr-1', organizationId: 'org-b' }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_KEY_WRAPPING_FAILED',
    );
  });

  it('tampered wrapped material fails to unwrap', async () => {
    const provider = createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true });
    const dek = generateDek();
    const context = { protectedResourceId: 'pr-1', organizationId: 'org-a' };
    const wrapped = await provider.wrapKey(dek, context);

    const tamperedBytes = Buffer.from(wrapped.wrappedDek, 'base64');
    tamperedBytes[0] = (tamperedBytes[0]! ^ 0xff) & 0xff;
    const tampered = { ...wrapped, wrappedDek: tamperedBytes.toString('base64') };

    await assert.rejects(
      () => provider.unwrapKey(tampered, context),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_KEY_WRAPPING_FAILED',
    );
  });
});
