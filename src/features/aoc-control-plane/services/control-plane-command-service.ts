import type { ApprovalRuntime } from '../../approval-runtime/runtime/approval-runtime.js';
import type { AuthorityGraphRuntime } from '../../authority-graph/runtime/authority-graph-runtime.js';
import type { ExternalAgentHandshakeRuntime } from '../../external-agent-handshake/runtime/external-agent-handshake-runtime.js';
import type { AocGuard } from '../../action-enforcement/sdk/aoc-guard.js';
import type { SideEffectType } from '../../action-enforcement/domain/side-effect.js';
import type { ControlPlaneCommandResult } from '../domain/control-plane-command.js';

export interface Clock {
  now(): string;
}

export interface ControlPlaneCommandRuntimes {
  readonly approvalRuntime: ApprovalRuntime;
  readonly authorityRuntime: AuthorityGraphRuntime;
  readonly handshakeRuntime: ExternalAgentHandshakeRuntime;
  readonly aocGuard: AocGuard;
}

export interface ApprovalDecisionCommandInput {
  readonly approvalRequestId: string;
  readonly approverActorId: string;
  readonly reason?: string;
}

export interface RevokeCommandInput {
  readonly targetId: string;
  readonly revokedByActorId: string;
  readonly reason: string;
}

export interface DryRunEnforcementCommandInput {
  readonly actorId: string;
  readonly principalActorId?: string;
  readonly trustDomainId: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly sideEffectType?: SideEffectType;
  /** Passed through to Recognition Runtime's structural bridge (passportId/capabilityTokenId/evidence), same as a live enforcement request. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

function nowId(prefix: string, targetId: string): string {
  return `${prefix}-${targetId}`;
}

/**
 * Every method here calls the real runtime service for its module and
 * reports exactly what the runtime returned. Nothing is faked: a command
 * that has no first-class runtime method (retryFailedEnforcement) is always
 * reported as unavailable rather than simulating a result.
 */
export class ControlPlaneCommandService {
  constructor(
    private readonly runtimes: ControlPlaneCommandRuntimes,
    private readonly clock: Clock,
  ) {}

  approveApprovalRequest(input: ApprovalDecisionCommandInput): ControlPlaneCommandResult {
    const result = this.runtimes.approvalRuntime.approve({
      approvalRequestId: input.approvalRequestId,
      approverActorId: input.approverActorId,
      evidenceReviewed: [],
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    return {
      id: nowId('command-approve', input.approvalRequestId),
      type: 'approve_approval_request',
      success: result.decision.approved,
      reasonCode: result.decision.reasonCode,
      reason: result.decision.reason ?? 'Approval decision recorded.',
      affectedEntityIds: [input.approvalRequestId, result.decision.id],
      createdEventIds: [],
      ...(result.proof !== undefined ? { createdProofIds: [result.proof.id] } : {}),
      executedAt: result.decision.decidedAt,
    };
  }

  rejectApprovalRequest(input: ApprovalDecisionCommandInput): ControlPlaneCommandResult {
    const result = this.runtimes.approvalRuntime.reject({
      approvalRequestId: input.approvalRequestId,
      approverActorId: input.approverActorId,
      evidenceReviewed: [],
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    return {
      id: nowId('command-reject', input.approvalRequestId),
      type: 'reject_approval_request',
      success: result.decision.type === 'rejected',
      reasonCode: result.decision.reasonCode,
      reason: result.decision.reason ?? 'Approval rejected.',
      affectedEntityIds: [input.approvalRequestId, result.decision.id],
      executedAt: result.decision.decidedAt,
    };
  }

  requestApprovalChanges(input: ApprovalDecisionCommandInput): ControlPlaneCommandResult {
    const result = this.runtimes.approvalRuntime.requestChanges({
      approvalRequestId: input.approvalRequestId,
      approverActorId: input.approverActorId,
      evidenceReviewed: [],
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    return {
      id: nowId('command-request-changes', input.approvalRequestId),
      type: 'request_approval_changes',
      success: result.decision.type === 'requested_changes',
      reasonCode: result.decision.reasonCode,
      reason: result.decision.reason ?? 'Changes requested.',
      affectedEntityIds: [input.approvalRequestId, result.decision.id],
      executedAt: result.decision.decidedAt,
    };
  }

  escalateApproval(input: ApprovalDecisionCommandInput): ControlPlaneCommandResult {
    const result = this.runtimes.approvalRuntime.escalate({
      approvalRequestId: input.approvalRequestId,
      approverActorId: input.approverActorId,
      evidenceReviewed: [],
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    return {
      id: nowId('command-escalate', input.approvalRequestId),
      type: 'escalate_approval',
      success: result.decision.type === 'escalated',
      reasonCode: result.decision.reasonCode,
      reason: result.decision.reason ?? 'Approval escalated.',
      affectedEntityIds: [input.approvalRequestId, result.decision.id],
      executedAt: result.decision.decidedAt,
    };
  }

  revokeApprovalProof(input: RevokeCommandInput): ControlPlaneCommandResult {
    const result = this.runtimes.approvalRuntime.revokeApproval({
      approvalProofId: input.targetId,
      revokedByActorId: input.revokedByActorId,
      reason: input.reason,
    });
    return {
      id: nowId('command-revoke-approval-proof', input.targetId),
      type: 'revoke_approval_proof',
      success: 'status' in result && result.status === 'revoked',
      reasonCode: 'APPROVAL_PROOF_REVOKED',
      reason: input.reason,
      affectedEntityIds: [input.targetId],
      executedAt: 'revokedAt' in result && result.revokedAt !== undefined ? result.revokedAt : this.clock.now(),
    };
  }

  revokeAuthorityGrant(input: RevokeCommandInput): ControlPlaneCommandResult {
    const grant = this.runtimes.authorityRuntime.revokeAuthorityGrant(input.targetId, input.revokedByActorId, input.reason);
    const revocationLink = this.latestRevocationLink(grant.id);
    return {
      id: nowId('command-revoke-authority-grant', input.targetId),
      type: 'revoke_authority_grant',
      success: grant.status === 'revoked',
      reasonCode: 'AUTHORITY_GRANT_REVOKED',
      reason: input.reason,
      affectedEntityIds: [grant.id],
      executedAt: revocationLink?.revokedAt ?? grant.issuedAt,
    };
  }

  revokeDelegationGrant(input: RevokeCommandInput): ControlPlaneCommandResult {
    const delegation = this.runtimes.authorityRuntime.revokeDelegationGrant(input.targetId, input.revokedByActorId, input.reason);
    const revocationLink = this.latestRevocationLink(delegation.id);
    return {
      id: nowId('command-revoke-delegation-grant', input.targetId),
      type: 'revoke_delegation_grant',
      success: delegation.status === 'revoked',
      reasonCode: 'DELEGATION_GRANT_REVOKED',
      reason: input.reason,
      affectedEntityIds: [delegation.id],
      executedAt: revocationLink?.revokedAt ?? delegation.issuedAt,
    };
  }

  revokeAgentVisa(input: RevokeCommandInput): ControlPlaneCommandResult {
    const visa = this.runtimes.handshakeRuntime.revokeAgentVisa(input.targetId, input.revokedByActorId, input.reason);
    return {
      id: nowId('command-revoke-agent-visa', input.targetId),
      type: 'revoke_agent_visa',
      success: visa.status === 'revoked',
      reasonCode: 'AGENT_VISA_REVOKED',
      reason: input.reason,
      affectedEntityIds: [visa.id],
      executedAt: visa.revokedAt ?? visa.issuedAt,
    };
  }

  revokeIngressGrant(input: RevokeCommandInput): ControlPlaneCommandResult {
    const grant = this.runtimes.handshakeRuntime.revokeIngressGrant(input.targetId, input.revokedByActorId, input.reason);
    return {
      id: nowId('command-revoke-ingress-grant', input.targetId),
      type: 'revoke_ingress_grant',
      success: grant.status === 'revoked',
      reasonCode: 'INGRESS_GRANT_REVOKED',
      reason: input.reason,
      affectedEntityIds: [grant.id],
      executedAt: grant.revokedAt ?? grant.issuedAt,
    };
  }

  private latestRevocationLink(entityId: string) {
    const links = this.runtimes.authorityRuntime.store.getRevocationLinksForEntity(entityId);
    return [...links].sort((a, b) => (a.revokedAt < b.revokedAt ? 1 : a.revokedAt > b.revokedAt ? -1 : 0))[0];
  }

  async dryRunEnforcement(input: DryRunEnforcementCommandInput): Promise<ControlPlaneCommandResult> {
    const outcome = await this.runtimes.aocGuard.enforce(
      {
        actorId: input.actorId,
        trustDomainId: input.trustDomainId,
        action: input.action,
        resourceScope: input.resourceScope,
        mode: 'dry_run',
        ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
        ...(input.capability !== undefined ? { capability: input.capability } : {}),
        ...(input.sideEffectType !== undefined ? { sideEffectType: input.sideEffectType } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
      () => undefined,
    );
    return {
      id: nowId('command-dry-run-enforcement', outcome.request.id),
      type: 'dry_run_enforcement',
      success: outcome.decision.type === 'dry_run_allowed',
      reasonCode: outcome.decision.reasonCode,
      reason: outcome.decision.reason,
      affectedEntityIds: [outcome.request.id, outcome.decision.id],
      ...(outcome.proof !== undefined ? { createdProofIds: [outcome.proof.id] } : {}),
      executedAt: outcome.decision.decidedAt,
    };
  }

  /**
   * There is no first-class "retry" method on Action Enforcement -- retry is
   * implicit idempotency-key resubmission, which requires the original
   * executor callback. The Control Plane does not own that callback, so this
   * command is always reported as unavailable rather than faking a result.
   */
  retryFailedEnforcement(enforcementRequestId: string): ControlPlaneCommandResult {
    return {
      id: nowId('command-retry-enforcement', enforcementRequestId),
      type: 'retry_failed_enforcement',
      success: false,
      reasonCode: 'COMMAND_NOT_WIRED',
      reason:
        'Action Enforcement has no first-class retry method: retrying requires resubmitting the original execute() callback with the same idempotency key, which the Control Plane does not own. Resubmit the action from its origin caller instead.',
      affectedEntityIds: [enforcementRequestId],
      executedAt: this.clock.now(),
    };
  }
}
