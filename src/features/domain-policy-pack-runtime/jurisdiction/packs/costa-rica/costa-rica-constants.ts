/**
 * Soberanía Jurisdiction Costa Rica Base Pack v1 -- shared identifiers.
 *
 * This module carries no real Costa Rican law. `countryCode`/`jurisdictionId`
 * are opaque identifiers used to route composition and registry lookups, not
 * a claim that any Costa Rican legal requirement is encoded, satisfied, or
 * certified. See this pack's README for the full safety framing.
 */

/** ISO-3166-1 alpha-2 country code this pack is scoped to. Never used as a compliance claim. */
export const COSTA_RICA_JURISDICTION_COUNTRY_CODE = 'CR' as const;

/** The `JurisdictionDescriptor.jurisdictionId` this pack registers under -- an opaque routing key, not a legal determination. */
export const COSTA_RICA_JURISDICTION_ID = 'costa_rica' as const;

export const COSTA_RICA_JURISDICTION_LABEL = 'Costa Rica' as const;

export const COSTA_RICA_BASE_PACK_ID = 'aoc.jurisdiction.costa_rica.base.v1' as const;

export const COSTA_RICA_BASE_PACK_NAME = 'Soberanía Jurisdiction Costa Rica Base Pack v1' as const;

export const COSTA_RICA_BASE_PACK_VERSION = '1.0.0' as const;

/**
 * The global legal baseline pack this Costa Rica pack declares as a required
 * dependency, matching the id `policy-pack-foundation`'s own
 * `buildGlobalBaselineManifestFixture` and the pre-existing
 * `domain-policy-pack-runtime` `GLOBAL_LEGAL_BASELINE_POLICY_PACK_ID` both
 * use. This module never fabricates that pack -- it only references its id;
 * composition fails closed (see `costa-rica-resolution.ts`) if no manifest
 * with this id is actually available.
 */
export const COSTA_RICA_REQUIRED_BASELINE_PACK_ID = 'aoc.global_legal_baseline.v1' as const;
