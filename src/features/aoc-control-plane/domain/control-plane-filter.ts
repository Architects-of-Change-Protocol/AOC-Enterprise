import type { AocGovernanceSource } from './control-plane-navigation.js';

export interface AocControlPlaneFilter {
  readonly trustDomainId?: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly capability?: string;
  readonly resourceScope?: string;
  readonly status?: string;
  readonly source?: AocGovernanceSource;
  readonly riskLevel?: string;
  readonly search?: string;
}

export const EMPTY_FILTER: AocControlPlaneFilter = {};
