import type { AocMetric } from '../domain/control-plane-metric.js';
import type { AocControlPlaneHealth } from '../domain/control-plane-status.js';
import type {
  ApprovalViewModel,
  AuthorityViewModel,
  EnforcementViewModel,
  ExternalAgentsViewModel,
  RecognitionViewModel,
} from '../domain/control-plane-view-model.js';

export interface ControlPlaneMetricsInput {
  readonly recognition: RecognitionViewModel;
  readonly authority: AuthorityViewModel;
  readonly approvals: ApprovalViewModel;
  readonly externalAgents: ExternalAgentsViewModel;
  readonly enforcement: EnforcementViewModel;
  readonly emergencyDenyActive: boolean;
}

/** Counts recognized actors, active grants, pending approvals, etc. from already-projected read-model rows. Never re-derives a governance decision. */
export function computeMetrics(input: ControlPlaneMetricsInput): AocMetric[] {
  const recognizedActors = input.recognition.actors.filter((actor) => actor.status === 'recognized').length;
  const activeGrants = input.authority.grants.filter((grant) => grant.status === 'active').length;
  const activeDelegations = input.authority.delegations.filter((delegation) => delegation.status === 'active').length;
  const pendingApprovals = input.approvals.pendingCount;
  const activeVisas = input.externalAgents.visas.filter((visa) => visa.status === 'active').length;
  const activeIngressGrants = input.externalAgents.ingressGrants.filter((grant) => grant.status === 'active').length;
  const enforcementRequests = input.enforcement.requests.length;
  const blockedExecutions = countBlockedExecutions(input.enforcement);
  const executedActions = input.enforcement.results.filter((result) => result.executed).length;
  const openViolations = input.enforcement.violations.length;
  const proofsGenerated =
    input.authority.proofs.length + input.approvals.proofs.length + input.enforcement.proofs.length + countRecognitionProofs(input.recognition);

  return [
    { id: 'recognized-actors', label: 'Recognized Actors', value: recognizedActors, tone: 'neutral' },
    { id: 'active-authority-grants', label: 'Active Authority Grants', value: activeGrants, tone: 'neutral' },
    { id: 'active-delegations', label: 'Active Delegations', value: activeDelegations, tone: 'neutral' },
    { id: 'pending-approvals', label: 'Pending Approvals', value: pendingApprovals, tone: pendingApprovals > 0 ? 'warning' : 'neutral' },
    { id: 'active-external-visas', label: 'Active External Visas', value: activeVisas, tone: 'neutral' },
    { id: 'active-ingress-grants', label: 'Active Ingress Grants', value: activeIngressGrants, tone: 'neutral' },
    { id: 'enforcement-requests', label: 'Enforcement Requests', value: enforcementRequests, tone: 'neutral' },
    { id: 'blocked-executions', label: 'Blocked Executions', value: blockedExecutions, tone: blockedExecutions > 0 ? 'danger' : 'success' },
    { id: 'executed-actions', label: 'Executed Actions', value: executedActions, tone: 'success' },
    { id: 'open-violations', label: 'Open Violations', value: openViolations, tone: openViolations > 0 ? 'danger' : 'success' },
    { id: 'proofs-generated', label: 'Proofs Generated', value: proofsGenerated, tone: 'neutral' },
  ];
}

function countBlockedExecutions(enforcement: EnforcementViewModel): number {
  return enforcement.decisions.filter((decision) => !decision.allowedToExecute).length;
}

function countRecognitionProofs(recognition: RecognitionViewModel): number {
  return recognition.passports.filter((p) => p.passportHash !== undefined).length + recognition.capabilityTokens.filter((t) => t.tokenHash !== undefined).length;
}

/**
 * Health is derived strictly from counts already present in the read model
 * rows -- it never re-evaluates whether an action should have been allowed.
 */
export function computeHealth(input: ControlPlaneMetricsInput): AocControlPlaneHealth {
  const criticalViolations = input.enforcement.violations.filter((v) => v.severity === 'critical').length;

  if (input.emergencyDenyActive) {
    return { status: 'critical', reasonCode: 'EMERGENCY_DENY_ACTIVE', reason: 'Action Enforcement emergency deny is active: all executions are blocked.' };
  }
  if (criticalViolations > 0) {
    return {
      status: 'critical',
      reasonCode: 'CRITICAL_VIOLATIONS_OPEN',
      reason: `${criticalViolations} critical enforcement violation(s) are open.`,
    };
  }

  const blockedExecutions = countBlockedExecutions(input.enforcement);
  const expiredVisas = input.externalAgents.visas.filter((visa) => visa.status === 'expired').length;
  const revokedApprovals = input.approvals.requests.filter((request) => request.status === 'revoked').length;
  if (blockedExecutions > 0 || expiredVisas > 0 || revokedApprovals > 0) {
    return {
      status: 'degraded',
      reasonCode: 'BLOCKED_OR_EXPIRED_STATE_PRESENT',
      reason: `${blockedExecutions} blocked execution(s), ${expiredVisas} expired visa(s), ${revokedApprovals} revoked approval(s).`,
    };
  }

  const pendingHighRisk = input.approvals.requests.filter(
    (request) => request.status === 'pending' && (request.riskLevel === 'high' || request.riskLevel === 'critical'),
  ).length;
  if (input.approvals.pendingCount > 0 || pendingHighRisk > 0) {
    return {
      status: 'attention_required',
      reasonCode: 'PENDING_APPROVALS_PRESENT',
      reason: `${input.approvals.pendingCount} approval(s) pending, ${pendingHighRisk} of which are high or critical risk.`,
    };
  }

  return { status: 'healthy', reasonCode: 'NO_OPEN_ITEMS', reason: 'No open violations and no pending high-risk approvals.' };
}
