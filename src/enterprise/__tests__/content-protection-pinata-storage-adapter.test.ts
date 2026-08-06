import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PinataProviderClient, PinataUploadCiphertextRequest } from '@aoc-enterprise/pinata-adapter';

import { createContentProtectionService } from '../content-protection/service.js';
import { createInMemoryProtectedResourceStore } from '../content-protection/in-memory-protected-resource-store.js';
import { createDevLocalKeyWrappingProvider } from '../content-protection/key-wrapping-port.js';
import { createPinataContentStorageAdapter } from '../content-protection/pinata-storage-adapter.js';
import { isContentProtectionError } from '../content-protection/errors.js';

/**
 * Unit-level evidence only, exactly like `../access-governance/`'s own
 * Pinata coverage (`access-grant-revocation.test.ts` vs.
 * `access-grant-pinata-live.test.ts`): a FAKE `PinataProviderClient` --
 * this file never contacts a real Pinata endpoint and never requires a
 * `PINATA_JWT`. It proves this adapter's own call-shape (what reaches the
 * fake client, and how a real `pinata` SDK failure would be normalized),
 * NOT that the real Pinata service behaves this way -- that would require
 * live-provider verification, which is unavailable in this environment (no
 * `PINATA_JWT`/`PINATA_TEST_CID` configured). See the final report's
 * "Provider behavior" section for this distinction stated explicitly.
 */

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

function makeFakePinataClient(overrides: Partial<PinataProviderClient> = {}): PinataProviderClient {
  return {
    async createTemporaryAccessLink() {
      throw new Error('not used by this test');
    },
    async getResourceMetadata() {
      throw new Error('not used by this test');
    },
    async invalidateResource() {
      throw new Error('not used by this test');
    },
    async uploadCiphertext() {
      return { pinataFileId: 'file-fake-1', cid: 'QmFakeCid', sizeBytes: 0 };
    },
    ...overrides,
  };
}

describe('Content Protection -- Pinata ContentStoragePort adapter (unit-level, fake client)', () => {
  it('uploads exactly the ciphertext bytes -- never the plaintext -- and carries only safe correlation keyvalues', async () => {
    let captured: PinataUploadCiphertextRequest | undefined;
    const client = makeFakePinataClient({
      async uploadCiphertext(request) {
        captured = request;
        return { pinataFileId: 'file-1', cid: 'QmAbc123', sizeBytes: request.bytes.length };
      },
    });

    const service = createContentProtectionService({
      store: createInMemoryProtectedResourceStore({ now: buildClock() }),
      keyWrapping: createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true }),
      storage: createPinataContentStorageAdapter({ client, now: buildClock() }),
      now: buildClock(),
      nextId,
    });

    const plaintext = Buffer.from('UNIQUE-PLAINTEXT-MARKER-should-never-reach-pinata', 'utf8');
    const record = await service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-pinata-1' }, plaintext });

    assert.ok(captured, 'uploadCiphertext must have been called');
    const capturedBytes = Buffer.from(captured!.bytes.buffer, captured!.bytes.byteOffset, captured!.bytes.byteLength);
    assert.equal(capturedBytes.indexOf(plaintext), -1, 'plaintext must not appear anywhere in what Pinata received');
    assert.notDeepEqual(capturedBytes, plaintext);

    // Only safe correlation metadata -- no key material, no plaintext, no gateway/JWT.
    assert.deepEqual(captured!.keyvalues, { protectedResourceId: record.protectedResourceId, organizationId: 'org-a' });
    assert.equal(Object.keys(captured!.keyvalues ?? {}).length, 2);

    assert.equal(record.storageRef?.providerSystem, 'pinata');
    assert.equal(record.storageRef?.providerRef, 'file-1');
  });

  it('normalizes a Pinata upload failure into CONTENT_PROTECTION_STORAGE_FAILED, never a raw SDK error', async () => {
    const client = makeFakePinataClient({
      async uploadCiphertext() {
        throw new Error('simulated Pinata 503');
      },
    });

    const service = createContentProtectionService({
      store: createInMemoryProtectedResourceStore({ now: buildClock() }),
      keyWrapping: createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true }),
      storage: createPinataContentStorageAdapter({ client, now: buildClock() }),
      now: buildClock(),
      nextId,
    });

    await assert.rejects(
      () => service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-pinata-2' }, plaintext: Buffer.from('x') }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_STORAGE_FAILED',
    );
  });
});
