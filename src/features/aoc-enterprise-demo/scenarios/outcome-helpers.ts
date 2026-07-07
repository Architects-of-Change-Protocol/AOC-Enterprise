import type { EnforcementOutcome } from '../../action-enforcement/domain/enforcement-outcome.js';
import type { DemoScenarioId } from '../domain/demo-scenario.js';
import type { DemoScenarioOutcome, DemoScenarioOutcomeStatus } from '../domain/demo-outcome.js';

/** Maps a real EnforcementDecision onto the demo pack's outcome vocabulary. Never overrides what the runtime actually decided. */
export function mapEnforcementDecisionToOutcomeStatus(outcome: EnforcementOutcome<unknown>): DemoScenarioOutcomeStatus {
  const { decision, result } = outcome;
  if (decision.type === 'execute_allowed' && result.executed) return 'executed';
  if (decision.type === 'dry_run_allowed') return 'dry_run_allowed';
  if (decision.type === 'approval_required') return 'approval_required';
  if (decision.type === 'evidence_required') return 'evidence_required';
  if (decision.type === 'duplicate_suppressed') return 'duplicate_suppressed';
  if (decision.type === 'emergency_denied') return 'emergency_denied';
  return 'blocked';
}

export function buildScenarioOutcome(
  scenarioId: DemoScenarioId,
  outcome: EnforcementOutcome<unknown>,
  executorRan: boolean,
  statusOverride?: DemoScenarioOutcomeStatus,
): DemoScenarioOutcome {
  const status = statusOverride ?? mapEnforcementDecisionToOutcomeStatus(outcome);
  return {
    scenarioId,
    status,
    success: status === 'executed',
    reasonCode: outcome.decision.reasonCode,
    reason: outcome.decision.reason,
    enforcementRequestId: outcome.request.id,
    enforcementDecisionId: outcome.decision.id,
    executionResultId: outcome.result.id,
    ...(outcome.decision.recognitionDecisionId !== undefined ? { recognitionDecisionId: outcome.decision.recognitionDecisionId } : {}),
    ...(outcome.decision.authorityProofId !== undefined ? { authorityProofId: outcome.decision.authorityProofId } : {}),
    ...(outcome.decision.approvalProofId !== undefined ? { approvalProofId: outcome.decision.approvalProofId } : {}),
    ...(outcome.decision.handshakeProofId !== undefined ? { handshakeProofId: outcome.decision.handshakeProofId } : {}),
    ...(outcome.proof?.proofHash !== undefined ? { proofHash: outcome.proof.proofHash } : {}),
    executorRan,
    sideEffectsExecuted: outcome.result.executed,
  };
}
