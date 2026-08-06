import { digestsEqual, encryptContent, generateDek, generateNonce, sha256Hex, zeroBuffer } from './aead.js';
import { buildContentProtectionAad } from './aad.js';
import { requireContentProtectionEncryptionProfile, CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1 } from './encryption-profile.js';
import { ContentProtectionError, isContentProtectionError } from './errors.js';
import { requireContentProtectionAccessToOrganization } from './protected-resource-store.js';
import type { ProtectedResourceStore } from './protected-resource-store.js';
import { createBlockedSovereignAssetBindingPort } from './sovereign-binding-port.js';
import type { SovereignAssetBindingPort } from './sovereign-binding-port.js';
import type { KeyWrappingPort, WrappedDekMaterial } from './key-wrapping-port.js';
import type { ContentStoragePort } from './storage-port.js';
import type { ContentProtectionEvent, ContentProtectionEventType } from './evidence.js';
import type {
  ContentProtectionContext,
  ContentProtectionResourceRef,
  ContentProtectionSovereignBinding,
  ProtectedResourceRecord,
} from './contracts.js';

/**
 * The single authoritative protection orchestration path this slice adds
 * (Slice 2 requirement 10). Mirrors `../access-governance/service.ts`'s
 * `revokeGrant` in shape: one function, one durable write-ordering
 * discipline, no second code path that can reach a different outcome for
 * the same inputs.
 *
 * **No public decrypt path** (Slice 2 requirement 15/16, "CRITICAL security
 * invariant"): this service exposes `protectResource`/`getProtectedResource`
 * only. It never imports `decryptContent`, never calls
 * `KeyWrappingPort.unwrapKey`, and defines no function that could return
 * plaintext to a caller merely because they know a `protectedResourceId`.
 * Legitimate decryption is explicitly deferred to a future `ExecutionGrant`
 * + `KeyBroker` slice (see `key-wrapping-port.ts`'s module doc) -- this
 * module's own low-level primitives (`aead.ts`'s `decryptContent`,
 * `key-wrapping-port.ts`'s `unwrapKey`) remain available for that future
 * slice, and for this slice's own tests, but are never wired into anything
 * reachable from this service.
 */
export interface ContentProtectionServiceDependencies {
  readonly store: ProtectedResourceStore;
  readonly keyWrapping: KeyWrappingPort;
  readonly storage: ContentStoragePort;
  /** Defaults to `createBlockedSovereignAssetBindingPort()` -- see that module's doc for why (`SOVEREIGN_BINDING_GATE = BLOCKED_BY_PROTOCOL`). Only consulted when a request names `sovereignAssetId`. */
  readonly sovereignBinding?: SovereignAssetBindingPort;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
  /** Optional evidence sink (Slice 2 requirement 24). Never receives plaintext, raw key material, or a raw caught exception -- see `evidence.ts`. */
  readonly onEvent?: (event: ContentProtectionEvent) => void;
}

export interface ProtectResourceRequest {
  readonly protectedResourceId?: string;
  readonly organizationId: string;
  readonly resource: ContentProtectionResourceRef;
  /** The plaintext bytes to protect. Never logged, never echoed into any error/event this service produces. */
  readonly plaintext: Buffer;
  readonly contentType?: string;
  readonly correlationId?: string;
  readonly encryptionProfile?: string;
  /** When present, this protection is requested as sovereign-bound; see `sovereign-binding-port.ts`. Absent means an ordinary, non-sovereign-bound protection -- always available regardless of `SOVEREIGN_BINDING_GATE` (Slice 2 requirement 3). */
  readonly sovereignAssetId?: string;
  readonly sovereignVersion?: string;
}

export interface ContentProtectionService {
  protectResource(context: ContentProtectionContext, request: ProtectResourceRequest): Promise<ProtectedResourceRecord>;
  getProtectedResource(context: ContentProtectionContext, protectedResourceId: string): Promise<ProtectedResourceRecord>;
}

function describeFailureReason(error: unknown): string {
  // Only ever a hand-authored, already-safe `ContentProtectionError` message
  // is persisted/emitted -- an error from anywhere else (a raw driver
  // exception, an unexpected adapter throw) is deliberately reduced to a
  // fixed, generic sentence so no unvetted error content (which could
  // embed anything, including fragments of a stack trace) ever reaches a
  // durable `failureReason` column or an evidence event.
  if (isContentProtectionError(error)) return error.message;
  return 'An unexpected internal error occurred during content protection.';
}

export function createContentProtectionService(deps: ContentProtectionServiceDependencies): ContentProtectionService {
  const { store, keyWrapping, storage, now, nextId } = deps;
  const sovereignBinding = deps.sovereignBinding ?? createBlockedSovereignAssetBindingPort();

  function emit(type: ContentProtectionEventType, protectedResourceId: string, organizationId: string, correlationId: string, detail?: ContentProtectionEvent['detail']): void {
    if (deps.onEvent === undefined) return;
    const event: ContentProtectionEvent = {
      eventId: nextId('content-protection-event'),
      type,
      occurredAt: now(),
      organizationId,
      protectedResourceId,
      correlationId,
      ...(detail !== undefined ? { detail } : {}),
    };
    deps.onEvent(event);
  }

  return {
    async protectResource(context, request) {
      requireContentProtectionAccessToOrganization(context, request.organizationId);

      const profileDescriptor = requireContentProtectionEncryptionProfile(request.encryptionProfile ?? CONTENT_PROTECTION_ENCRYPTION_PROFILE_V1);
      const protectedResourceId = request.protectedResourceId ?? nextId('protected-resource');
      const correlationId = request.correlationId ?? nextId('content-protection-correlation');

      emit('protection_requested', protectedResourceId, request.organizationId, correlationId, { resourceKind: request.resource.kind, resourceId: request.resource.id });

      // Persist the durable 'pending' fact BEFORE any encryption/wrapping/
      // upload is attempted (mirrors AccessGrantStore.beginRevocation's
      // "persist first" discipline) -- guarantees a durable row exists to
      // transition to 'failed'/'orphaned'/'active' regardless of what
      // happens next (Slice 2 requirement 11).
      await store.createPending(context, {
        protectedResourceId,
        organizationId: request.organizationId,
        resource: request.resource,
        encryptionProfile: profileDescriptor.profile,
        correlationId,
        ...(request.sovereignAssetId !== undefined ? { requestedSovereignAssetId: request.sovereignAssetId } : {}),
      });

      let dek: Buffer | undefined;
      let outcomeFinalized = false;

      try {
        let resolvedSovereignBinding: ContentProtectionSovereignBinding | undefined;

        if (request.sovereignAssetId !== undefined) {
          const manifest = await sovereignBinding.resolveSovereignAsset({
            sovereignAssetId: request.sovereignAssetId,
            ...(request.sovereignVersion !== undefined ? { sovereignVersion: request.sovereignVersion } : {}),
          });
          const verified = await sovereignBinding.verifySovereignManifest(manifest);
          if (!verified) {
            throw new ContentProtectionError('CONTENT_PROTECTION_SOVEREIGN_BINDING_BLOCKED', `Sovereign manifest for '${request.sovereignAssetId}' failed verification.`);
          }

          const plaintextDigestForVerification = sha256Hex(request.plaintext);
          if (!digestsEqual(plaintextDigestForVerification, manifest.contentDigest)) {
            emit('integrity_mismatch', protectedResourceId, request.organizationId, correlationId, {
              expectedDigest: manifest.contentDigest,
              actualDigest: plaintextDigestForVerification,
            });
            throw new ContentProtectionError(
              'CONTENT_PROTECTION_CONTENT_INTEGRITY_MISMATCH',
              `CONTENT_INTEGRITY_MISMATCH: plaintext digest does not match sovereign asset '${request.sovereignAssetId}''s recorded contentDigest. This protection was rejected before any encryption was performed.`,
            );
          }

          resolvedSovereignBinding = {
            sovereignAssetId: manifest.sovereignAssetId,
            contentDigest: manifest.contentDigest,
            verifiedAt: now(),
            ...(manifest.sovereignVersion !== undefined ? { sovereignVersion: manifest.sovereignVersion } : {}),
          };
        }

        const plaintextDigest = sha256Hex(request.plaintext);

        dek = generateDek();
        const nonce = generateNonce();
        const aad = buildContentProtectionAad({
          protectedResourceId,
          organizationId: request.organizationId,
          resource: request.resource,
          encryptionProfile: profileDescriptor.profile,
          ...(resolvedSovereignBinding !== undefined ? { sovereignAssetRef: resolvedSovereignBinding.sovereignAssetId } : {}),
          ...(resolvedSovereignBinding?.sovereignVersion !== undefined ? { sovereignVersion: resolvedSovereignBinding.sovereignVersion } : {}),
        });
        const { ciphertext, authTag } = encryptContent({ plaintext: request.plaintext, key: dek, nonce, aad });
        const ciphertextDigest = sha256Hex(ciphertext);

        let wrappedKey: WrappedDekMaterial;
        try {
          try {
            wrappedKey = await keyWrapping.wrapKey(dek, { protectedResourceId, organizationId: request.organizationId });
          } catch (error) {
            // Normalizes ANY `KeyWrappingPort` failure -- whether it already
            // threw this module's own `ContentProtectionError` or a raw
            // adapter/SDK exception (a real KMS client would throw its own
            // error type) -- onto this module's own taxonomy, exactly as
            // `PinataProviderClientError` normalizes raw Pinata SDK failures
            // in `../access-governance/`. Never re-throws an unrecognized
            // error type past this point.
            throw new ContentProtectionError('CONTENT_PROTECTION_KEY_WRAPPING_FAILED', isContentProtectionError(error) ? error.message : 'Key wrapping failed; protection aborted before any provider upload was attempted.');
          }
        } finally {
          // The DEK is never needed again after wrapping (whether wrapping
          // succeeded or failed) -- zeroed here, immediately, rather than
          // left for GC (Slice 2 requirement 12).
          zeroBuffer(dek);
          dek = undefined;
        }

        let storageRef;
        try {
          storageRef = await storage.store({
            protectedResourceId,
            organizationId: request.organizationId,
            ciphertext,
            ...(request.contentType !== undefined ? { contentType: request.contentType } : {}),
          });
        } catch (error) {
          throw new ContentProtectionError('CONTENT_PROTECTION_STORAGE_FAILED', isContentProtectionError(error) ? error.message : `Ciphertext upload to storage provider '${storage.providerSystem}' failed.`);
        }
        emit('ciphertext_stored', protectedResourceId, request.organizationId, correlationId, {
          providerSystem: storageRef.providerSystem,
          sizeBytes: storageRef.sizeBytes,
        });

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
            ...(resolvedSovereignBinding !== undefined ? { sovereignBinding: resolvedSovereignBinding } : {}),
          });
          outcomeFinalized = true;
          emit('protection_succeeded', protectedResourceId, request.organizationId, correlationId, { ciphertextDigest });
          return active;
        } catch {
          // Ciphertext IS already durably uploaded (storageRef is real) --
          // this is exactly Slice 2 requirement 11's "persistence failure
          // after upload" case. Never leave the record silently 'pending'
          // if an explicit orphan marking can succeed; if even that fails,
          // the row remains 'pending' (durable and discoverable -- see
          // `contracts.ts`'s `ProtectedResourceState` doc), never falsely
          // 'active'.
          outcomeFinalized = true;
          try {
            await store.markOrphaned(context, {
              protectedResourceId,
              organizationId: request.organizationId,
              storageRef,
              reason: `Ciphertext uploaded to '${storageRef.providerSystem}:${storageRef.providerRef}' but finalizing ProtectedResource persistence failed.`,
            });
          } catch {
            // Best-effort only -- see the doc comment above.
          }
          emit('protection_failed', protectedResourceId, request.organizationId, correlationId, { reason: 'persistence-failed-after-upload' });
          throw new ContentProtectionError(
            'CONTENT_PROTECTION_STORE_UNAVAILABLE',
            `ProtectedResource '${protectedResourceId}' persistence failed after ciphertext upload; the resource was marked 'orphaned' (or remains 'pending') for recovery, never 'active'.`,
          );
        }
      } catch (error) {
        if (dek !== undefined) zeroBuffer(dek);

        if (!outcomeFinalized) {
          const reason = describeFailureReason(error);
          try {
            await store.markFailed(context, { protectedResourceId, organizationId: request.organizationId, reason });
          } catch {
            // Best-effort: the store itself may be unavailable, which is
            // exactly the condition already being reported by rethrowing
            // below.
          }
          const eventType: ContentProtectionEventType = isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_CONTENT_INTEGRITY_MISMATCH' ? 'integrity_mismatch' : 'protection_failed';
          // The mismatch case already emitted 'integrity_mismatch' above,
          // before the pending row existed to attach a failure reason to
          // was even reachable -- guard against double emission.
          if (eventType !== 'integrity_mismatch') {
            emit('protection_failed', protectedResourceId, request.organizationId, correlationId, { reason });
          }
        }

        throw isContentProtectionError(error) ? error : new ContentProtectionError('CONTENT_PROTECTION_VALIDATION_ERROR', describeFailureReason(error));
      }
    },

    async getProtectedResource(context, protectedResourceId) {
      return store.getProtectedResource(context, protectedResourceId);
    },
  };
}
