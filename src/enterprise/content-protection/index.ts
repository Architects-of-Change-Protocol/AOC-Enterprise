/**
 * Public surface of the Content Protection Runtime (Slice 2 of Sovereign
 * Execution Binding: "Protected Resource + Content Encryption Foundation").
 * See `contracts.ts`'s module doc for the full design rationale.
 *
 * Deliberately does NOT export `decryptContent` or `unwrapKey` from this
 * barrel -- both remain reachable only via their own module paths
 * (`./aead.js`, `./key-wrapping-port.js`) for this module's own tests and a
 * future, separately-gated `KeyBroker` slice, never presented alongside
 * `createContentProtectionService` as though they were part of the same
 * public application surface (Slice 2 requirement 15).
 */

export {
  CONTENT_PROTECTION_AEAD_ALGORITHM,
  DEK_LENGTH_BYTES,
  NONCE_LENGTH_BYTES,
  AUTH_TAG_LENGTH_BYTES,
  generateDek,
  generateNonce,
  encryptContent,
  sha256Hex,
  isWellFormedContentDigest,
  digestsEqual,
  zeroBuffer,
} from './aead.js';
export type { EncryptContentInput, EncryptedContent } from './aead.js';

export {
  CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1,
  SUPPORTED_CONTENT_PROTECTION_ENCRYPTION_PROFILES,
  isSupportedContentProtectionEncryptionProfile,
  requireContentProtectionEncryptionProfile,
} from './encryption-profile.js';
export type { ContentProtectionEncryptionProfile, ContentProtectionEncryptionProfileDescriptor } from './encryption-profile.js';

export { CONTENT_PROTECTION_AAD_PROFILE_V1, buildContentProtectionAad } from './aad.js';
export type { ContentProtectionAadContext } from './aad.js';

export { createDevLocalKeyWrappingProvider } from './key-wrapping-port.js';
export type { KeyWrappingPort, KeyWrappingContext, WrappedDekMaterial, CreateDevLocalKeyWrappingProviderOptions } from './key-wrapping-port.js';

export { createInMemoryContentStoragePort, createAlwaysFailingContentStoragePort } from './storage-port.js';
export type { ContentStoragePort, InMemoryContentStoragePort, StoreCiphertextInput, StorageRef } from './storage-port.js';

export { createPinataContentStorageAdapter } from './pinata-storage-adapter.js';
export type { CreatePinataContentStorageAdapterOptions } from './pinata-storage-adapter.js';

export { SOVEREIGN_BINDING_GATE, createBlockedSovereignAssetBindingPort } from './sovereign-binding-port.js';
export type { SovereignAssetBindingPort, SovereignManifest, ResolveSovereignAssetRequest } from './sovereign-binding-port.js';

export { ContentProtectionError, isContentProtectionError } from './errors.js';
export type { ContentProtectionErrorCode } from './errors.js';

export { assertPendingTransitionAllowed, isActiveProtectedResource } from './lifecycle.js';

export type {
  ContentProtectionContext,
  ContentProtectionResourceRef,
  ContentProtectionSovereignBinding,
  ProtectedResourceState,
  ProtectedResourceRecord,
  CreatePendingProtectedResourceInput,
  MarkProtectedResourceActiveInput,
  MarkProtectedResourceFailedInput,
  MarkProtectedResourceOrphanedInput,
  ProtectedResourceStoreHealth,
} from './contracts.js';

export {
  canAccessContentProtectionOrganization,
  requireContentProtectionTenantScope,
  requireContentProtectionAccessToOrganization,
  isStrictUtcTimestamp,
  requireStrictUtcTimestamp,
} from './protected-resource-store.js';
export type { ProtectedResourceStore } from './protected-resource-store.js';

export { createInMemoryProtectedResourceStore, CONTENT_PROTECTION_STORE_SCHEMA_VERSION } from './in-memory-protected-resource-store.js';
export { createSqliteProtectedResourceStore } from './sqlite-protected-resource-store.js';
export type { CreateSqliteProtectedResourceStoreOptions } from './sqlite-protected-resource-store.js';

export { createContentProtectionService } from './service.js';
export type { ContentProtectionService, ContentProtectionServiceDependencies, ProtectResourceRequest } from './service.js';

export type { ContentProtectionEvent, ContentProtectionEventType } from './evidence.js';
