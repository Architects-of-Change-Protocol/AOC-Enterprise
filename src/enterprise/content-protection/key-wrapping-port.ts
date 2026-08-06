import { randomBytes } from 'node:crypto';

import { decryptContent, encryptContent, generateNonce, DEK_LENGTH_BYTES } from './aead.js';
import { ContentProtectionError } from './errors.js';

/**
 * Envelope encryption's key-separation seam (Slice 2 requirement 7/16):
 * content is encrypted under a fresh, random DEK (`aead.ts`); the DEK itself
 * is never persisted or transmitted in the clear -- it is always "wrapped"
 * (itself AEAD-encrypted) under a Key-Encryption Key (KEK) this port
 * abstracts away. `protectResource` (`service.ts`) calls `wrapKey` once per
 * protection; a *future*, separately-gated slice's `KeyBroker` is the only
 * intended caller of `unwrapKey` at runtime (Slice 2 requirement 16: "This
 * module MUST NOT expose `unwrapKey` as a public ungoverned application
 * service" -- enforced here by this port simply not being reachable from any
 * public/HTTP surface this slice wires up; low-level tests call it directly,
 * as the requirement explicitly permits).
 *
 * Production composition: a real implementation of this port (AWS KMS,
 * GCP KMS, HashiCorp Vault Transit, an HSM) is a later infrastructure
 * dependency, explicitly out of scope for this slice (Slice 2 requirement
 * 25). `createContentProtectionService` (`service.ts`) takes a
 * `KeyWrappingPort` as a *required* constructor dependency with no default
 * -- there is no code path in this module that silently falls back to
 * `createDevLocalKeyWrappingProvider` below, so a production composition
 * root that forgets to wire a real KMS-backed port fails to construct the
 * service at all, rather than quietly running on dev-grade key wrapping.
 */
export interface WrappedDekMaterial {
  /** Which `KeyWrappingPort` implementation produced this -- `'dev-local-ephemeral'` for the POC-only provider below; a real KMS adapter would use its own distinct `kind` (e.g. `'aws-kms'`). Never ambiguous between the two. */
  readonly kind: string;
  /** The wrapping profile/version, mirroring `encryption-profile.ts`'s versioning discipline for the content AEAD itself. */
  readonly profile: string;
  /** An opaque pointer to which KEK/key-wrapping key was used (e.g. a real KMS key ARN/id). `undefined` for the dev-local provider, which has no externally addressable key identity. */
  readonly keyReference?: string;
  /** Base64-encoded ciphertext of the DEK -- the DEK itself AEAD-wrapped under the KEK. This is safe to persist alongside `ProtectedResource` metadata precisely because it is ciphertext, never the raw DEK (Slice 2 requirement 7: "no raw DEK stored alongside ciphertext"). */
  readonly wrappedDek: string;
  readonly nonce: string;
  readonly authTag: string;
}

export interface KeyWrappingContext {
  readonly protectedResourceId: string;
  readonly organizationId: string;
}

/**
 * The minimal port this slice needs (Slice 2 requirement 16): `wrapKey`
 * turns a raw DEK into persistable `WrappedDekMaterial`; `unwrapKey` is its
 * inverse. Deliberately two free functions, not a "key management service"
 * with key rotation, multi-tenant key hierarchies, or key lifecycle --
 * those are real KMS/HSM concerns this slice does not attempt to model.
 */
export interface KeyWrappingPort {
  readonly kind: string;
  readonly profile: string;
  wrapKey(dek: Buffer, context: KeyWrappingContext): Promise<WrappedDekMaterial>;
  unwrapKey(wrapped: WrappedDekMaterial, context: KeyWrappingContext): Promise<Buffer>;
}

const DEV_LOCAL_KIND = 'dev-local-ephemeral' as const;
const DEV_LOCAL_PROFILE = 'aoc-enterprise-dev-local-kek-v1' as const;

export interface CreateDevLocalKeyWrappingProviderOptions {
  /**
   * Must be passed as literal `true`. This is not a default-`true` flag --
   * TypeScript's literal type means a caller cannot satisfy this option by
   * accident (e.g. by spreading an unrelated truthy config object); it must
   * be an explicit, visible `allowNonProductionKeyWrapping: true` at every
   * call site, structurally documenting non-production intent at the point
   * of use.
   */
  readonly allowNonProductionKeyWrapping: true;
  /** Override hook for tests only, so two "restarts" can be simulated deterministically. Never pass a real secret here in application code -- omit this and let the provider draw its own ephemeral KEK. */
  readonly testOnlyFixedKek?: Buffer;
}

/**
 * **NON-PRODUCTION.** A local, in-process, ephemeral key-wrapping provider
 * for development and this slice's own automated tests only -- never a real
 * KMS/HSM. Structural safeguards, each independently sufficient to prevent
 * accidental production use (Slice 2 requirement 7's "tests prove it cannot
 * accidentally become the production default"):
 *
 * 1. Requires the literal-typed `allowNonProductionKeyWrapping: true` option
 *    (see above) -- cannot be constructed by accident.
 * 2. Refuses to construct at all when `process.env.NODE_ENV === 'production'`,
 *    regardless of the opt-in flag -- a deployment cannot silently promote
 *    this provider into a production composition root.
 * 3. Its KEK is a fresh `randomBytes(32)` draw made at construction time and
 *    held only in this closure's memory -- never derived from an
 *    environment variable, config file, or any other value that could be
 *    accidentally checked into source control or shared across process
 *    restarts. A process restart draws a brand-new KEK, permanently
 *    orphaning every `WrappedDekMaterial` this instance ever produced --
 *    the opposite of what any real production key-management system would
 *    do, and a property this module's own tests exercise directly (two
 *    separately-constructed instances cannot unwrap each other's material).
 *
 * No secret is hard-coded and none is ever committed: the KEK is generated,
 * never configured.
 */
export function createDevLocalKeyWrappingProvider(options: CreateDevLocalKeyWrappingProviderOptions): KeyWrappingPort {
  if (options.allowNonProductionKeyWrapping !== true) {
    throw new ContentProtectionError(
      'CONTENT_PROTECTION_KEY_WRAPPING_MISCONFIGURED',
      'createDevLocalKeyWrappingProvider requires an explicit allowNonProductionKeyWrapping: true -- this provider is not, and must never become, a production key-management implementation.',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new ContentProtectionError(
      'CONTENT_PROTECTION_KEY_WRAPPING_MISCONFIGURED',
      'createDevLocalKeyWrappingProvider refuses to run with NODE_ENV=production. Configure a real KeyWrappingPort (KMS/HSM-backed) for production composition.',
    );
  }

  const kek = options.testOnlyFixedKek ?? randomBytes(DEK_LENGTH_BYTES);
  if (kek.length !== DEK_LENGTH_BYTES) {
    throw new ContentProtectionError('CONTENT_PROTECTION_KEY_WRAPPING_MISCONFIGURED', `testOnlyFixedKek must be exactly ${DEK_LENGTH_BYTES} bytes.`);
  }

  function contextAad(context: KeyWrappingContext): Buffer {
    // Binds the wrapped DEK to the same (protectedResourceId, organizationId)
    // pair the content AEAD itself binds to (see `aad.ts`) -- a wrapped DEK
    // moved to a different protected resource's row cannot be unwrapped
    // there, an independent defense-in-depth layer on top of the content
    // ciphertext's own AAD binding.
    return Buffer.from(JSON.stringify([DEV_LOCAL_PROFILE, context.protectedResourceId, context.organizationId]), 'utf8');
  }

  return {
    kind: DEV_LOCAL_KIND,
    profile: DEV_LOCAL_PROFILE,

    async wrapKey(dek: Buffer, context: KeyWrappingContext): Promise<WrappedDekMaterial> {
      const nonce = generateNonce();
      const { ciphertext, authTag } = encryptContent({ plaintext: dek, key: kek, nonce, aad: contextAad(context) });
      return {
        kind: DEV_LOCAL_KIND,
        profile: DEV_LOCAL_PROFILE,
        wrappedDek: ciphertext.toString('base64'),
        nonce: nonce.toString('base64'),
        authTag: authTag.toString('base64'),
      };
    },

    async unwrapKey(wrapped: WrappedDekMaterial, context: KeyWrappingContext): Promise<Buffer> {
      if (wrapped.kind !== DEV_LOCAL_KIND || wrapped.profile !== DEV_LOCAL_PROFILE) {
        throw new ContentProtectionError('CONTENT_PROTECTION_KEY_WRAPPING_FAILED', `Wrapped key material has kind/profile '${wrapped.kind}/${wrapped.profile}', not unwrappable by this dev-local provider.`);
      }
      try {
        return decryptContent({
          ciphertext: Buffer.from(wrapped.wrappedDek, 'base64'),
          key: kek,
          nonce: Buffer.from(wrapped.nonce, 'base64'),
          authTag: Buffer.from(wrapped.authTag, 'base64'),
          aad: contextAad(context),
        });
      } catch {
        throw new ContentProtectionError('CONTENT_PROTECTION_KEY_WRAPPING_FAILED', 'Failed to unwrap DEK: wrong KEK (e.g. a different provider instance/process), tampered wrapped material, or mismatched context.');
      }
    },
  };
}
