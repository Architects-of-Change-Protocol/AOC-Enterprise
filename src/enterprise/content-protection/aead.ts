import { createHash, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';

import { ContentProtectionError } from './errors.js';

/**
 * The one, authoritative AEAD primitive this module uses — AES-256-GCM via
 * Node's built-in `node:crypto`. No custom cipher, no hand-rolled mode of
 * operation, no re-implementation of GCM's counter/tag logic: every
 * cryptographic operation below is a thin, direct call into a primitive
 * `node:crypto` itself implements (OpenSSL under the hood). This is
 * deliberately the *only* file in this module that calls
 * `createCipheriv`/`createDecipheriv` — every other file in
 * `content-protection/` reaches encryption/decryption exclusively through
 * `encryptContent`/`decryptContent` below.
 */

export const CONTENT_PROTECTION_AEAD_ALGORITHM = 'aes-256-gcm' as const;

/** 256-bit DEK — AES-256's exact required key length, never derived, always a fresh CSPRNG draw. */
export const DEK_LENGTH_BYTES = 32;
/** 96-bit nonce — the length GCM is defined and most efficient for; reusing any other length degrades GCM's authentication guarantees. */
export const NONCE_LENGTH_BYTES = 12;
/** 128-bit authentication tag — GCM's maximum, strongest supported tag length. */
export const AUTH_TAG_LENGTH_BYTES = 16;

/**
 * Generates a fresh, cryptographically secure random 256-bit Data Encryption
 * Key. Callers must never persist the returned buffer directly (see
 * `KeyWrappingPort`) and should call `zeroBuffer` on it once wrapping (or
 * unwrapping-then-use) is complete.
 */
export function generateDek(): Buffer {
  return randomBytes(DEK_LENGTH_BYTES);
}

/**
 * Generates a fresh, cryptographically secure random 96-bit nonce. Called
 * exactly once per encryption operation — see "no nonce reuse" in the
 * module doc of `service.ts`. A nonce is never derived from, or reused
 * across, more than one (key, plaintext) pair.
 */
export function generateNonce(): Buffer {
  return randomBytes(NONCE_LENGTH_BYTES);
}

export interface EncryptContentInput {
  readonly plaintext: Buffer;
  /** Must be exactly `DEK_LENGTH_BYTES` (32) bytes — the caller's freshly generated DEK, never a KEK and never a wrapped key. */
  readonly key: Buffer;
  /** A fresh nonce from `generateNonce()` — never reused for this `key`. */
  readonly nonce: Buffer;
  /** Additional Authenticated Data binding this ciphertext to its logical context (see `aad.ts`). Authenticated but not encrypted. */
  readonly aad: Buffer;
}

export interface EncryptedContent {
  readonly ciphertext: Buffer;
  readonly authTag: Buffer;
}

function assertKeyLength(key: Buffer): void {
  if (key.length !== DEK_LENGTH_BYTES) {
    throw new ContentProtectionError('CONTENT_PROTECTION_INVALID_KEY_LENGTH', `Encryption key must be exactly ${DEK_LENGTH_BYTES} bytes (AES-256); received ${key.length}.`);
  }
}

function assertNonceLength(nonce: Buffer): void {
  if (nonce.length !== NONCE_LENGTH_BYTES) {
    throw new ContentProtectionError('CONTENT_PROTECTION_INVALID_NONCE_LENGTH', `Nonce must be exactly ${NONCE_LENGTH_BYTES} bytes; received ${nonce.length}.`);
  }
}

/**
 * Encrypts `plaintext` under AES-256-GCM. Deterministic in nothing except
 * its inputs — the same (key, nonce, plaintext, aad) always produces the
 * same (ciphertext, authTag); randomness comes only from the caller having
 * drawn a fresh `key`/`nonce`, never from this function.
 */
export function encryptContent(input: EncryptContentInput): EncryptedContent {
  assertKeyLength(input.key);
  assertNonceLength(input.nonce);

  const cipher = createCipheriv(CONTENT_PROTECTION_AEAD_ALGORITHM, input.key, input.nonce, { authTagLength: AUTH_TAG_LENGTH_BYTES });
  cipher.setAAD(input.aad);
  const ciphertext = Buffer.concat([cipher.update(input.plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, authTag };
}

export interface DecryptContentInput {
  readonly ciphertext: Buffer;
  readonly key: Buffer;
  readonly nonce: Buffer;
  readonly authTag: Buffer;
  readonly aad: Buffer;
}

/**
 * Decrypts and authenticates `ciphertext`. Throws `CONTENT_PROTECTION_AUTHENTICATION_FAILED`
 * — never returns partial/unauthenticated plaintext — when the authentication
 * tag does not verify, whether because the ciphertext was tampered with, the
 * tag was tampered with, the wrong key was supplied, or `aad` does not match
 * the context the ciphertext was originally bound to. `node:crypto`'s
 * `decipher.final()` itself performs the tag check and throws on mismatch;
 * this function narrows that generic failure to this module's own error
 * taxonomy and never leaks the underlying OpenSSL error message (which can
 * vary by Node/OpenSSL version) as anything other than a fixed, safe string.
 */
export function decryptContent(input: DecryptContentInput): Buffer {
  assertKeyLength(input.key);
  assertNonceLength(input.nonce);
  if (input.authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new ContentProtectionError('CONTENT_PROTECTION_AUTHENTICATION_FAILED', 'Authentication tag has an invalid length.');
  }

  try {
    const decipher = createDecipheriv(CONTENT_PROTECTION_AEAD_ALGORITHM, input.key, input.nonce, { authTagLength: AUTH_TAG_LENGTH_BYTES });
    decipher.setAAD(input.aad);
    decipher.setAuthTag(input.authTag);
    return Buffer.concat([decipher.update(input.ciphertext), decipher.final()]);
  } catch {
    // Never surface the raw OpenSSL exception (message content/shape is not
    // a stable contract across Node/OpenSSL versions and must never be
    // mistaken for a diagnostic about *why* -- tamper, wrong key, and wrong
    // AAD are deliberately indistinguishable from outside this function, so
    // no caller can use error content as an oracle.
    throw new ContentProtectionError('CONTENT_PROTECTION_AUTHENTICATION_FAILED', 'Ciphertext failed authentication (tampered ciphertext, tampered tag, wrong key, or wrong context binding).');
  }
}

const DIGEST_PREFIX = 'sha256:';
const DIGEST_HEX_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** Computes `sha256:<hex>` over raw bytes — the digest primitive this module uses for `plaintextDigest`/`ciphertextDigest`. Deliberately distinct from `../governance-store/digest.ts`'s `computeDigest`, which hashes canonical JSON serialization of a structured value, not raw content bytes. */
export function sha256Hex(bytes: Buffer): string {
  return `${DIGEST_PREFIX}${createHash('sha256').update(bytes).digest('hex')}`;
}

export function isWellFormedContentDigest(value: string): boolean {
  return DIGEST_HEX_PATTERN.test(value);
}

/** Constant-time comparison of two digest strings — avoids leaking match/mismatch timing when comparing a caller-supplied Protocol digest against a freshly computed one. */
export function digestsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Best-effort zeroing of transient secret key material (Slice 2 requirement
 * 12: "best-effort buffer zeroing for transient secret key material where
 * meaningful"). This is honestly best-effort, not a guarantee: V8/Node can
 * have copied these bytes during GC, JIT, or a prior `Buffer` operation
 * before this call ever runs, and this function cannot reach those copies.
 * It is still worth doing -- it shrinks the window a live process-memory
 * inspection could recover the DEK from this specific buffer -- and is
 * called on every DEK buffer this module still holds once it is no longer
 * needed (immediately after wrapping on encrypt; immediately after
 * decryption completes on the low-level test/decrypt path).
 */
export function zeroBuffer(buffer: Buffer): void {
  buffer.fill(0);
}
