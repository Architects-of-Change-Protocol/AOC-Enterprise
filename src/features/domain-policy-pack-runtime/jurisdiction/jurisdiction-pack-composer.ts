import type { PolicyPackManifest } from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import { composePolicyPacks } from '../../policy-pack-foundation/composition/policy-pack-composer.js';
import type { PolicyPackCompositionResult } from '../../policy-pack-foundation/composition/policy-pack-composition-types.js';
import type { JurisdictionPack, JurisdictionValidationStatus } from './jurisdiction-pack-types.js';

export interface ComposeJurisdictionWithBaselineInput {
  readonly compositionId: string;
  readonly jurisdictionPack: JurisdictionPack;
  readonly baselinePackId: string;
  readonly availableManifests: readonly PolicyPackManifest[];
  readonly requiredValidationStatus?: readonly JurisdictionValidationStatus[];
}

/**
 * Composes a jurisdiction pack with a baseline pack (e.g. a global legal
 * baseline). This is not a separate dependency-resolution engine: it calls
 * `composePolicyPacks` with the jurisdiction pack's own manifest id as the
 * composition root and the baseline pack id as a requested dependency, and
 * returns the exact `PolicyPackCompositionResult` shape `composePolicyPacks`
 * produces for any other pack kind -- missing/expired/superseded/disabled
 * baseline handling, safe-framing combination, and decision priority all
 * come from the shared composer, not a jurisdiction-specific copy of it.
 */
export function composeJurisdictionWithBaseline(input: ComposeJurisdictionWithBaselineInput): PolicyPackCompositionResult {
  return composePolicyPacks({
    compositionId: input.compositionId,
    rootPackId: input.jurisdictionPack.manifest.id,
    requestedPackIds: [input.baselinePackId],
    // The explicit jurisdiction pack manifest goes last: composePolicyPacks builds its
    // internal id -> manifest map from this array in order, so a later entry wins. If a
    // caller's availableManifests happens to also carry an entry for this pack's id (e.g.
    // a full registry dump), the explicit manifest passed in here must still be the one
    // used as the composition root, not a possibly-stale duplicate.
    availableManifests: [...input.availableManifests, input.jurisdictionPack.manifest],
    ...(input.requiredValidationStatus !== undefined ? { requiredValidationStatus: input.requiredValidationStatus } : {}),
  });
}
