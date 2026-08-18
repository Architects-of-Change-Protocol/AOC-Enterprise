export { governedAuthorityPositionKey, governedAuthorityPositionState, isZeroGovernedRightsScope } from './governed-authority-position.js';
export type { GovernedAuthorityPosition, GovernedAuthorityPositionKey, GovernedAuthorityPositionState } from './governed-authority-position.js';

export { isGovernedAuthorityIssuanceBasis } from './governed-authority-basis.js';
export type { GovernedAuthorityBasis, GovernedAuthorityBasisKind } from './governed-authority-basis.js';

export type { GovernedAuthorityTransition } from './governed-authority-transition.js';

export {
  governedAuthorityReservationReducesAvailability,
  governedAuthorityReservationState,
  isGovernedAuthorityAvailable,
} from './governed-authority-reservation.js';
export type {
  GovernedAuthorityAvailability,
  GovernedAuthorityReservation,
  GovernedAuthorityReservationState,
  GovernedAuthorityReservationStatus,
} from './governed-authority-reservation.js';

export { isGovernedAuthorityCovered } from './governed-authority-coverage.js';
export type { GovernedAuthorityCoverage, GovernedAuthorityProviderPort, GovernedAuthorityQuery } from './governed-authority-coverage.js';

export {
  governedRepresentativeAuthorityContainmentBreach,
  governedRepresentativeAuthorityState,
  governedRepresentativeScopeLimitWithin,
} from './governed-representative-authority.js';
export type {
  GovernedRepresentativeAuthority,
  GovernedRepresentativeAuthorityState,
  GovernedRepresentativeContainmentBreach,
  GovernedRepresentativeScopeLimit,
} from './governed-representative-authority.js';

export { isGovernedRepresentativeIssuanceBasis } from './governed-representative-basis.js';
export type { GovernedRepresentativeBasis, GovernedRepresentativeBasisKind } from './governed-representative-basis.js';

export { isGovernedRepresentationCovered } from './governed-representation-coverage.js';
export type {
  GovernedRepresentationCoverage,
  GovernedRepresentationProviderPort,
  GovernedRepresentationQuery,
} from './governed-representation-coverage.js';
