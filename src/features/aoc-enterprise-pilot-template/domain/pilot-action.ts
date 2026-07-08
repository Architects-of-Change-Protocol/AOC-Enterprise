import type { PilotCapabilityRiskLevel } from './pilot-capability.js';

export type PilotExpectedRecognition = 'allowed' | 'requires_evidence' | 'denied';
export type PilotExpectedAuthority = 'valid' | 'missing' | 'invalid' | 'not_required';
export type PilotExpectedApproval = 'not_required' | 'required' | 'approved' | 'rejected' | 'pending';
export type PilotExpectedPolicy =
  | 'allowed'
  | 'warning'
  | 'denied'
  | 'requires_evidence'
  | 'requires_approval'
  | 'requires_authority'
  | 'requires_external_standing'
  | 'not_applicable';
export type PilotExpectedEvidence = 'not_required' | 'missing' | 'satisfied' | 'rejected' | 'expired';
export type PilotExpectedEnforcement =
  | 'execute_allowed'
  | 'execution_blocked'
  | 'approval_required'
  | 'evidence_required'
  | 'external_handshake_required'
  | 'dry_run';
export type PilotExpectedExecution = 'executed' | 'not_executed';

/**
 * A single sample action a pilot template exercises, with the pilot
 * author's expected outcome at every governance layer. These `expected*`
 * fields are the pilot's own hypothesis -- they are checked, never assumed,
 * against real runtime output by the binding/acceptance services.
 */
export interface PilotAction {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  readonly actorId: string;
  readonly agentId?: string;

  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;

  readonly riskLevel: PilotCapabilityRiskLevel;

  readonly expectedRecognition: PilotExpectedRecognition;
  readonly expectedAuthority: PilotExpectedAuthority;
  readonly expectedApproval: PilotExpectedApproval;
  readonly expectedPolicy: PilotExpectedPolicy;
  readonly expectedEvidence: PilotExpectedEvidence;
  readonly expectedEnforcement: PilotExpectedEnforcement;
  readonly expectedExecution: PilotExpectedExecution;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
