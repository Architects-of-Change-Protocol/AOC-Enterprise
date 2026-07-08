import type { PolicyPackManifest } from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import { composePolicyPacks } from '../../policy-pack-foundation/composition/policy-pack-composer.js';
import type { JurisdictionPackRegistry } from './jurisdiction-pack-registry.js';
import type { JurisdictionPackResolution, JurisdictionValidationStatus } from './jurisdiction-pack-types.js';

export interface ResolveJurisdictionPacksInput {
  readonly compositionId: string;
  readonly jurisdictionId: string;
  readonly registry: JurisdictionPackRegistry;
  readonly baselineManifests?: readonly PolicyPackManifest[];
  readonly requiredValidationStatus?: JurisdictionValidationStatus;
}

/**
 * Resolves every jurisdiction pack registered for `jurisdictionId` against
 * `requiredValidationStatus`. This never re-derives satisfaction itself: each
 * pack is resolved by calling `composePolicyPacks` with that single pack as
 * the composition root, so `validationStatusSatisfied` and `decision` come
 * directly from the shared composition/validation-status machinery (which in
 * turn calls `satisfiesPolicyPackValidationStatus`). A jurisdiction-only
 * trust lattice does not exist in this module.
 */
export function resolveJurisdictionPacks(input: ResolveJurisdictionPacksInput): readonly JurisdictionPackResolution[] {
  const packs = input.registry.listByJurisdiction(input.jurisdictionId);
  const availableManifests = [...(input.baselineManifests ?? []), ...input.registry.listManifests()];

  return packs.map((pack) => {
    const composition = composePolicyPacks({
      compositionId: `${input.compositionId}.${pack.manifest.id}`,
      rootPackId: pack.manifest.id,
      requestedPackIds: [],
      availableManifests,
      requiredValidationStatus: input.requiredValidationStatus !== undefined ? [input.requiredValidationStatus] : [],
    });

    return {
      packId: pack.manifest.id,
      jurisdiction: pack.jurisdiction,
      composition,
      validationStatusSatisfied: composition.validationStatusSatisfied,
      decision: composition.decision,
    };
  });
}
