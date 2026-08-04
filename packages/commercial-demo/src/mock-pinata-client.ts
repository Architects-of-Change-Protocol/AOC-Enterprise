import type {
  PinataInvalidateRequest,
  PinataInvalidateResult,
  PinataMetadataRequest,
  PinataProviderClient,
  PinataResourceMetadata,
  PinataTemporaryAccessRequest,
  PinataTemporaryAccessResult,
} from '@aoc-enterprise/pinata-adapter';
import { PinataProviderClientError } from '@aoc-enterprise/pinata-adapter';
import type { EnterpriseProviderFailureReason } from '@aoc-enterprise/provider-adapter';
import { PINATA_CID, PINATA_FILE_ID, RESOURCE_DESCRIPTOR, RESOURCE_INTEGRITY } from './scenario.js';

/**
 * An in-memory stand-in for `PinataProviderClient`
 * (`@aoc-enterprise/pinata-adapter`), used in place of
 * `createPinataProviderClient({ jwt })` so this demo never requires a real
 * Pinata account, JWT, or network call. This is the sanctioned "mock mode"
 * for the Pinata adapter: `executePinataProviderTranslation` accepts any
 * object implementing `PinataProviderClient`, and never knows or cares
 * whether it is talking to the real Pinata SDK or this fixture -- the same
 * dependency-injection seam `packages/pinata-adapter/__tests__` already
 * uses. Nothing here imports the `pinata` package.
 */
export function createMockPinataProviderClient(): PinataProviderClient {
  return {
    async createTemporaryAccessLink(request: PinataTemporaryAccessRequest): Promise<PinataTemporaryAccessResult> {
      return { url: `https://meridian-diligence.mypinata.cloud/files/${request.cid}?access-link=demo-${Date.now()}` };
    },

    async getResourceMetadata(request: PinataMetadataRequest): Promise<PinataResourceMetadata> {
      return {
        id: request.resourceId,
        name: RESOURCE_DESCRIPTOR.displayName ?? null,
        cid: PINATA_CID,
        sizeBytes: RESOURCE_INTEGRITY.sizeBytes ?? 0,
        mimeType: RESOURCE_DESCRIPTOR.contentType ?? 'application/octet-stream',
        keyvalues: { classification: 'confidential', matter: 'project-solstice' },
        createdAt: '2026-08-04T09:00:00.000Z',
      };
    },

    async invalidateResource(request: PinataInvalidateRequest): Promise<PinataInvalidateResult> {
      return { id: request.resourceId, status: 'unpinned' };
    },
  };
}

/**
 * A `PinataProviderClient` that always fails, for the "Provider Failure"
 * demonstration (Phase 6): every operation rejects with the same
 * `PinataProviderClientError` a real Pinata SDK failure would be classified
 * into by `pinata-provider-client.ts`'s own `classifyThrownError`. This
 * proves `executePinataProviderTranslation` normalizes a provider-side
 * outage into a canonical `EnterpriseProviderFailureReason` -- never a raw
 * exception, HTTP status, or stack trace -- without needing a real Pinata
 * outage to observe it.
 */
export function createUnavailablePinataProviderClient(
  reason: EnterpriseProviderFailureReason = 'provider-unavailable',
  message = 'Pinata could not be reached.',
): PinataProviderClient {
  const fail = (): never => {
    throw new PinataProviderClientError(reason, message);
  };
  return {
    createTemporaryAccessLink: () => Promise.resolve().then(fail),
    getResourceMetadata: () => Promise.resolve().then(fail),
    invalidateResource: () => Promise.resolve().then(fail),
  };
}
