import type { DemoAssertionDefinition } from './demo-assertion.js';
import type { DemoScenarioOutcomeStatus } from './demo-outcome.js';
import type { DemoRiskLevel } from './demo-risk.js';
import type { DemoStepDefinition } from './demo-step.js';

export type DemoScenarioId =
  | 'internal-agent-allowed'
  | 'approval-required-block'
  | 'approval-unlocks-execution'
  | 'evidence-required-block'
  | 'external-agent-limited-visa'
  | 'expired-visa-block'
  | 'adapter-denies-dangerous-action'
  | 'idempotency-duplicate-suppressed'
  | 'emergency-deny-shutdown'
  | 'full-proof-chain-audit'
  | 'policy-pack-payment-approval-required'
  | 'policy-pack-bank-account-change-denied'
  | 'policy-pack-invoice-evidence-required'
  | 'policy-pack-sensitive-data-export-requires-compliance'
  | 'policy-pack-prohibited-data-export-denied'
  | 'policy-pack-sports-settlement-event-record-required'
  | 'policy-pack-low-risk-read-warning-allowed'
  | 'policy-pack-control-plane-walkthrough';

export type DemoScenarioCategory =
  | 'recognition'
  | 'authority'
  | 'approval'
  | 'external_agents'
  | 'enforcement'
  | 'audit'
  | 'enterprise_story'
  | 'policy_packs';

export interface DemoScenario {
  readonly id: DemoScenarioId;
  readonly title: string;
  readonly shortTitle: string;
  readonly category: DemoScenarioCategory;
  readonly summary: string;
  readonly enterpriseMessage: string;
  readonly buyerPain: string;
  readonly aocValue: string;
  readonly personas: readonly string[];
  readonly primaryActorId: string;
  readonly trustDomainId: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly riskLevel: DemoRiskLevel;
  readonly expectedOutcome: DemoScenarioOutcomeStatus;
  readonly steps: readonly DemoStepDefinition[];
  readonly expectedAssertions: readonly DemoAssertionDefinition[];
  readonly tags: readonly string[];
}
