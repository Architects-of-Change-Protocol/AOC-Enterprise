/**
 * Deterministic AEAD Associated Authenticated Data (AAD) construction — the
 * cryptographic context binding Slice 2 requirement 9 asks for: "ciphertext
 * moved into a different logical context must not silently decrypt as
 * though it belonged there." AAD is authenticated but not encrypted; GCM's
 * `setAAD` requires byte-identical AAD at decrypt time or authentication
 * fails (see `aead.ts`'s `decryptContent`).
 *
 * This is an Enterprise-owned, versioned AAD profile (`CONTENT_PROTECTION_AAD_PROFILE_V1`)
 * defined strictly for encryption context binding -- it does not duplicate,
 * and is not derived from, AOC Protocol's own canonicalization rules
 * (`../governance-store/canonical-json.ts` is a distinct concern: Governance
 * Store record integrity, not encryption context). Fields bound, per Slice 2
 * requirement 9's minimum list:
 *
 * - `protectedResourceId` -- this specific protection record's own identity;
 *   ciphertext bound to one `ProtectedResource` cannot be silently
 *   substituted for another's.
 * - `organizationId` -- the tenant/trust domain; ciphertext cannot cross a
 *   tenant boundary and still decrypt.
 * - `resource.kind`/`resource.id` -- the governed resource identity this
 *   protection covers.
 * - `encryptionProfile` -- the profile/version this ciphertext was produced
 *   under (see `encryption-profile.ts`); a future v2 profile cannot be
 *   confused with v1 ciphertext even if every other field matched.
 * - `sovereignAssetRef`/`sovereignVersion` -- when this protection is
 *   sovereign-bound (see `sovereign-binding-port.ts`), the Protocol-owned
 *   asset/version reference it was verified against; `null` when absent.
 *   Enterprise never mints these values, only carries them through.
 *
 * Encoded as canonical JSON over a fixed-order array (not delimiter-joined
 * strings): JSON's own string escaping makes two different logical contexts
 * structurally unable to collide onto the same byte sequence, which a naive
 * separator-joined string (e.g. `orgId + ':' + resourceId`) cannot guarantee
 * once any field may itself contain the separator character.
 */

export const CONTENT_PROTECTION_AAD_PROFILE_V1 = 'aoc-enterprise-content-protection-aad-v1' as const;

export interface ContentProtectionAadContext {
  readonly protectedResourceId: string;
  readonly organizationId: string;
  readonly resource: { readonly kind: string; readonly id: string };
  readonly encryptionProfile: string;
  readonly sovereignAssetRef?: string;
  readonly sovereignVersion?: string;
}

export function buildContentProtectionAad(context: ContentProtectionAadContext): Buffer {
  const canonical = JSON.stringify([
    CONTENT_PROTECTION_AAD_PROFILE_V1,
    context.protectedResourceId,
    context.organizationId,
    context.resource.kind,
    context.resource.id,
    context.encryptionProfile,
    context.sovereignAssetRef ?? null,
    context.sovereignVersion ?? null,
  ]);
  return Buffer.from(canonical, 'utf8');
}
