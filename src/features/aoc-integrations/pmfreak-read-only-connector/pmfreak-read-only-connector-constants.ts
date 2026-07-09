/**
 * AOC PMFreak Read-Only Connector v1 -- shared identifiers.
 *
 * This module carries no real PMFreak project, customer, or billing data.
 * It only names the connector, its read-only capabilities, and the
 * operations it refuses to perform. See this module's README for the full
 * safety framing.
 */

export const AOC_PMFREAK_READ_ONLY_CONNECTOR_ID = 'aoc.integration.pmfreak.read_only_connector.v1' as const;

export const AOC_PMFREAK_READ_ONLY_CONNECTOR_NAME = 'AOC PMFreak Read-Only Connector v1' as const;

export const AOC_PMFREAK_READ_ONLY_CONNECTOR_VERSION = 'v1' as const;

/** The connector's `systemId` -- an opaque routing key, not a claim of real PMFreak system integration. */
export const AOC_PMFREAK_SYSTEM_ID = 'pmfreak' as const;

/** Read-only capabilities this connector exposes. Every capability name starts with `read_` -- there is no write, mutate, or execute capability. */
export const AOC_PMFREAK_READ_ONLY_CONNECTOR_CAPABILITIES = {
  readProjects: 'read_projects',
  readAgents: 'read_agents',
  readMilestones: 'read_milestones',
  readTasks: 'read_tasks',
  readRisks: 'read_risks',
  readEvidenceReferences: 'read_evidence_references',
  readApprovalReferences: 'read_approval_references',
  readActionProposals: 'read_action_proposals',
} as const;

/**
 * Operations this connector refuses to perform. `assertAocPMFreakReadOnlyOperation`
 * throws a `mutation_not_allowed` connector error for any operation name in this
 * list -- this is a guardrail, not an implemented executor.
 */
export const AOC_PMFREAK_FORBIDDEN_CONNECTOR_OPERATIONS = [
  'create_project',
  'update_project',
  'delete_project',
  'create_task',
  'update_task',
  'delete_task',
  'create_milestone',
  'update_milestone',
  'delete_milestone',
  'create_risk',
  'update_risk',
  'delete_risk',
  'create_evidence_reference',
  'update_evidence_reference',
  'delete_evidence_reference',
  'create_approval_reference',
  'update_approval_reference',
  'delete_approval_reference',
  'create_invoice',
  'send_email',
  'send_slack_message',
  'send_client_communication',
  'approve_action',
  'execute_action',
  'writeback_decision',
] as const;

/**
 * Safe, natural-language labels for this connector's output. Every label is
 * checked by this module's own tests against
 * `evaluateAocPMFreakReadOnlyConnectorClaimSafety` -- none claims production
 * mutation capability, compliance certification, invoice validity, or
 * customer acceptance certification.
 */
export const AOC_PMFREAK_READ_ONLY_CONNECTOR_SAFE_LABELS = [
  'read-only connector',
  'read-only PMFreak data',
  'No mutation performed',
  'No writeback performed',
  'Not production execution',
  'Not compliance certification',
  'No invoice validity claimed',
  'No customer acceptance certification',
] as const;

/** Explicit, plain-language scope disclaimers carried on the connector descriptor. */
export const AOC_PMFREAK_READ_ONLY_CONNECTOR_DISCLAIMERS = [
  'This connector reads PMFreak data.',
  'This connector does not mutate PMFreak data.',
  'This connector does not execute actions.',
  'This connector does not create governance decisions.',
  'This connector does not send communications.',
  'This connector does not create invoices.',
  'This connector does not certify compliance.',
  'This connector does not provide legal advice.',
] as const;
