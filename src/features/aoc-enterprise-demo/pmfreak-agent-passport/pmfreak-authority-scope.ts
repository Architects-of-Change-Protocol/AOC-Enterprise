import type { PMFreakAgentRole, PMFreakAuthorityScope, PMFreakProjectPhase } from './pmfreak-agent-passport-types.js';
import { PMFREAK_DEMO_CUSTOMER_ID, PMFREAK_DEMO_PROJECT_ID, PMFREAK_DEMO_WORKSPACE_ID } from './pmfreak-agent-passport-constants.js';

function defaultProjectPhasesForRole(role: PMFreakAgentRole): readonly PMFreakProjectPhase[] {
  switch (role) {
    case 'planning_agent':
      return ['initiation', 'planning', 'execution', 'monitoring'];
    case 'risk_agent':
      return ['planning', 'execution', 'monitoring'];
    case 'evidence_agent':
      return ['execution', 'monitoring', 'closure'];
    case 'client_communication_agent':
      return ['planning', 'execution', 'monitoring', 'closure'];
    case 'billing_readiness_agent':
      return ['closure', 'billing'];
    case 'change_control_agent':
      return ['planning', 'execution', 'monitoring'];
  }
}

function defaultMaxRiskSeverityForRole(role: PMFreakAgentRole): PMFreakAuthorityScope['maxRiskSeverityAllowedWithoutApproval'] {
  switch (role) {
    case 'risk_agent':
    case 'planning_agent':
    case 'change_control_agent':
      return 'medium';
    default:
      return 'low';
  }
}

/**
 * Builds the default demo `PMFreakAuthorityScope` for a role, scoped to this
 * pack's deterministic demo workspace/project/customer ids. Every flag
 * defaults to the least authority a role needs for its allowed capabilities
 * -- callers may override any field (e.g. to build the out-of-scope
 * negative fixture).
 */
export function createDefaultPMFreakAuthorityScope(role: PMFreakAgentRole, overrides?: Partial<PMFreakAuthorityScope>): PMFreakAuthorityScope {
  const base: PMFreakAuthorityScope = {
    workspaceIds: [PMFREAK_DEMO_WORKSPACE_ID],
    projectIds: [PMFREAK_DEMO_PROJECT_ID],
    customerIds: [PMFREAK_DEMO_CUSTOMER_ID],
    allowedProjectPhases: defaultProjectPhasesForRole(role),
    maxRiskSeverityAllowedWithoutApproval: defaultMaxRiskSeverityForRole(role),
    canDraftExternalCommunication: role === 'client_communication_agent' || role === 'risk_agent' || role === 'change_control_agent',
    canSendExternalCommunication: role === 'client_communication_agent',
    canMarkMilestoneComplete: false,
    canRecommendBillingReadiness: role === 'billing_readiness_agent',
    canApproveBillingReadiness: false,
    canModifySchedule: role === 'planning_agent',
    canApproveScheduleChange: false,
    canCreateChangeRequest: role === 'change_control_agent',
    canApproveChangeRequest: false,
  };

  return { ...base, ...overrides };
}

export function isWorkspaceWithinAuthorityScope(scope: PMFreakAuthorityScope, workspaceId: string): boolean {
  return scope.workspaceIds.includes(workspaceId);
}

export function isProjectWithinAuthorityScope(scope: PMFreakAuthorityScope, projectId: string): boolean {
  return scope.projectIds.includes(projectId);
}

export function isProjectPhaseWithinAuthorityScope(scope: PMFreakAuthorityScope, projectPhase: PMFreakProjectPhase): boolean {
  return scope.allowedProjectPhases.includes(projectPhase);
}

/** A customer scope list is a restriction only when non-empty; an empty list means "no customer-specific restriction declared". */
export function isCustomerWithinAuthorityScope(scope: PMFreakAuthorityScope, customerId?: string): boolean {
  if (customerId === undefined) return true;
  if (scope.customerIds.length === 0) return true;
  return scope.customerIds.includes(customerId);
}
