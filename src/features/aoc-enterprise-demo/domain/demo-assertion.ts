import type { DemoScenarioId } from './demo-scenario.js';

export type DemoAssertionType =
  | 'recognition_decision'
  | 'authority_proof'
  | 'approval_state'
  | 'handshake_state'
  | 'enforcement_decision'
  | 'execution_result'
  | 'side_effect_state'
  | 'proof_chain'
  | 'control_plane_row'
  | 'executor_safety'
  | 'policy_decision';

export interface DemoAssertionDefinition {
  readonly id: string;
  readonly type: DemoAssertionType;
  readonly title: string;
  readonly description: string;
  readonly expected: string;
}

export interface DemoAssertionResult {
  readonly id: string;
  readonly scenarioId: DemoScenarioId;
  readonly assertionId: string;
  readonly type: DemoAssertionType;
  readonly passed: boolean;
  readonly expected: string;
  readonly actual: string;
  readonly reasonCode: string;
  readonly reason: string;
}
