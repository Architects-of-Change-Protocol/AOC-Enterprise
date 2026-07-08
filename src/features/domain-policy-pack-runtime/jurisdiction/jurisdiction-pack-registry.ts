import type { PolicyPackManifest } from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import { validateJurisdictionPack } from './jurisdiction-pack-validator.js';
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
 *
 * `register` runs `validateJurisdictionPack` and throws on an invalid pack
 * (wrong kind/domain/scope, dropped safe framing, a status outside
 * `JurisdictionValidationStatus`, or a missing jurisdiction descriptor) --
 * this applies uniformly whether the pack came from `createJurisdictionPack`
 * or was reconstructed via `fromPolicyPackManifest`/deserialized JSON, so an
 * invalid pack can never reach `listByJurisdiction`/`resolveJurisdictionPacks`.
 */
export function createJurisdictionPackRegistry(initial?: readonly JurisdictionPack[]): JurisdictionPackRegistry {
  const packsById = new Map<string, JurisdictionPack>();

  function register(pack: JurisdictionPack): void {
    const validation = validateJurisdictionPack(pack);
    if (!validation.valid) {
      throw new Error(`Cannot register invalid jurisdiction pack "${pack.manifest.id}": ${validation.errors.join(' ')}`);
    }
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
