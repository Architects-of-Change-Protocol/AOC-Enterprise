import { contentIdentityKey } from '@aoc/protocol/identity';
import type { ContentIdentity, SovereignAssetId } from '@aoc/protocol/identity';
import type { SignedSovereignManifest, SovereignAssetRegistry } from '@aoc/protocol/manifest';

import { ContentProtectionError } from './errors.js';

export const SOVEREIGN_BINDING_GATE = 'INTEGRATED_WITH_PROTOCOL' as const;

/** Enterprise infrastructure behind Protocol's public SovereignAssetRegistry contract. */
export function createInMemorySovereignAssetRegistry(): SovereignAssetRegistry {
  const versions = new Map<string, SignedSovereignManifest>();
  const latest = new Map<SovereignAssetId, SignedSovereignManifest>();

  return {
    register(signed) {
      const { sovereignAssetId, manifestVersion } = signed.manifest;
      const key = `${sovereignAssetId}:${manifestVersion}`;
      const existing = versions.get(key);
      if (existing !== undefined && existing.manifestDigest !== signed.manifestDigest) {
        throw new ContentProtectionError(
          'CONTENT_PROTECTION_HISTORICAL_MANIFEST_SUBSTITUTION',
          `Manifest version ${manifestVersion} for sovereign asset '${sovereignAssetId}' is already registered with a different digest.`,
        );
      }
      versions.set(key, signed);
      const current = latest.get(sovereignAssetId);
      if (current === undefined || current.manifest.manifestVersion < manifestVersion) latest.set(sovereignAssetId, signed);
    },
    resolve(sovereignAssetId) {
      return latest.get(sovereignAssetId) ?? null;
    },
    resolveVersion(sovereignAssetId, manifestVersion) {
      return versions.get(`${sovereignAssetId}:${manifestVersion}`) ?? null;
    },
    findByContentDigest(contentIdentity: ContentIdentity) {
      const target = contentIdentityKey(contentIdentity);
      return [...versions.values()].filter((signed) => contentIdentityKey(signed.manifest.contentIdentity) === target);
    },
  };
}
