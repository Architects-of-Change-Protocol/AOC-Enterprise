import { PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID } from '../pmfreak-project-governance-scenarios/index.js';

/**
 * Soberanía PMFreak Demo Control Plane View v1 -- shared identifiers.
 *
 * This module carries no real PMFreak project, customer, or billing data.
 * Every id below is a deterministic, opaque demo identifier, never a claim
 * about a real PMFreak deployment. See this module's README for the full
 * safety framing.
 */

export const PMFREAK_DEMO_CONTROL_PLANE_VIEW_ID = 'aoc.demo.pmfreak.control_plane_view.v1' as const;

export const PMFREAK_DEMO_CONTROL_PLANE_VIEW_NAME = 'Soberanía PMFreak Demo Control Plane View v1' as const;

export const PMFREAK_DEMO_CONTROL_PLANE_VIEW_VERSION = '1.0.0' as const;

/**
 * The scenario the Control Plane view treats as its primary walkthrough
 * demo -- read directly from the Project Governance Scenario Pack's own
 * constant, never redeclared, so it can never drift from the scenario it
 * names.
 */
export const PMFREAK_DEMO_CONTROL_PLANE_PRIMARY_SCENARIO_ID = PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID;

/** Stable ids for each Control Plane view section, for demo navigation/anchors only -- never a routing or authorization concern. */
export const PMFREAK_DEMO_CONTROL_PLANE_SECTION_IDS = {
  overview: 'overview',
  agentPassport: 'agent_passport',
  attemptedAction: 'attempted_action',
  decision: 'decision',
  authorityScope: 'authority_scope',
  evidence: 'evidence',
  approvals: 'approvals',
  trace: 'trace',
  policyReferences: 'policy_references',
  exportStatus: 'export_status',
} as const;

/**
 * Safe, natural-language Control Plane labels for this view layer. Every
 * label is checked by this module's own tests against
 * `evaluatePMFreakDemoControlPlaneClaimSafety` -- none claims full trust,
 * production authorization, invoice validity, customer acceptance
 * certification, contractual compliance, or Costa Rica legal compliance.
 */
export const PMFREAK_DEMO_CONTROL_PLANE_SAFE_LABELS = [
  'PMFreak demo Control Plane view',
  'Soberanía-governed agent',
  'Demo scenario',
  'Passport-gated',
  'Capability-gated',
  'Authority-scoped',
  'Evidence required',
  'Approval required',
  'Not production integration',
  'Not compliance certification',
  'No invoice validity claimed',
  'No customer acceptance certification',
  'Audit-ready demo export',
  'Costa Rica jurisdiction context referenced',
] as const;

/** Canonical, claim-safe trace timeline step labels, in the scenario trace's fixed step order. */
export const PMFREAK_DEMO_CONTROL_PLANE_TRACE_STEP_LABELS = {
  scenario_loaded: 'Scenario loaded',
  passport_resolved: 'Passport resolved',
  action_authorized: 'Action authorized',
  capability_checked: 'Capability checked',
  authority_scope_checked: 'Authority scope checked',
  evidence_checked: 'Evidence checked',
  approvals_checked: 'Approvals checked',
  context_sensitivity_checked: 'Context sensitivity checked',
  decision_computed: 'Decision computed',
  control_plane_ready: 'Control Plane ready',
  export_metadata_ready: 'Export metadata ready',
} as const;
