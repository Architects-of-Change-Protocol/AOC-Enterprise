import { AuthenticationError, NetworkError, PinataError, PinataSDK, ValidationError } from 'pinata';
import type { EnterpriseProviderFailureReason } from '@aoc-enterprise/provider-adapter';

/**
 * The only file in this repository that imports the Pinata SDK (`pinata`).
 *
 * Everything above this file -- `pinata-provider-adapter.ts`, this package's
 * public surface, and every Enterprise contract this package depends on
 * (`@aoc-enterprise/provider-adapter`, `@aoc-enterprise/provider-translation`)
 * -- talks only to the narrow `PinataProviderClient` interface below, never
 * to `PinataSDK` or any other Pinata-specific type directly. This is the
 * concrete instance of R005.0/R005.A/R005.B's Provider Boundary: Enterprise
 * contracts never import a provider SDK; only a Provider Adapter's own
 * provider-specific module does.
 *
 * `classifyThrownError` is where a real Pinata SDK failure (`NetworkError`,
 * `AuthenticationError`, `ValidationError`, or a generic `PinataError` with a
 * `statusCode`) is mapped onto the closed, provider-neutral
 * `EnterpriseProviderFailureReason` vocabulary (`@aoc-enterprise/provider-adapter`).
 * This mapping -- not a raw SDK exception, HTTP status, or stack trace -- is
 * everything `pinata-provider-adapter.ts` ever sees of a Pinata-side failure.
 */

export interface PinataProviderClientConfig {
  /** Pinata JWT used to authenticate every SDK call. Never logged, never echoed back in any result. */
  readonly jwt: string;
  /** Optional dedicated gateway domain (e.g. a custom subdomain) used for signed access links. */
  readonly gateway?: string;
}

export interface PinataTemporaryAccessRequest {
  /** The Pinata CID this access link is issued for. */
  readonly cid: string;
  readonly expiresInSeconds: number;
}

export interface PinataTemporaryAccessResult {
  readonly url: string;
}

export interface PinataMetadataRequest {
  /** Pinata's own file id (not the CID) for the resource whose metadata is requested. */
  readonly resourceId: string;
}

export interface PinataResourceMetadata {
  readonly id: string;
  readonly name: string | null;
  readonly cid: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly keyvalues: Readonly<Record<string, string>>;
  readonly createdAt: string;
}

export interface PinataInvalidateRequest {
  /** Pinata's own file id (not the CID) for the resource to unpin/delete. */
  readonly resourceId: string;
}

export interface PinataInvalidateResult {
  readonly id: string;
  readonly status: string;
}

/**
 * A ciphertext upload request (AOC Enterprise Slice 2, Content Protection).
 * `bytes` is documented here, deliberately, as ciphertext -- this client has
 * no way to enforce that at the type level, but every caller in this
 * repository (`../../../src/enterprise/content-protection/pinata-storage-adapter.ts`)
 * only ever invokes this after `AES-256-GCM` encryption has already run; see
 * that file's own module doc for the invariant this method exists to serve:
 * "Pinata must receive encrypted bytes... Pinata does NOT receive plaintext;
 * raw DEK; KEK; usable decryption capability."
 */
export interface PinataUploadCiphertextRequest {
  /** `Uint8Array` rather than `Buffer` -- keeps this package's type surface independent of Node's `Buffer` global (this package's TypeScript project deliberately does not pull in full `@types/node` ambient globals; see `../../../types/node-shims.d.ts`). A `Buffer` (Node's own `Uint8Array` subclass) satisfies this directly -- no conversion needed at the call site. */
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly contentType?: string;
  /** Safe, non-secret correlation metadata only (e.g. a `protectedResourceId`) -- never plaintext, never key material. */
  readonly keyvalues?: Readonly<Record<string, string>>;
}

export interface PinataUploadCiphertextResult {
  /** Pinata's own internal file id (not the CID) -- a storage handle, matching this package's existing `providerFileId` vs. `providerCid` distinction (see `../../../docs/architecture/ADR-DURABLE-GRANTS-REVOCATION.md`, "GAP-012"). */
  readonly pinataFileId: string;
  readonly cid: string;
  readonly sizeBytes: number;
}

/**
 * The seam this package executes every Pinata operation through. A real
 * implementation (`createPinataProviderClient`) wraps `PinataSDK`; tests
 * substitute a fake implementing this same interface, so no test in this
 * package ever contacts a real Pinata endpoint or requires a real credential.
 *
 * Every method's `Promise` either resolves to the plain, already-normalized
 * shape declared here, or rejects with a `PinataProviderClientError` carrying
 * a closed `EnterpriseProviderFailureReason` -- never a raw SDK exception,
 * HTTP status, or provider-specific object.
 */
export interface PinataProviderClient {
  createTemporaryAccessLink(request: PinataTemporaryAccessRequest): Promise<PinataTemporaryAccessResult>;
  getResourceMetadata(request: PinataMetadataRequest): Promise<PinataResourceMetadata>;
  invalidateResource(request: PinataInvalidateRequest): Promise<PinataInvalidateResult>;
  /** Uploads bytes to Pinata's public network. See `PinataUploadCiphertextRequest`'s doc: every caller in this repository uploads ciphertext only, never plaintext. */
  uploadCiphertext(request: PinataUploadCiphertextRequest): Promise<PinataUploadCiphertextResult>;
}

/**
 * Thrown by `createPinataProviderClient`'s returned methods whenever the
 * underlying Pinata SDK call fails. Carries exactly one already-canonical
 * `EnterpriseProviderFailureReason` (`@aoc-enterprise/provider-adapter`) and a
 * provider-neutral message -- never the original SDK exception, its
 * `statusCode`, or any Pinata-specific object. `pinata-provider-adapter.ts`
 * reads `failureReason` off this error and nothing else.
 */
export class PinataProviderClientError extends Error {
  readonly failureReason: EnterpriseProviderFailureReason;

  constructor(failureReason: EnterpriseProviderFailureReason, message: string) {
    super(message);
    this.name = 'PinataProviderClientError';
    this.failureReason = failureReason;
  }
}

function classifyThrownError(error: unknown): PinataProviderClientError {
  if (error instanceof PinataProviderClientError) return error;

  if (error instanceof AuthenticationError) {
    return new PinataProviderClientError('execution-rejected', 'Pinata rejected the request: authentication failed.');
  }
  if (error instanceof ValidationError) {
    return new PinataProviderClientError('execution-rejected', 'Pinata rejected the request: the request was malformed.');
  }
  if (error instanceof NetworkError) {
    return new PinataProviderClientError('provider-unavailable', 'Pinata could not be reached.');
  }
  if (error instanceof PinataError) {
    const status = error.statusCode;
    if (status === 408 || status === 429) {
      return new PinataProviderClientError('provider-timeout', 'Pinata did not respond within the enforced bound.');
    }
    if (status !== undefined && status >= 500) {
      return new PinataProviderClientError('provider-unavailable', 'Pinata reported a server-side failure.');
    }
    return new PinataProviderClientError('execution-rejected', 'Pinata declined to carry out the request.');
  }

  return new PinataProviderClientError('unexpected-provider-failure', 'An unexpected Pinata provider failure occurred.');
}

/**
 * Builds a real `PinataProviderClient` backed by the official `pinata` SDK.
 *
 * Pinata-specific decisions made here (see the package README for the full
 * rationale):
 * - Temporary access is realized as a *private gateway signed access link*
 *   (`gateways.private.createAccessLink`), keyed by CID -- the nearest Pinata
 *   primitive to "time-bounded, read-only access."
 * - Metadata and invalidation operate against Pinata's *public* network
 *   files API (`files.public.get` / `files.public.delete`), keyed by
 *   Pinata's own file id -- not the CID, which identifies content, not a
 *   pinned file record.
 */
export function createPinataProviderClient(config: PinataProviderClientConfig): PinataProviderClient {
  const sdk = new PinataSDK({ pinataJwt: config.jwt, ...(config.gateway === undefined ? {} : { pinataGateway: config.gateway }) });

  return {
    async createTemporaryAccessLink(request: PinataTemporaryAccessRequest): Promise<PinataTemporaryAccessResult> {
      try {
        const url = await sdk.gateways.private.createAccessLink({ cid: request.cid, expires: request.expiresInSeconds });
        return { url };
      } catch (error) {
        throw classifyThrownError(error);
      }
    },

    async getResourceMetadata(request: PinataMetadataRequest): Promise<PinataResourceMetadata> {
      try {
        const file = await sdk.files.public.get(request.resourceId);
        return {
          id: file.id,
          name: file.name,
          cid: file.cid,
          sizeBytes: file.size,
          mimeType: file.mime_type,
          keyvalues: file.keyvalues,
          createdAt: file.created_at,
        };
      } catch (error) {
        throw classifyThrownError(error);
      }
    },

    async invalidateResource(request: PinataInvalidateRequest): Promise<PinataInvalidateResult> {
      try {
        const [result] = await sdk.files.public.delete([request.resourceId]);
        if (result === undefined) {
          throw new PinataProviderClientError('unexpected-provider-failure', 'Pinata returned no result for the delete request.');
        }
        return { id: result.id, status: result.status };
      } catch (error) {
        throw classifyThrownError(error);
      }
    },

    async uploadCiphertext(request: PinataUploadCiphertextRequest): Promise<PinataUploadCiphertextResult> {
      try {
        // `Uint8Array.from` (rather than passing `request.bytes` directly)
        // guarantees a plain, non-shared `ArrayBuffer` backing -- `File`'s
        // `BlobPart` type rejects a `Uint8Array` that could be backed by a
        // `SharedArrayBuffer`, which `request.bytes`'s wider type permits.
        const file = new File([Uint8Array.from(request.bytes)], request.fileName, { type: request.contentType ?? 'application/octet-stream' });
        const result = await sdk.upload.public.file(file, request.keyvalues !== undefined ? { metadata: { keyvalues: { ...request.keyvalues } } } : {});
        return { pinataFileId: result.id, cid: result.cid, sizeBytes: result.size };
      } catch (error) {
        throw classifyThrownError(error);
      }
    },
  };
}
