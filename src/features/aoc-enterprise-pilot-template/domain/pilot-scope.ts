export type PilotEnvironment = 'demo_only' | 'sandbox' | 'customer_non_production' | 'production_shadow_mode';

export type PilotDataSensitivity =
  | 'synthetic_only'
  | 'customer_non_sensitive'
  | 'customer_sensitive_redacted'
  | 'customer_sensitive_controlled';

export type PilotLegalCompleteness =
  | 'not_legal_advice'
  | 'demo_policy_model'
  | 'customer_policy_model'
  | 'customer_validated'
  | 'counsel_validated';

/**
 * The bounded, explicit scope of a single pilot. `legalCompleteness` is
 * always caller-asserted -- this feature never upgrades it on its own (see
 * README "Legal / compliance disclaimer").
 */
export interface PilotScope {
  readonly inScope: readonly string[];
  readonly outOfScope: readonly string[];

  readonly durationDays: number;

  readonly environments: PilotEnvironment;
  readonly dataSensitivity: PilotDataSensitivity;
  readonly legalCompleteness: PilotLegalCompleteness;

  readonly assumptions: readonly string[];
  readonly constraints: readonly string[];
}
