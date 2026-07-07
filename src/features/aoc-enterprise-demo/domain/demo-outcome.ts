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

  /**
   * Populated only when Action Enforcement's preflight actually consulted a
   * Domain Policy Pack Runtime integration for this request (i.e. the
   * enforcement decision carried these fields itself -- see
   * `EnforcementDecision.policyDecisionId` in
   * action-enforcement/domain/enforcement-decision.ts). Absent for every
   * scenario that does not run through a policy-pack-configured guard.
   */
  readonly policyDecisionId?: string;
  readonly policyProofId?: string;
  readonly policyPackVersionIds?: readonly string[];
  readonly policyMatchedRuleIds?: readonly string[];
  readonly policyReasonCode?: string;
  readonly policyReason?: string;
}
