import type { WrappedDekMaterial } from './key-wrapping-port.js';
import type { StorageRef } from './storage-port.js';
import type { ContentIdentity, SovereignAssetId } from '@aoc/protocol/identity';

/**
 * Content Protection Runtime — Slice 2: Protected Resource + Content
 * Encryption Foundation ("Sovereign Execution Binding", Slice 2 of N).
 *
 * Turns `Resource → AccessGrant → Provider Credential` (Slice 1) into a
 * parallel, independent capability: `Plaintext resource → Enterprise
 * protection service → AES-256-GCM encryption → Ciphertext → Storage
 * provider`, with key material kept separate from the ciphertext. This
 * module never redefines `EnterpriseAccessGrant`/`EnterpriseGrantRevocation`/
 * `AccessGrantRecord` and is not itself an access-control mechanism --
 * `ProtectedResource` records that content *was cryptographically
 * protected*, never who may currently decrypt it. That authorization
 * question is explicitly deferred to a future `ExecutionGrant` + `KeyBroker`
 * slice (see `key-wrapping-port.ts`'s module doc).
 *
 * Naming: `ProtectedResource`, not `ProtectedAsset` -- Enterprise already
 * uses provider-neutral *resource* vocabulary throughout
 * (`AccessGrantResource`, `ResourceRef`), and this module protects both AOC
 * Sovereign Assets (through Protocol's public package) and ordinary resources that were never
 * sovereignized through Protocol at all. Calling every protected thing an
 * "asset" would either overload Protocol's own `SovereignAsset` vocabulary
 * or falsely imply every protected resource is one.
 */

// ---------------------------------------------------------------------------
// Access context (tenant / trust-domain scoping) -- mirrors
// `AccessGovernanceContext` (`../access-governance/contracts.ts`) verbatim.
// ---------------------------------------------------------------------------

export interface ContentProtectionContext {
  readonly system: boolean;
  readonly organizationId?: string;
  readonly actorId?: string;
}

// ---------------------------------------------------------------------------
// Resource identity -- Enterprise-internal only. Never a provider identity
// (a CID, a Pinata file id) and never a Protocol sovereign asset identity.
// ---------------------------------------------------------------------------

export interface ContentProtectionResourceRef {
  readonly kind: string;
  readonly id: string;
}

/**
 * Optional pointer to a Protocol-owned sovereign asset this protection is
 * bound to. Every field here is *carried through*, never minted: Enterprise
 * never invents a `sovereignAssetId`, never assigns provenance, and never
 * overwrites a Protocol-supplied `contentDigest` with one it computed
 * differently (Slice 2 requirement 8: "If Protocol supplies `contentDigest`,
 * it must be verified against the plaintext before protection and not
 * silently rewritten by Enterprise"). `contentDigest` below is Protocol's
 * own digest, copied verbatim -- `ProtectedResourceRecord.plaintextDigest`
 * (computed independently by this module) is what is actually compared
 * against it; see `service.ts`'s content-digest verification step.
 *
 * Populated only after the real Protocol registry resolution, manifest
 * verification, and plaintext ContentIdentity comparison all succeed.
 */
export interface VerifiedSovereignBinding {
  readonly sovereignAssetId: SovereignAssetId;
  /** Digest of the exact Protocol manifest that was cryptographically verified. */
  readonly manifestDigest: string;
  readonly manifestVersion: number;
  readonly contentIdentity: ContentIdentity;
  readonly canonicalizationProfile: string;
  readonly schemaVersion: string;
  readonly verifiedAt: string;
}

// ---------------------------------------------------------------------------
// ProtectedResource lifecycle -- the smallest state machine this slice's
// fail-atomicity requirement (Slice 2 requirement 11) needs. See
// `lifecycle.ts` for the transition rules.
// ---------------------------------------------------------------------------

/**
 * - `'pending'` -- durably recorded intent to protect a resource, created
 *   BEFORE any encryption/wrapping/upload is attempted (mirrors
 *   `AccessGrantStore.beginRevocation`'s "persist the governance fact
 *   first" discipline). A `'pending'` row that never advances is never
 *   mistaken for success -- nothing reads `'pending'` as "protected."
 * - `'active'` -- every protection step succeeded: content encrypted, DEK
 *   wrapped, ciphertext durably stored, and this record's own persistence
 *   committed. The only state from which a legitimate future `KeyBroker`
 *   may ever release key material.
 * - `'failed'` -- protection did not complete, and no ciphertext is known
 *   to be sitting at any storage provider under this `protectedResourceId`
 *   (the failure happened before or during upload, or upload itself
 *   failed). Terminal.
 * - `'orphaned'` -- ciphertext WAS successfully uploaded to a storage
 *   provider, but this record's own final persistence write failed
 *   afterward (Slice 2 requirement 11's explicit "recoverable orphan
 *   state"). Never treated as `'active'` -- no key material is released
 *   for an `'orphaned'` record -- but `storageRef` is preserved so an
 *   operator/reconciliation job can find and clean up (or retry
 *   finalizing) the orphaned ciphertext rather than losing track of it.
 */
export type ProtectedResourceState = 'pending' | 'active' | 'failed' | 'orphaned';

// ---------------------------------------------------------------------------
// The durable ProtectedResource record.
// ---------------------------------------------------------------------------

/**
 * Field-by-field invariants (Slice 2 requirement 8):
 *
 * - `protectedResourceId` -- this protection's own identity, minted once at
 *   `createPending` and stable for the record's lifetime.
 * - `resource` -- Enterprise's own identity/reference for the governed
 *   resource being protected. Never a provider identity.
 * - `sovereignBinding?` -- see `VerifiedSovereignBinding` above.
 *   Absent for a resource that was never sovereignized through Protocol --
 *   Enterprise can and does protect those too (Slice 2 requirement 3).
 * - `plaintextDigest?` -- `sha256:<hex>` of the original plaintext bytes,
 *   computed by Enterprise immediately before encryption. Absent while
 *   `state === 'pending'` (not yet computed). For a sovereign-bound
 *   protection, this is the value compared against
 *   `sovereignBinding.contentDigest` -- see `service.ts`.
 * - `ciphertextDigest?` -- `sha256:<hex>` of the encrypted representation.
 *   An integrity/correlation digest only -- explicitly NOT an asset
 *   identity and NEVER a `SovereignAssetId` substitute (Slice 2 requirement
 *   8).
 * - `encryptionProfile` -- the versioned profile this protection was
 *   produced under (`encryption-profile.ts`). Always present, even on a
 *   `'pending'`/`'failed'` row -- it is chosen before encryption is
 *   attempted, not derived from its outcome.
 * - `nonce?`/`authTag?` -- base64-encoded GCM nonce/authentication tag.
 *   Neither is secret (GCM's own design: nonce and tag are safe to store
 *   alongside ciphertext) and both are required to ever decrypt this
 *   record's ciphertext. Absent until `state === 'active'`.
 * - `wrappedKey?` -- the wrapped (already-encrypted) DEK material
 *   (`WrappedDekMaterial`, `key-wrapping-port.ts`). Never the raw DEK --
 *   see that module's own invariant documentation. Absent until
 *   `state === 'active'`.
 * - `storageRef?` -- where the ciphertext lives (`StorageRef`,
 *   `storage-port.ts`). Present once upload succeeds, including for
 *   `state === 'orphaned'` (see `ProtectedResourceState` above) -- this is
 *   precisely the field an orphan-recovery job needs.
 * - `failureReason?` -- a safe, truthful sentence explaining why `state`
 *   is `'failed'`/`'orphaned'`. Never a raw driver/OpenSSL error, stack
 *   trace, or any secret.
 * - `correlationId` -- this protection request's own audit-trail
 *   correlation identifier, mirroring `AccessGrantRecord.correlationId`.
 * - `createdAt`/`updatedAt` -- strict UTC timestamps (see
 *   `requireStrictUtcTimestamp`, reused from `../access-governance/access-grant-store.js`).
 */
export interface ProtectedResourceRecord {
  readonly protectedResourceId: string;
  readonly organizationId: string;
  readonly state: ProtectedResourceState;
  readonly resource: ContentProtectionResourceRef;
  readonly sovereignBinding?: VerifiedSovereignBinding;
  readonly plaintextDigest?: string;
  readonly ciphertextDigest?: string;
  readonly encryptionProfile: string;
  readonly nonce?: string;
  readonly authTag?: string;
  readonly wrappedKey?: WrappedDekMaterial;
  readonly storageRef?: StorageRef;
  readonly failureReason?: string;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Store-facing input/output shapes.
// ---------------------------------------------------------------------------

export interface CreatePendingProtectedResourceInput {
  readonly protectedResourceId: string;
  readonly organizationId: string;
  readonly resource: ContentProtectionResourceRef;
  readonly encryptionProfile: string;
  readonly correlationId: string;
  /** Requested sovereign asset reference, recorded even before verification completes, so a `'pending'`/`'failed'` row still shows intent. Distinct from `ProtectedResourceRecord.sovereignBinding`, which is only ever populated once actually verified. */
  readonly requestedSovereignAssetId?: SovereignAssetId;
}

export interface MarkProtectedResourceActiveInput {
  readonly protectedResourceId: string;
  readonly organizationId: string;
  readonly plaintextDigest: string;
  readonly ciphertextDigest: string;
  readonly nonce: string;
  readonly authTag: string;
  readonly wrappedKey: WrappedDekMaterial;
  readonly storageRef: StorageRef;
  readonly sovereignBinding?: VerifiedSovereignBinding;
}

export interface MarkProtectedResourceFailedInput {
  readonly protectedResourceId: string;
  readonly organizationId: string;
  readonly reason: string;
}

export interface MarkProtectedResourceOrphanedInput {
  readonly protectedResourceId: string;
  readonly organizationId: string;
  readonly storageRef: StorageRef;
  readonly reason: string;
}

export interface ProtectedResourceStoreHealth {
  readonly status: 'healthy' | 'unhealthy';
  readonly readable: boolean;
  readonly writable: boolean;
  readonly schemaVersion: string;
  readonly checkedAt: string;
}
