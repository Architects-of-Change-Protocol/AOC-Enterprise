import type { JurisdictionDescriptor } from '../../jurisdiction-pack-types.js';
import { COSTA_RICA_JURISDICTION_COUNTRY_CODE, COSTA_RICA_JURISDICTION_ID, COSTA_RICA_JURISDICTION_LABEL } from './costa-rica-constants.js';

/**
 * A `JurisdictionDescriptor`, extended with the narrow set of extra fields
 * this pack's action-context evaluation needs (`known`/`ambiguous`/
 * `conflictDetected`/`notes`). This mirrors the existing convention in
 * `jurisdiction-pack-types.ts` of layering pack-specific fields onto a shared
 * shape instead of replacing it -- every value returned here is still a
 * fully valid `JurisdictionDescriptor`.
 *
 * `known: true` states only that the declared jurisdiction context is Costa
 * Rica -- it never means the action is compliant with, valid under, or
 * certified against Costa Rican law.
 */
export interface CostaRicaJurisdictionDescriptor extends JurisdictionDescriptor {
  readonly known: boolean;
  readonly ambiguous: boolean;
  readonly conflictDetected: boolean;
  readonly notes: string;
}

export function createCostaRicaJurisdictionDescriptor(): CostaRicaJurisdictionDescriptor {
  return {
    jurisdictionId: COSTA_RICA_JURISDICTION_ID,
    label: COSTA_RICA_JURISDICTION_LABEL,
    countryCode: COSTA_RICA_JURISDICTION_COUNTRY_CODE,
    known: true,
    ambiguous: false,
    conflictDetected: false,
    notes: 'Costa Rica jurisdiction context descriptor for policy-pack evaluation. Does not imply legal compliance.',
  };
}
