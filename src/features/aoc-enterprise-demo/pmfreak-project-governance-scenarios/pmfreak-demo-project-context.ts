import type { PMFreakProjectPhase } from '../pmfreak-agent-passport/index.js';
import {
  PMFREAK_DEMO_CHANGE_REQUEST_SCOPE_ADJUSTMENT_ID,
  PMFREAK_DEMO_MILESTONE_PHASE_1_DELIVERY_ID,
  PMFREAK_DEMO_RISK_UNCONFIRMED_CUSTOMER_ACCEPTANCE_ID,
  PMFREAK_PROJECT_GOVERNANCE_DEMO_CUSTOMER_DISPLAY_NAME,
  PMFREAK_PROJECT_GOVERNANCE_DEMO_CUSTOMER_ID,
  PMFREAK_PROJECT_GOVERNANCE_DEMO_JURISDICTION_COUNTRY_CODE,
  PMFREAK_PROJECT_GOVERNANCE_DEMO_JURISDICTION_PACK_ID,
  PMFREAK_PROJECT_GOVERNANCE_DEMO_PROJECT_ID,
  PMFREAK_PROJECT_GOVERNANCE_DEMO_PROJECT_NAME,
  PMFREAK_PROJECT_GOVERNANCE_DEMO_WORKSPACE_ID,
  PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID,
} from './pmfreak-project-governance-scenario-constants.js';
import type { PMFreakDemoProjectContext, PMFreakDemoProjectStatus } from './pmfreak-project-governance-scenario-types.js';

/**
 * Builds the deterministic demo `PMFreakDemoProjectContext`, scoped to this
 * pack's fixed demo workspace/project/customer ids and the Costa Rica
 * jurisdiction pack reference. `jurisdictionPackIds` here is a routing
 * reference only -- it never claims Costa Rica legal compliance. Callers may
 * override any field (e.g. `phase`, used by each scenario to exercise a
 * different point in `PMFreakAuthorityScope.allowedProjectPhases`).
 */
export function buildDemoPMFreakProjectContext(overrides?: Partial<PMFreakDemoProjectContext>): PMFreakDemoProjectContext {
  const base: PMFreakDemoProjectContext = {
    workspaceId: PMFREAK_PROJECT_GOVERNANCE_DEMO_WORKSPACE_ID,
    projectId: PMFREAK_PROJECT_GOVERNANCE_DEMO_PROJECT_ID,
    projectName: PMFREAK_PROJECT_GOVERNANCE_DEMO_PROJECT_NAME,
    customerId: PMFREAK_PROJECT_GOVERNANCE_DEMO_CUSTOMER_ID,
    customerDisplayName: PMFREAK_PROJECT_GOVERNANCE_DEMO_CUSTOMER_DISPLAY_NAME,
    phase: 'execution' as PMFreakProjectPhase,
    status: 'active' as PMFreakDemoProjectStatus,
    jurisdictionCountryCode: PMFREAK_PROJECT_GOVERNANCE_DEMO_JURISDICTION_COUNTRY_CODE,
    policyPackIds: [PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID],
    jurisdictionPackIds: [PMFREAK_PROJECT_GOVERNANCE_DEMO_JURISDICTION_PACK_ID],
    milestoneIds: [PMFREAK_DEMO_MILESTONE_PHASE_1_DELIVERY_ID],
    riskIds: [PMFREAK_DEMO_RISK_UNCONFIRMED_CUSTOMER_ACCEPTANCE_ID],
    changeRequestIds: [PMFREAK_DEMO_CHANGE_REQUEST_SCOPE_ADJUSTMENT_ID],
    evidenceIds: [],
    approvalIds: [],
    notes: [
      'Deterministic demo project context. Not a real Datasys/PMFreak project, customer, or contract.',
      'jurisdictionPackIds is a jurisdiction context reference only and does not claim Costa Rica legal compliance.',
    ],
  };

  return { ...base, ...overrides };
}

/** The default demo project context, at its baseline `execution` phase. */
export const demoPMFreakProjectContext: PMFreakDemoProjectContext = buildDemoPMFreakProjectContext();
