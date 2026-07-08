/**
 * AOC PMFreak Project Governance Scenario Pack v1 -- shared identifiers.
 *
 * This module carries no real PMFreak project, customer, or billing data.
 * Every id below is a deterministic, opaque demo identifier used to route
 * scenarios and fixtures, never a claim about a real PMFreak deployment. See
 * this pack's README for the full safety framing.
 */

export const PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID = 'aoc.demo.pmfreak.project_governance_scenarios.v1' as const;

export const PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_NAME = 'AOC PMFreak Project Governance Scenario Pack v1' as const;

export const PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_VERSION = '1.0.0' as const;

/** Deterministic demo workspace id. Not a real Datasys/PMFreak workspace. */
export const PMFREAK_PROJECT_GOVERNANCE_DEMO_WORKSPACE_ID = 'workspace.demo.pmfreak' as const;

/** Deterministic demo project id. Not a real Datasys/PMFreak project. */
export const PMFREAK_PROJECT_GOVERNANCE_DEMO_PROJECT_ID = 'project.demo.network-refresh' as const;

/** Deterministic demo customer id. Not a real Datasys customer. */
export const PMFREAK_PROJECT_GOVERNANCE_DEMO_CUSTOMER_ID = 'customer.demo.acme' as const;

export const PMFREAK_PROJECT_GOVERNANCE_DEMO_PROJECT_NAME = 'Demo Network Refresh Project' as const;

export const PMFREAK_PROJECT_GOVERNANCE_DEMO_CUSTOMER_DISPLAY_NAME = 'Demo Customer ACME' as const;

/** A second demo project id, deliberately outside every fixture passport's authority scope. */
export const PMFREAK_PROJECT_GOVERNANCE_DEMO_OUT_OF_SCOPE_PROJECT_ID = 'project.demo.out-of-scope-harbor' as const;

/**
 * Jurisdiction context reference only -- an opaque routing key carried on the
 * demo project context, never a claim of Costa Rica legal compliance or
 * legal interpretation. See `aoc.jurisdiction.costa_rica.base.v1`'s own
 * README for the full safety framing of that pack.
 */
export const PMFREAK_PROJECT_GOVERNANCE_DEMO_JURISDICTION_COUNTRY_CODE = 'CR' as const;
export const PMFREAK_PROJECT_GOVERNANCE_DEMO_JURISDICTION_PACK_ID = 'aoc.jurisdiction.costa_rica.base.v1' as const;

// ---------------------------------------------------------------------------
// Demo milestone / risk / change request ids
// ---------------------------------------------------------------------------

export const PMFREAK_DEMO_MILESTONE_PHASE_1_DELIVERY_ID = 'milestone.demo.network-refresh.phase-1-delivery' as const;

export const PMFREAK_DEMO_RISK_UNCONFIRMED_CUSTOMER_ACCEPTANCE_ID = 'risk.demo.unconfirmed-customer-acceptance' as const;

export const PMFREAK_DEMO_CHANGE_REQUEST_SCOPE_ADJUSTMENT_ID = 'change.demo.scope-adjustment-request' as const;

// ---------------------------------------------------------------------------
// Deterministic scenario ids
// ---------------------------------------------------------------------------

export const PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID = 'pmfreak.scenario.billing_readiness.mark_milestone_ready' as const;

export const PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID = 'pmfreak.scenario.milestone_acceptance.validate_acceptance' as const;

export const PMFREAK_SCENARIO_SCHEDULE_CHANGE_PROPOSE_REPLAN_ID = 'pmfreak.scenario.schedule_change.propose_replan' as const;

export const PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID = 'pmfreak.scenario.schedule_change.apply_replan' as const;

export const PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID = 'pmfreak.scenario.risk_escalation.prepare_escalation' as const;

export const PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID = 'pmfreak.scenario.client_communication.draft_status_update' as const;

export const PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID = 'pmfreak.scenario.client_communication.send_status_update' as const;

export const PMFREAK_SCENARIO_CHANGE_CONTROL_CLASSIFY_CHANGE_REQUEST_ID = 'pmfreak.scenario.change_control.classify_change_request' as const;

export const PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID = 'pmfreak.scenario.change_control.approve_change_request' as const;

/** Deterministic fixed timestamp used by demo scenario runs -- never a runtime clock read. */
export const PMFREAK_PROJECT_GOVERNANCE_DEMO_REQUESTED_AT = '2026-01-15T00:00:00.000Z' as const;
