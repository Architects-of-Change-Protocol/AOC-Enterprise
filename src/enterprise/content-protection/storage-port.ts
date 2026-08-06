import { ContentProtectionError } from './errors.js';

/**
 * The provider-neutral seam ciphertext crosses on its way to wherever it is
 * distributed/stored (Slice 2 requirement 13/14/18). No encryption contract
 * in this module ever imports a provider SDK or references a provider-specific
 * identity (a CID, a Pinata file id, a JWT, a gateway domain) -- only this
 * port and its own provider-specific adapters (e.g. a future
 * `packages/pinata-adapter` storage adapter) know about any of that. The
 * cryptographic core (`aead.ts`, `service.ts`) is tested exclusively against
 * `createInMemoryContentStoragePort` below; a Pinata (or any other) adapter
 * is one interchangeable implementation of this same interface, never a
 * dependency the core requires to function or to be tested (Slice 2
 * requirement 14: "Tests must demonstrate that the protection service works
 * against an abstract storage/provider port").
 */
export interface StoreCiphertextInput {
  readonly protectedResourceId: string;
  readonly organizationId: string;
  readonly ciphertext: Buffer;
  /** A content-type hint only (e.g. `'application/octet-stream'`); never a plaintext-revealing value. */
  readonly contentType?: string;
}

/**
 * Where the ciphertext ended up -- an opaque storage handle, never an asset
 * identity (Slice 2 requirement 8: "storageRef: Where ciphertext lives. Not
 * asset identity."). `providerRef` is deliberately untyped provider-internal
 * detail (a CID, a bucket key, a file id) from this port's own perspective;
 * only the adapter that produced it knows its shape.
 */
export interface StorageRef {
  readonly providerSystem: string;
  readonly providerRef: string;
  readonly storedAt: string;
  readonly sizeBytes: number;
}

export interface ContentStoragePort {
  readonly providerSystem: string;
  store(input: StoreCiphertextInput): Promise<StorageRef>;
}

/**
 * In-memory `ContentStoragePort` -- the default, primary adapter this
 * module's own test suite runs against, and a legitimate low-scale
 * development composition. Deliberately exposes `inspect`, letting tests
 * assert directly on exactly the bytes that "reached the provider boundary"
 * (Slice 2 Test I / Section 22's copy test), something no real remote
 * provider adapter could safely offer as a production API.
 */
export interface InMemoryContentStoragePort extends ContentStoragePort {
  /** Test/inspection-only: returns the exact bytes this port received for `providerRef`, or `undefined` if unknown. Never used by `service.ts` or any production code path. */
  inspect(providerRef: string): Buffer | undefined;
}

export function createInMemoryContentStoragePort(options: { readonly now?: () => string } = {}): InMemoryContentStoragePort {
  const now = options.now ?? (() => new Date().toISOString());
  const stored = new Map<string, Buffer>();
  let counter = 0;

  return {
    providerSystem: 'in-memory',

    async store(input: StoreCiphertextInput): Promise<StorageRef> {
      counter += 1;
      const providerRef = `in-memory-object-${counter}`;
      stored.set(providerRef, Buffer.from(input.ciphertext));
      return { providerSystem: 'in-memory', providerRef, storedAt: now(), sizeBytes: input.ciphertext.length };
    },

    inspect(providerRef: string): Buffer | undefined {
      return stored.get(providerRef);
    },
  };
}

/** A storage adapter that always fails -- used by tests exercising Slice 2 Test L ("Provider failure: Upload fails. No ACTIVE ProtectedResource may exist"). */
export function createAlwaysFailingContentStoragePort(providerSystem = 'always-failing'): ContentStoragePort {
  return {
    providerSystem,
    async store(): Promise<StorageRef> {
      throw new ContentProtectionError('CONTENT_PROTECTION_STORAGE_FAILED', `Storage provider '${providerSystem}' rejected the upload (test double).`);
    },
  };
}
