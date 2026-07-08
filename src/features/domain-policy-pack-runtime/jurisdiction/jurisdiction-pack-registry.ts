import type { PolicyPackManifest } from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import type { JurisdictionPack } from './jurisdiction-pack-types.js';

export interface JurisdictionPackRegistry {
  register(pack: JurisdictionPack): void;
  get(packId: string): JurisdictionPack | undefined;
  list(): readonly JurisdictionPack[];
  listByJurisdiction(jurisdictionId: string): readonly JurisdictionPack[];
  /** The manifests of every registered pack -- the exact shape `composePolicyPacks` expects as its `availableManifests` pool. */
  listManifests(): readonly PolicyPackManifest[];
}

/**
 * A deterministic, in-memory jurisdiction pack registry keyed by
 * `manifest.id`. Registration order is preserved for `list()`; there is no
 * clock, no randomness, and no persistence -- callers own storage.
 */
export function createJurisdictionPackRegistry(initial?: readonly JurisdictionPack[]): JurisdictionPackRegistry {
  const packsById = new Map<string, JurisdictionPack>();

  function register(pack: JurisdictionPack): void {
    packsById.set(pack.manifest.id, pack);
  }

  for (const pack of initial ?? []) register(pack);

  return {
    register,
    get: (packId) => packsById.get(packId),
    list: () => [...packsById.values()],
    listByJurisdiction: (jurisdictionId) => [...packsById.values()].filter((pack) => pack.jurisdiction.jurisdictionId === jurisdictionId),
    listManifests: () => [...packsById.values()].map((pack) => pack.manifest),
  };
}
