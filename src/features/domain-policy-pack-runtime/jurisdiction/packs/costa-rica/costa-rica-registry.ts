import type { JurisdictionPack } from '../../jurisdiction-pack-types.js';
import type { JurisdictionPackRegistry } from '../../jurisdiction-pack-registry.js';
import { COSTA_RICA_JURISDICTION_ID } from './costa-rica-constants.js';

/**
 * Registry integration for the Costa Rica Base Pack. This never introduces a
 * second registry or a country-code index of its own: it filters the shared
 * `JurisdictionPackRegistry`'s own `listByJurisdiction`/`list` output by the
 * `countryCode` each registered pack's own `JurisdictionDescriptor` already
 * carries.
 */
export function findCostaRicaJurisdictionPacks(registry: JurisdictionPackRegistry): readonly JurisdictionPack[] {
  return registry.listByJurisdiction(COSTA_RICA_JURISDICTION_ID);
}

export function findJurisdictionPacksByCountryCode(registry: JurisdictionPackRegistry, countryCode: string): readonly JurisdictionPack[] {
  return registry.list().filter((pack) => pack.jurisdiction.countryCode === countryCode);
}
