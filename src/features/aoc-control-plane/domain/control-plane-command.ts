export type ControlPlaneCommandType =
  | 'approve_approval_request'
  | 'reject_approval_request'
  | 'request_approval_changes'
  | 'escalate_approval'
  | 'revoke_approval_proof'
  | 'revoke_authority_grant'
  | 'revoke_delegation_grant'
  | 'revoke_agent_visa'
  | 'revoke_ingress_grant'
  | 'dry_run_enforcement'
  | 'retry_failed_enforcement';

export interface ControlPlaneCommandResult {
  readonly id: string;
  readonly type: ControlPlaneCommandType;
  readonly success: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly affectedEntityIds: readonly string[];
  readonly createdEventIds?: readonly string[];
  readonly createdProofIds?: readonly string[];
  readonly executedAt: string;
}

export interface ControlPlaneCommandRequest {
  readonly type: ControlPlaneCommandType;
  readonly targetId: string;
  readonly actingActorId: string;
  readonly reason?: string;
}
