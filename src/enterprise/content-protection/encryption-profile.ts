import { AUTH_TAG_LENGTH_BYTES, CONTENT_PROTECTION_AEAD_ALGORITHM, DEK_LENGTH_BYTES, NONCE_LENGTH_BYTES } from './aead.js';
import { ContentProtectionError } from './errors.js';

/**
 * A versioned, closed vocabulary of encryption profiles — never a free-form
 * string. `protectResource` and `decryptContent`'s callers reject any
 * `encryptionProfile` value not in `SUPPORTED_CONTENT_PROTECTION_ENCRYPTION_PROFILES`
 * (Slice 2 requirement 19: "Unknown/unsupported profile: FAIL CLOSED"),
 * never attempt to "best guess" a decode, and never silently downgrade to a
 * weaker algorithm. Introducing a new profile in the future (e.g. a v2 with
 * a different AEAD primitive or nonce policy) is an additive union member,
 * never a mutation of what `'AOC-ENTERPRISE-PROTECTION-V1'` means -- existing
 * ciphertext protected under v1 must remain decryptable under v1's exact
 * parameters forever.
 */
export const CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1 = 'AOC-ENTERPRISE-PROTECTION-V1' as const;

export type ContentProtectionEncryptionProfile = typeof CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1;

export const SUPPORTED_CONTENT_PROTECTION_ENCRYPTION_PROFILES: readonly ContentProtectionEncryptionProfile[] = [
  CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1,
];

export interface ContentProtectionEncryptionProfileDescriptor {
  readonly profile: ContentProtectionEncryptionProfile;
  readonly algorithm: typeof CONTENT_PROTECTION_AEAD_ALGORITHM;
  readonly keySizeBits: number;
  readonly nonceSizeBytes: number;
  readonly authTagSizeBytes: number;
  /** Which `aad.ts` AAD-construction version this profile pairs with -- see `CONTENT_PROTECTION_AAD_PROFILE_V1`. */
  readonly aadProfile: string;
}

const PROFILE_DESCRIPTORS: Readonly<Record<ContentProtectionEncryptionProfile, ContentProtectionEncryptionProfileDescriptor>> = {
  [CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1]: {
    profile: CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1,
    algorithm: CONTENT_PROTECTION_AEAD_ALGORITHM,
    keySizeBits: DEK_LENGTH_BYTES * 8,
    nonceSizeBytes: NONCE_LENGTH_BYTES,
    authTagSizeBytes: AUTH_TAG_LENGTH_BYTES,
    aadProfile: 'aoc-enterprise-content-protection-aad-v1',
  },
};

export function isSupportedContentProtectionEncryptionProfile(value: unknown): value is ContentProtectionEncryptionProfile {
  return typeof value === 'string' && SUPPORTED_CONTENT_PROTECTION_ENCRYPTION_PROFILES.includes(value as ContentProtectionEncryptionProfile);
}

/** Fail-closed profile lookup: throws `CONTENT_PROTECTION_UNSUPPORTED_ENCRYPTION_PROFILE` for anything not in the closed, supported set -- never falls back to a default algorithm. */
export function requireContentProtectionEncryptionProfile(value: unknown): ContentProtectionEncryptionProfileDescriptor {
  if (!isSupportedContentProtectionEncryptionProfile(value)) {
    throw new ContentProtectionError(
      'CONTENT_PROTECTION_UNSUPPORTED_ENCRYPTION_PROFILE',
      `Encryption profile '${String(value)}' is not supported by this runtime (supported: ${SUPPORTED_CONTENT_PROTECTION_ENCRYPTION_PROFILES.join(', ')}).`,
    );
  }
  return PROFILE_DESCRIPTORS[value];
}
