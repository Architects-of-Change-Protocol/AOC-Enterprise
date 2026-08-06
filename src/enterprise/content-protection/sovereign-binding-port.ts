import { ContentProtectionError } from './errors.js';

/**
 * The integration seam this slice's task description requires: "Before
 * implementation determine whether the integrated/current Protocol
 * dependency already exports the new Sovereign Asset contract. If NO...
 * Implement the generic Enterprise protected-resource foundation
 * independently and place the Protocol binding behind an explicit
 * integration port/gate."
 *
 * Verified directly against the vendored `@aoc/protocol@0.1.0` tarball this
 * repository actually consumes (`vendor/aoc-protocol-0.1.0.tgz`, see
 * `vendor/README.md`): its full type surface (`dist/contracts`, `dist/claims`,
 * `dist/adapters`, `dist/runtime-registry`) was grepped case-insensitively
 * for `sovereign` and `contentDigest` -- zero matches. `@aoc/protocol` does
 * not yet export `SovereignAssetId`, `SovereignManifest`, `contentDigest`,
 * `resolveSovereignAsset()`, or `verifySovereignManifest()` in any form.
 *
 * This module therefore defines its OWN, provisional, Enterprise-side
 * shapes below (`SovereignManifest`, `SovereignAssetBindingPort`) --
 * deliberately named to mirror what the future Protocol export is expected
 * to look like, so that swapping in a real `@aoc/protocol`-backed
 * implementation later requires changing only this file's default wiring,
 * never `service.ts`'s call sites or `contracts.ts`'s
 * `ContentProtectionSovereignBinding` shape. This is NOT a shadow
 * implementation of a Protocol contract (the task's explicit prohibition):
 * it mints nothing, resolves nothing, and verifies nothing on its own --
 * `createBlockedSovereignAssetBindingPort` below is the only implementation
 * wired by this repository's own composition, and it does exactly one
 * thing: refuse, with a truthful, specific reason.
 *
 * **`SOVEREIGN_BINDING_GATE = 'BLOCKED_BY_PROTOCOL'`.** This does not
 * prevent Enterprise from protecting ordinary, non-sovereign-bound
 * resources (Slice 2 requirement 3) -- `service.ts`'s `protectResource`
 * only ever consults this port when a caller explicitly requests
 * sovereign-bound protection (`request.sovereignAssetId` is present).
 */

export const SOVEREIGN_BINDING_GATE = 'BLOCKED_BY_PROTOCOL' as const;

/**
 * Provisional shape mirroring the Protocol export this slice expects
 * (`SovereignManifest`/`contentDigest`). Every field is meant to be
 * Protocol-supplied verbatim once a real binding exists -- Enterprise never
 * populates this itself from anything other than a genuine Protocol
 * response.
 */
export interface SovereignManifest {
  readonly sovereignAssetId: string;
  readonly sovereignVersion?: string;
  /** Protocol's own canonical content digest for this asset version -- copied verbatim, never recomputed by Enterprise. */
  readonly contentDigest: string;
}

export interface ResolveSovereignAssetRequest {
  readonly sovereignAssetId: string;
  readonly sovereignVersion?: string;
}

/**
 * Mirrors Protocol's expected `resolveSovereignAsset()` / `verifySovereignManifest()`
 * verification surface (task description section 3). `resolveSovereignAsset`
 * fetches the manifest; `verifySovereignManifest` independently confirms it
 * is genuine (signature/authority checks Enterprise does not itself
 * implement -- that is exactly the verification authority this port exists
 * to delegate, never to reimplement). Both are async and both may reject;
 * `service.ts` treats any rejection as fail-closed.
 */
export interface SovereignAssetBindingPort {
  readonly kind: string;
  resolveSovereignAsset(request: ResolveSovereignAssetRequest): Promise<SovereignManifest>;
  verifySovereignManifest(manifest: SovereignManifest): Promise<boolean>;
}

/**
 * The only `SovereignAssetBindingPort` this repository's own composition
 * wires up today. Both methods reject immediately, before attempting any
 * network call or lookup, naming exactly the missing Protocol export so a
 * caller (or this module's own error message) never has to guess why.
 */
export function createBlockedSovereignAssetBindingPort(): SovereignAssetBindingPort {
  function blocked(): never {
    throw new ContentProtectionError(
      'CONTENT_PROTECTION_SOVEREIGN_BINDING_BLOCKED',
      "SOVEREIGN_BINDING_GATE = BLOCKED_BY_PROTOCOL: the vendored @aoc/protocol@0.1.0 dependency exports no SovereignAssetId/SovereignManifest/contentDigest contract and no resolveSovereignAsset()/verifySovereignManifest() verification surface. Sovereign-bound protection cannot be attempted; ordinary (non-sovereign-bound) resource protection is unaffected.",
      { gate: SOVEREIGN_BINDING_GATE },
    );
  }

  return {
    kind: 'blocked-by-protocol',
    async resolveSovereignAsset(): Promise<SovereignManifest> {
      blocked();
    },
    async verifySovereignManifest(): Promise<boolean> {
      blocked();
    },
  };
}
