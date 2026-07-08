import type { PilotLegalCompleteness } from './pilot-scope.js';

export type PilotExpectedPolicyBehavior =
  | 'allowed'
  | 'warning'
  | 'denied'
  | 'requires_evidence'
  | 'requires_approval'
  | 'requires_authority'
  | 'requires_external_standing';

export interface PilotPolicyScenario {
  readonly action: string;
  readonly expectedPolicyBehavior: PilotExpectedPolicyBehavior;
  readonly policyDecisionId?: string;
  readonly policyProofId?: string;
  readonly description: string;
}

/**
 * Describes which Domain Policy Pack Runtime packs a pilot depends on.
 * `demoOnly`/`legalCompleteness` are always propagated from the underlying
 * policy pack (see `integrations/policy-pack-pilot-adapter.ts`) -- never
 * upgraded by this feature.
 */
export interface PilotPolicyModel {
  readonly policyPackIds: readonly string[];
  readonly policyPackVersionIds: readonly string[];

  readonly demoOnly: boolean;
  readonly legalCompleteness: PilotLegalCompleteness;

  readonly policyScenarios: readonly PilotPolicyScenario[];

  readonly walkthrough: readonly string[];
}
