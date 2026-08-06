import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createContentProtectionService } from '../content-protection/service.js';
import { createInMemoryProtectedResourceStore } from '../content-protection/in-memory-protected-resource-store.js';
import { createDevLocalKeyWrappingProvider } from '../content-protection/key-wrapping-port.js';
import { createInMemoryContentStoragePort } from '../content-protection/storage-port.js';
import { decryptContent, encryptContent, generateDek, generateNonce } from '../content-protection/aead.js';
import { buildContentProtectionAad } from '../content-protection/aad.js';
import { CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1 } from '../content-protection/encryption-profile.js';
import { isContentProtectionError } from '../content-protection/errors.js';

const ORG_A = { organizationId: 'org-a', system: false } as const;

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

describe('Content Protection -- Section 22: the copy test', () => {
  it('copies of the protected representation are byte-identical, never contain plaintext, and mere possession is insufficient to recover plaintext', async () => {
    const store = createInMemoryProtectedResourceStore({ now: buildClock() });
    const storage = createInMemoryContentStoragePort({ now: buildClock() });
    const service = createContentProtectionService({
      store,
      keyWrapping: createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true }),
      storage,
      now: buildClock(),
      nextId,
    });

    const plaintext = Buffer.from('THE-ONLY-COPY-OF-THIS-SECRET-SHOULD-NEVER-LEAVE-VIA-CIPHERTEXT', 'utf8');
    const record = await service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'copy-test-doc' }, plaintext });

    const original = storage.inspect(record.storageRef!.providerRef)!;

    // Make several independent copies of the ciphertext bytes, exactly as
    // a distribution provider (Pinata, a CDN, a downstream mirror) would.
    const copies = [Buffer.from(original), Buffer.from(original), Buffer.from(original)];

    // Claim 1: copies are byte-identical to the original and to each other.
    for (const copy of copies) {
      assert.deepEqual(copy, original);
    }
    assert.deepEqual(copies[0], copies[1]);
    assert.deepEqual(copies[1], copies[2]);

    // Claim 2: none of the copies contains the plaintext.
    for (const copy of copies) {
      assert.equal(copy.indexOf(plaintext), -1);
    }

    // Claim 3: mere possession of a copy is insufficient to recover
    // plaintext without the DEK -- attempting to decrypt a copy with
    // *some* key (standing in for "an attacker with only the ciphertext,
    // never the wrapped-key material or the KEK") fails authentication.
    // This module never hands a bare key to a copy holder; this assertion
    // demonstrates the ciphertext alone is cryptographically inert.
    const nonce = Buffer.from(record.nonce!, 'base64');
    const authTag = Buffer.from(record.authTag!, 'base64');
    const aad = buildContentProtectionAad({
      protectedResourceId: record.protectedResourceId,
      organizationId: 'org-a',
      resource: record.resource,
      encryptionProfile: CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1,
    });
    const attackerGuessKey = generateDek();
    for (const copy of copies) {
      assert.throws(
        () => decryptContent({ ciphertext: copy, key: attackerGuessKey, nonce, authTag, aad }),
        (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_AUTHENTICATION_FAILED',
      );
    }

    // What this test does NOT and cannot claim: that these copies are
    // "Kill-Switched" -- there is no ExecutionGrant/KeyBroker in this
    // slice, so nothing here asserts that authorization can later be
    // revoked to make these copies permanently unreadable. The only
    // truthful claim proven above is: copies of the protected
    // representation do not contain directly consumable plaintext.
  });
});

describe('Content Protection -- Section 23: plaintext escape boundary (expected, not a failure)', () => {
  it('once plaintext is decrypted via an authorized/internal primitive and copied out, this slice cannot remotely revoke or reach it', () => {
    // This test operates at the LOW-LEVEL crypto layer directly
    // (`aead.ts`), exactly as an authorized future `KeyBroker` would --
    // never through `ContentProtectionService`, which exposes no decrypt
    // path at all (Slice 2 requirement 15).
    const plaintext = Buffer.from('once decrypted, this copy is just bytes in a test fixture', 'utf8');
    const key = generateDek();
    const nonce = generateNonce();
    const aad = buildContentProtectionAad({
      protectedResourceId: 'pr-escape-test',
      organizationId: 'org-a',
      resource: { kind: 'document', id: 'escape-test-doc' },
      encryptionProfile: CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1,
    });

    const { ciphertext, authTag } = encryptContent({ plaintext, key, nonce, aad });

    // An authorized decrypt (this test stands in for a future, properly
    // gated `KeyBroker` call) legitimately recovers the plaintext...
    const decryptedCopy = decryptContent({ ciphertext, key, nonce, authTag, aad });
    assert.deepEqual(decryptedCopy, plaintext);

    // ...and once it exists here, in this ordinary `Buffer`, it is fully
    // independent of `ContentProtectionService`/`ProtectedResourceStore`.
    // Nothing in this module is watching, tracking, or able to reach this
    // variable. A second, entirely disconnected copy demonstrates the
    // same fact: plaintext, once legitimately decrypted, is just as
    // portable/copyable as every other in-memory byte buffer --
    // cryptographic protection governs the ciphertext's distribution
    // channel, never bytes that have already been lawfully decrypted.
    const secondCopy = Buffer.from(decryptedCopy);
    assert.deepEqual(secondCopy, plaintext);

    // Expected, documented boundary (Slice 2 requirement 23): this is not
    // a defect to fix, and no future revocation mechanism in this
    // repository will ever be able to claw back a copy made from this
    // point onward. Confidentiality after lawful decryption is an
    // operational/legal control (e.g. contractual terms, DRM, watermarking
    // -- all explicitly out of scope, see Slice 2 requirement 25), never a
    // cryptographic one. Revocation (a future ExecutionGrant/KeyBroker
    // slice) can only ever prevent *future* decryption of the ciphertext,
    // never reach backward into copies already made.
  });
});
