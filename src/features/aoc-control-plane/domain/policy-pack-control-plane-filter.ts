export interface PolicyPackControlPlaneFilter {
  readonly packId?: string;
  readonly versionId?: string;
  readonly ruleId?: string;
  readonly decisionType?: string;
  readonly action?: string;
  readonly actorId?: string;
  readonly resourceScope?: string;
  readonly jurisdiction?: string;
  readonly country?: string;
  readonly domain?: string;
  readonly demoOnly?: boolean;
  readonly legalCompleteness?: string;
  readonly allowed?: boolean;
  readonly search?: string;
}

export const EMPTY_POLICY_PACK_FILTER: PolicyPackControlPlaneFilter = {};
