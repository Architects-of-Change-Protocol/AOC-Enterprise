import type { PinataProviderClient } from '@aoc-enterprise/pinata-adapter';

import { ContentProtectionError } from './errors.js';
import type { ContentStoragePort, StorageRef, StoreCiphertextInput } from './storage-port.js';

/**
 * The first concrete `ContentStoragePort` adapter (Slice 2 requirement 13:
 * "If Pinata is used: Pinata must receive encrypted bytes"). Imports only
 * `PinataProviderClient` (the narrow seam `@aoc-enterprise/pinata-adapter`
 * already defines and is boundary-checked by
 * `packages/pinata-adapter/scripts/check-pinata-boundary.mjs`) -- never the
 * raw `pinata` SDK, never a Pinata-specific type beyond that interface.
 * This file is the ONLY place in `content-protection/` that knows Pinata
 * exists; `service.ts` and every other file in this module talk exclusively
 * to the provider-neutral `ContentStoragePort` (Slice 2 requirement 14).
 *
 * `service.ts` always calls `storage.store(...)` with `ciphertext` -- the
 * AES-256-GCM output -- never with `request.plaintext`. This adapter itself
 * adds no additional guarantee beyond "upload exactly the bytes I was
 * given" (it has no way to inspect whether they are plaintext or
 * ciphertext); the invariant that only ciphertext ever reaches here is
 * `service.ts`'s own call-ordering discipline, proven by this module's test
 * suite (`../__tests__/content-protection-service.test.ts`, Test I) against
 * the in-memory adapter and, for this adapter specifically, by
 * `../__tests__/content-protection-pinata-storage-adapter.test.ts` against a
 * fake `PinataProviderClient` (unit-level evidence only -- see that test
 * file's own doc comment for why no live-provider verification is included
 * here).
 *
 * Pinata receives only what `PinataUploadCiphertextRequest` carries:
 * ciphertext bytes, a file name, a content type, and safe correlation
 * `keyvalues` (`protectedResourceId`/`organizationId` -- never plaintext,
 * never a raw DEK, never a KEK, never usable decryption capability). No CID
 * or Pinata file id is ever treated as sovereign/asset identity here --
 * `providerRef` below carries Pinata's file id purely as an opaque storage
 * handle (`StorageRef`'s own documented invariant), mirroring the
 * `providerFileId` vs. `providerCid` distinction GAP-012 already
 * established for `../access-governance/`.
 */
export interface CreatePinataContentStorageAdapterOptions {
  readonly client: PinataProviderClient;
  readonly contentType?: string;
  readonly now?: () => string;
}

export function createPinataContentStorageAdapter(options: CreatePinataContentStorageAdapterOptions): ContentStoragePort {
  const { client } = options;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    providerSystem: 'pinata',

    async store(input: StoreCiphertextInput): Promise<StorageRef> {
      try {
        const result = await client.uploadCiphertext({
          bytes: input.ciphertext,
          fileName: `${input.protectedResourceId}.ciphertext`,
          contentType: input.contentType ?? options.contentType ?? 'application/octet-stream',
          keyvalues: { protectedResourceId: input.protectedResourceId, organizationId: input.organizationId },
        });
        return { providerSystem: 'pinata', providerRef: result.pinataFileId, storedAt: now(), sizeBytes: result.sizeBytes };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Pinata rejected the ciphertext upload.';
        throw new ContentProtectionError('CONTENT_PROTECTION_STORAGE_FAILED', `Pinata ciphertext upload failed: ${message}`);
      }
    },
  };
}
