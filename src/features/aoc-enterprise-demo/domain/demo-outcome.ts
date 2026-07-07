import type { DemoScenarioId } from './demo-scenario.js';

export type DemoScenarioOutcomeStatus =
  | 'executed'
  | 'blocked'
  | 'approval_required'
  | 'evidence_required'
  | 'duplicate_suppressed'
  | 'dry_run_allowed'
  | 'emergency_denied';

export interface DemoScenarioOutcome {
  readonly scenarioId: DemoScenarioId;
  readonly status: DemoScenarioOutcomeStatus;
  readonly success: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly enforcementRequestId?: string;
  readonly enforcementDecisionId?: string;
  readonly executionResultId?: string;
  readonly recognitionDecisionId?: string;
  readonly authorityProofId?: string;
  readonly approvalProofId?: string;
  readonly handshakeProofId?: string;
  readonly proofHash?: string;
  readonly executorRan: boolean;
  readonly sideEffectsExecuted: boolean;
}
