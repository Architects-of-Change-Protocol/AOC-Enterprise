import type { EnforcementDecision, EnforcementDecisionType } from '../../action-enforcement/domain/enforcement-decision.js';
import type { EnforcementProof } from '../../action-enforcement/domain/enforcement-proof.js';
import type { PilotExpectedEnforcement } from '../domain/pilot-action.js';

/**
 * Maps a real `EnforcementDecision.type` onto the pilot's coarser
 * `PilotExpectedEnforcement` vocabulary. `undefined` means that decision
 * type has no direct pilot-expectation equivalent (e.g.
 * `duplicate_suppressed`, which pilots do not currently model).
 */
const ENFORCEMENT_TYPE_TO_PILOT_EXPECTATION: Readonly<Record<EnforcementDecisionType, PilotExpectedEnforcement | undefined>> = {
  execute_allowed: 'execute_allowed',
  execution_blocked: 'execution_blocked',
  approval_required: 'approval_required',
  evidence_required: 'evidence_required',
  external_handshake_required: 'external_handshake_required',
  dry_run_allowed: 'dry_run',
  duplicate_suppressed: undefined,
  emergency_denied: 'execution_blocked',
  adapter_denied: 'execution_blocked',
  expired: 'execution_blocked',
  invalid_request: 'execution_blocked',
};

export interface EnforcementBindingSummary {
  readonly enforcementDecisionId: string;
  readonly enforcementProofId?: string;
  readonly decisionType: EnforcementDecisionType;
  readonly allowedToExecute: boolean;
  readonly policyDecisionId?: string;
  readonly policyProofId?: string;
  readonly evidenceProofId?: string;
}

/** Reads an already-decided EnforcementDecision/EnforcementProof -- never reruns execution or produces a new decision. */
export function summarizeEnforcementDecision(decision: EnforcementDecision, proof?: EnforcementProof, evidenceProofId?: string): EnforcementBindingSummary {
  return {
    enforcementDecisionId: decision.id,
    ...(proof !== undefined ? { enforcementProofId: proof.id } : {}),
    decisionType: decision.type,
    allowedToExecute: decision.allowedToExecute,
    ...(decision.policyDecisionId !== undefined ? { policyDecisionId: decision.policyDecisionId } : {}),
    ...(decision.policyProofId !== undefined ? { policyProofId: decision.policyProofId } : {}),
    ...(evidenceProofId !== undefined ? { evidenceProofId } : {}),
  };
}

export function pilotExpectationMatchesEnforcementDecision(expected: PilotExpectedEnforcement, decision: EnforcementDecision): boolean {
  return ENFORCEMENT_TYPE_TO_PILOT_EXPECTATION[decision.type] === expected;
}
