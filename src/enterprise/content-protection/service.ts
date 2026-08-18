import { CANONICAL_JSON_PROFILE } from '@aoc/protocol/canonical';
import { computeContentIdentity, contentIdentitiesEqual, parseSovereignAssetId } from '@aoc/protocol/identity';
import type { SovereignAssetId } from '@aoc/protocol/identity';
import {
  computeManifestDigest,
  resolveSovereignAsset,
  resolveSovereignAssetVersion,
  verifySovereignManifest,
} from '@aoc/protocol/manifest';
import type { SignedSovereignManifest, SovereignAssetRegistry } from '@aoc/protocol/manifest';

import { encryptContent, generateDek, generateNonce, sha256Hex, zeroBuffer } from './aead.js';
import { buildContentProtectionAad } from './aad.js';
import { requireContentProtectionEncryptionProfile, CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1 } from './encryption-profile.js';
import { ContentProtectionError, isContentProtectionError } from './errors.js';
import { requireContentProtectionAccessToOrganization } from './protected-resource-store.js';
import type { ProtectedResourceStore } from './protected-resource-store.js';
import type { KeyWrappingPort, WrappedDekMaterial } from './key-wrapping-port.js';
import type { ContentStoragePort } from './storage-port.js';
import type { ContentProtectionEvent, ContentProtectionEventType } from './evidence.js';
import type { ContentProtectionContext, ContentProtectionResourceRef, ProtectedResourceRecord, VerifiedSovereignBinding } from './contracts.js';

export interface ContentProtectionServiceDependencies {
  readonly store: ProtectedResourceStore;
  readonly keyWrapping: KeyWrappingPort;
  readonly storage: ContentStoragePort;
  /** Protocol owns this interface; Enterprise only consumes/implements infrastructure behind it. */
  readonly sovereignAssetRegistry?: SovereignAssetRegistry;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
  readonly onEvent?: (event: ContentProtectionEvent) => void;
}

export interface ProtectResourceRequest {
  readonly protectedResourceId?: string;
  readonly organizationId: string;
  readonly resource: ContentProtectionResourceRef;
  readonly plaintext: Buffer;
  readonly contentType?: string;
  readonly correlationId?: string;
  readonly encryptionProfile?: string;
  readonly sovereignAssetId?: SovereignAssetId;
  /** Exact historical version. Omit to bind the registry's latest resolved manifest. */
  readonly manifestVersion?: number;
}

export interface ContentProtectionService {
  protectResource(context: ContentProtectionContext, request: ProtectResourceRequest): Promise<ProtectedResourceRecord>;
  getProtectedResource(context: ContentProtectionContext, protectedResourceId: string): Promise<ProtectedResourceRecord>;
}

function describeFailureReason(error: unknown): string {
  return isContentProtectionError(error) ? error.message : 'An unexpected internal error occurred during content protection.';
}

function classifyVerificationFailure(signed: SignedSovereignManifest, reasons: readonly string[]): ContentProtectionError {
  if (reasons.includes('UNSUPPORTED_SCHEMA_VERSION')) {
    return new ContentProtectionError('CONTENT_PROTECTION_UNSUPPORTED_SOVEREIGN_SCHEMA', 'The resolved sovereign manifest uses an unsupported schema version.');
  }
  if (reasons.includes('UNSUPPORTED_CANONICALIZATION_PROFILE')) {
    return new ContentProtectionError('CONTENT_PROTECTION_UNSUPPORTED_CANONICALIZATION_PROFILE', 'The resolved sovereign manifest uses an unsupported canonicalization profile.');
  }
  if (reasons.includes('MANIFEST_DIGEST_MISMATCH') || computeManifestDigest(signed.manifest) !== signed.manifestDigest) {
    return new ContentProtectionError('CONTENT_PROTECTION_MANIFEST_DIGEST_MISMATCH', 'The resolved sovereign manifest digest does not match its canonical manifest.');
  }
  if (reasons.includes('CONTENT_IDENTITY_MISMATCH') || reasons.includes('CONTENT_DIGEST_MISMATCH')) {
    return new ContentProtectionError('CONTENT_PROTECTION_CONTENT_IDENTITY_MISMATCH', 'The plaintext ContentIdentity does not match the sovereign manifest.');
  }
  return new ContentProtectionError('CONTENT_PROTECTION_SOVEREIGN_MANIFEST_INVALID', 'The resolved signed sovereign manifest failed cryptographic verification.');
}

function assertBinding(binding: VerifiedSovereignBinding): void {
  if (
    typeof binding.sovereignAssetId !== 'string' ||
    !/^[0-9a-f]{64}$/.test(binding.manifestDigest) ||
    !Number.isInteger(binding.manifestVersion) ||
    binding.manifestVersion < 1 ||
    binding.canonicalizationProfile !== CANONICAL_JSON_PROFILE
  ) {
    throw new ContentProtectionError('CONTENT_PROTECTION_MALFORMED_SOVEREIGN_BINDING', 'The derived sovereign binding is malformed.');
  }
}

export function createContentProtectionService(deps: ContentProtectionServiceDependencies): ContentProtectionService {
  const { store, keyWrapping, storage, now, nextId } = deps;

  function emit(type: ContentProtectionEventType, protectedResourceId: string, organizationId: string, correlationId: string, detail?: ContentProtectionEvent['detail']): void {
    deps.onEvent?.({
      eventId: nextId('content-protection-event'),
      type,
      occurredAt: now(),
      organizationId,
      protectedResourceId,
      correlationId,
      ...(detail !== undefined ? { detail } : {}),
    });
  }

  return {
    async protectResource(context, request) {
      requireContentProtectionAccessToOrganization(context, request.organizationId);
      const profile = requireContentProtectionEncryptionProfile(request.encryptionProfile ?? CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1).profile;
      const protectedResourceId = request.protectedResourceId ?? nextId('protected-resource');
      const correlationId = request.correlationId ?? nextId('content-protection-correlation');
      let sovereignAssetId: SovereignAssetId | undefined;
      let sovereignBinding: VerifiedSovereignBinding | undefined;

      // Protocol validation precedes persistence, encryption, wrapping, and provider work.
      if (request.sovereignAssetId !== undefined) {
        emit('sovereign_binding_validation_started', protectedResourceId, request.organizationId, correlationId);
        try {
          try {
            sovereignAssetId = parseSovereignAssetId(request.sovereignAssetId);
          } catch {
            throw new ContentProtectionError('CONTENT_PROTECTION_MALFORMED_SOVEREIGN_BINDING', 'The requested SovereignAssetId is malformed.');
          }
          const registry = deps.sovereignAssetRegistry;
          if (registry === undefined) {
            throw new ContentProtectionError('CONTENT_PROTECTION_SOVEREIGN_ASSET_UNRESOLVED', 'No SovereignAssetRegistry is configured for sovereign protection.');
          }
          if (request.manifestVersion !== undefined && (!Number.isInteger(request.manifestVersion) || request.manifestVersion < 1)) {
            throw new ContentProtectionError('CONTENT_PROTECTION_MALFORMED_SOVEREIGN_BINDING', 'manifestVersion must be a positive integer.');
          }
          const signed = request.manifestVersion === undefined
            ? await resolveSovereignAsset(registry, sovereignAssetId)
            : await resolveSovereignAssetVersion(registry, sovereignAssetId, request.manifestVersion);
          if (signed === null) {
            throw new ContentProtectionError('CONTENT_PROTECTION_SOVEREIGN_ASSET_UNRESOLVED', `Sovereign asset '${sovereignAssetId}' could not be resolved.`);
          }
          if (request.manifestVersion !== undefined && signed.manifest.manifestVersion !== request.manifestVersion) {
            throw new ContentProtectionError('CONTENT_PROTECTION_HISTORICAL_MANIFEST_SUBSTITUTION', 'The registry substituted a different manifest for the requested historical version.');
          }
          if (signed.manifest.sovereignAssetId !== sovereignAssetId) {
            throw new ContentProtectionError('CONTENT_PROTECTION_SOVEREIGN_ASSET_ID_MISMATCH', 'The resolved manifest SovereignAssetId does not match the requested SovereignAssetId.');
          }
          const verification = await verifySovereignManifest(signed, { contentBytes: request.plaintext });
          if (!verification.valid) throw classifyVerificationFailure(signed, verification.reasons);
          if (verification.checks.contentDigest !== 'valid') {
            throw new ContentProtectionError('CONTENT_PROTECTION_CONTENT_IDENTITY_MISMATCH', 'Protocol did not verify plaintext ContentIdentity against the sovereign manifest.');
          }
          const actualContentIdentity = computeContentIdentity(request.plaintext);
          if (!contentIdentitiesEqual(actualContentIdentity, signed.manifest.contentIdentity)) {
            throw new ContentProtectionError('CONTENT_PROTECTION_CONTENT_IDENTITY_MISMATCH', 'The plaintext ContentIdentity does not match the sovereign manifest.');
          }
          sovereignBinding = {
            sovereignAssetId,
            manifestDigest: signed.manifestDigest,
            manifestVersion: signed.manifest.manifestVersion,
            contentIdentity: signed.manifest.contentIdentity,
            canonicalizationProfile: signed.manifest.canonicalizationProfile,
            schemaVersion: signed.manifest.schemaVersion,
            verifiedAt: now(),
          };
          assertBinding(sovereignBinding);
          emit('sovereign_manifest_verified', protectedResourceId, request.organizationId, correlationId, { sovereignAssetId, manifestDigest: signed.manifestDigest, manifestVersion: signed.manifest.manifestVersion });
          emit('sovereign_content_identity_matched', protectedResourceId, request.organizationId, correlationId, { sovereignAssetId });
        } catch (error) {
          emit('sovereign_binding_rejected', protectedResourceId, request.organizationId, correlationId, { reason: isContentProtectionError(error) ? error.code : 'CONTENT_PROTECTION_SOVEREIGN_MANIFEST_INVALID' });
          throw isContentProtectionError(error) ? error : new ContentProtectionError('CONTENT_PROTECTION_SOVEREIGN_MANIFEST_INVALID', 'The resolved signed sovereign manifest could not be verified.');
        }
      }

      emit('protection_requested', protectedResourceId, request.organizationId, correlationId, { resourceKind: request.resource.kind, resourceId: request.resource.id });
      await store.createPending(context, {
        protectedResourceId,
        organizationId: request.organizationId,
        resource: request.resource,
        encryptionProfile: profile,
        correlationId,
        ...(sovereignAssetId !== undefined ? { requestedSovereignAssetId: sovereignAssetId } : {}),
      });

      let dek: Buffer | undefined;
      let outcomeFinalized = false;
      try {
        const plaintextDigest = sha256Hex(request.plaintext);
        dek = generateDek();
        const nonce = generateNonce();
        const aad = buildContentProtectionAad({
          protectedResourceId,
          organizationId: request.organizationId,
          resource: request.resource,
          encryptionProfile: profile,
          ...(sovereignBinding === undefined ? {} : {
            sovereignAssetId: sovereignBinding.sovereignAssetId,
            manifestDigest: sovereignBinding.manifestDigest,
            manifestVersion: sovereignBinding.manifestVersion,
          }),
        });
        const { ciphertext, authTag } = encryptContent({ plaintext: request.plaintext, key: dek, nonce, aad });
        const ciphertextDigest = sha256Hex(ciphertext);
        let wrappedKey: WrappedDekMaterial;
        try {
          wrappedKey = await keyWrapping.wrapKey(dek, { protectedResourceId, organizationId: request.organizationId });
        } catch (error) {
          throw new ContentProtectionError('CONTENT_PROTECTION_KEY_WRAPPING_FAILED', isContentProtectionError(error) ? error.message : 'Key wrapping failed; provider upload was not attempted.');
        } finally {
          zeroBuffer(dek);
          dek = undefined;
        }

        let storageRef;
        try {
          storageRef = await storage.store({ protectedResourceId, organizationId: request.organizationId, ciphertext, ...(request.contentType ? { contentType: request.contentType } : {}) });
        } catch (error) {
          throw new ContentProtectionError('CONTENT_PROTECTION_STORAGE_FAILED', isContentProtectionError(error) ? error.message : `Ciphertext upload to storage provider '${storage.providerSystem}' failed.`);
        }
        emit('ciphertext_stored', protectedResourceId, request.organizationId, correlationId, { providerSystem: storageRef.providerSystem, sizeBytes: storageRef.sizeBytes });
        try {
          const active = await store.markActive(context, {
            protectedResourceId,
            organizationId: request.organizationId,
            plaintextDigest,
            ciphertextDigest,
            nonce: nonce.toString('base64'),
            authTag: authTag.toString('base64'),
            wrappedKey,
            storageRef,
            ...(sovereignBinding ? { sovereignBinding } : {}),
          });
          outcomeFinalized = true;
          emit('protected_resource_activated', protectedResourceId, request.organizationId, correlationId, sovereignBinding ? { sovereignAssetId: sovereignBinding.sovereignAssetId, manifestDigest: sovereignBinding.manifestDigest } : undefined);
          emit('protection_succeeded', protectedResourceId, request.organizationId, correlationId, { ciphertextDigest });
          return active;
        } catch {
          outcomeFinalized = true;
          try {
            await store.markOrphaned(context, { protectedResourceId, organizationId: request.organizationId, storageRef, reason: `Ciphertext uploaded to '${storageRef.providerSystem}:${storageRef.providerRef}' but final persistence failed.` });
          } catch { /* best effort */ }
          emit('protection_failed', protectedResourceId, request.organizationId, correlationId, { reason: 'persistence-failed-after-upload' });
          throw new ContentProtectionError('CONTENT_PROTECTION_STORE_UNAVAILABLE', `ProtectedResource '${protectedResourceId}' persistence failed after ciphertext upload; it is never active.`);
        }
      } catch (error) {
        if (dek !== undefined) zeroBuffer(dek);
        if (!outcomeFinalized) {
          const reason = describeFailureReason(error);
          try { await store.markFailed(context, { protectedResourceId, organizationId: request.organizationId, reason }); } catch { /* best effort */ }
          emit('protection_failed', protectedResourceId, request.organizationId, correlationId, { reason });
        }
        throw isContentProtectionError(error) ? error : new ContentProtectionError('CONTENT_PROTECTION_VALIDATION_ERROR', describeFailureReason(error));
      }
    },
    getProtectedResource(context, protectedResourceId) {
      return store.getProtectedResource(context, protectedResourceId);
    },
  };
}
