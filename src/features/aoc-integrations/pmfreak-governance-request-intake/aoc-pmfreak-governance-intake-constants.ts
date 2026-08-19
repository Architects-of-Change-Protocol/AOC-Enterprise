/**
 * Soberanía PMFreak Governance Request Intake v1 -- shared identifiers.
 *
 * Soberanía Enterprise is the governance provider; PMFreak is the governance
 * consumer. Every id below is a deterministic, opaque identifier, never a
 * claim about a real PMFreak deployment. This module owns its own Soberanía-side
 * compatibility DTOs and never imports from the PMFreak repo.
 */

export const AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_ID = 'aoc.integration.pmfreak.governance_request_intake.v1' as const;

export const AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_NAME = 'Soberanía PMFreak Governance Request Intake v1' as const;

export const AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_VERSION = 'v1' as const;

/** The `AocPMFreakGovernanceRequest.consumerOf` / `AocPMFreakGovernanceResponse.providerId` value this intake carries -- an opaque routing key, not a claim of real PMFreak system integration. */
export const AOC_SYSTEM_ID = 'aoc' as const;

/** The `AocPMFreakGovernanceRequest.providerId` every compatible PMFreak request carries. */
export const PMFREAK_SYSTEM_ID = 'pmfreak' as const;

/** What this intake can do. It only receives, validates, normalizes, and evaluates governance requests, and builds governance responses -- it never mutates PMFreak, never executes a PMFreak action, and never writes a decision back into PMFreak. */
export const AOC_PMFREAK_GOVERNANCE_INTAKE_CAPABILITIES = {
  receiveGovernanceRequest: 'receive_governance_request',
  validateGovernanceRequest: 'validate_governance_request',
  normalizeGovernanceRequest: 'normalize_governance_request',
  evaluateGovernanceRequest: 'evaluate_governance_request',
  buildGovernanceResponse: 'build_governance_response',
} as const;

/** Operations this intake never performs, regardless of configuration. Used by tests and by the descriptor/config/health surfaces to make the boundary explicit rather than implicit. */
export const AOC_PMFREAK_GOVERNANCE_INTAKE_FORBIDDEN_OPERATIONS = [
  'mutate_pmfreak_project',
  'update_pmfreak_project',
  'delete_pmfreak_project',
  'create_pmfreak_task',
  'update_pmfreak_task',
  'delete_pmfreak_task',
  'mark_pmfreak_milestone_complete',
  'mark_pmfreak_milestone_billing_ready',
  'update_pmfreak_schedule',
  'close_pmfreak_risk',
  'send_client_communication',
  'send_email',
  'post_to_slack',
  'create_invoice',
  'approve_action_in_pmfreak',
  'writeback_decision_to_pmfreak',
  'execute_pmfreak_action',
  'certify_invoice_validity',
  'certify_customer_acceptance',
  'certify_compliance',
] as const;

export const AOC_PMFREAK_GOVERNANCE_INTAKE_SAFE_LABELS = [
  'Soberanía Governance intake',
  'PMFreak consumes Soberanía Governance',
  'No PMFreak mutation performed',
  'No action execution performed',
  'No invoice validity claimed',
  'No customer acceptance certification',
  'Not compliance certification',
  'Not legal advice',
] as const;

export const AOC_PMFREAK_GOVERNANCE_INTAKE_DISCLAIMERS = [
  'This intake receives PMFreak governance requests.',
  'This intake evaluates requests for Soberanía governance decisions.',
  'This intake returns governed decisions to PMFreak.',
  'This intake does not mutate PMFreak data.',
  'This intake does not execute PMFreak actions.',
  'This intake does not write back to PMFreak.',
  'This intake does not send communications.',
  'This intake does not create invoices.',
  'This intake does not certify compliance.',
  'This intake does not certify customer acceptance.',
  'This intake does not certify invoice validity.',
  'This intake does not provide legal advice.',
] as const;
