import { buildGlobalBaselineManifestFixture } from '../../../../policy-pack-foundation/fixtures/policy-pack-foundation-fixtures.js';
import { createJurisdictionPackRegistry } from '../../jurisdiction-pack-registry.js';
import type { JurisdictionPackRegistry } from '../../jurisdiction-pack-registry.js';
import { createCostaRicaBaseJurisdictionPack } from './costa-rica-base-pack.js';
import type { JurisdictionPack } from '../../jurisdiction-pack-types.js';

/**
 * Demo fixtures for the Costa Rica Base Pack. Every fixture carries no real
 * Costa Rican law -- these exist to exercise the pack factory, registry,
 * resolver, composer, and adapters deterministically.
 */

export function buildCostaRicaDemoBaselinePackFixture(): JurisdictionPack {
  return createCostaRicaBaseJurisdictionPack();
}

export function buildCostaRicaCustomerValidatedPackFixture(): JurisdictionPack {
  return createCostaRicaBaseJurisdictionPack({ status: 'customer_validated', sourceStatus: 'customer_validated' });
}

export function buildCostaRicaCounselReviewedPackFixture(): JurisdictionPack {
  return createCostaRicaBaseJurisdictionPack({ status: 'counsel_reviewed', sourceStatus: 'counsel_reviewed' });
}

/** A registry with the demo-baseline Costa Rica pack (and no baseline manifest) already registered. */
export function buildCostaRicaJurisdictionPackRegistryFixture(pack: JurisdictionPack = buildCostaRicaDemoBaselinePackFixture()): JurisdictionPackRegistry {
  return createJurisdictionPackRegistry([pack]);
}

/** The global legal baseline manifest fixture this pack declares as a required dependency. */
export { buildGlobalBaselineManifestFixture as buildCostaRicaRequiredBaselineManifestFixture };

export const costaRicaFixture = {
  demoBaselinePack: buildCostaRicaDemoBaselinePackFixture,
  customerValidatedPack: buildCostaRicaCustomerValidatedPackFixture,
  counselReviewedPack: buildCostaRicaCounselReviewedPackFixture,
  registryWithDemoBaselinePack: buildCostaRicaJurisdictionPackRegistryFixture,
  requiredBaselineManifest: buildGlobalBaselineManifestFixture,
} as const;
