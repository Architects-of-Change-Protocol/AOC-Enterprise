/**
 * Soberanía PMFreak Remote Governance Endpoint v1 -- shared identifiers.
 *
 * Soberanía Enterprise is the governance provider; PMFreak is the governance
 * consumer. This module exposes the already-merged Soberanía PMFreak Governance
 * Request Intake through a safe remote endpoint/handler boundary. Every id
 * below is a deterministic, opaque identifier, never a claim about a real
 * PMFreak deployment.
 */

export const AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID = 'aoc.integration.pmfreak.remote_governance_endpoint.v1' as const;

export const AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_NAME = 'Soberanía PMFreak Remote Governance Endpoint v1' as const;

export const AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_VERSION = 'v1' as const;

/** The `AocPMFreakGovernanceRequest.consumerOf` / `AocPMFreakGovernanceResponse.providerId` value this endpoint carries -- an opaque routing key, not a claim of real PMFreak system integration. */
export const AOC_SYSTEM_ID = 'aoc' as const;

/** The `AocPMFreakGovernanceRequest.providerId` every compatible PMFreak request carries. */
export const PMFREAK_SYSTEM_ID = 'pmfreak' as const;

/** Default HTTP path this endpoint is documented under, whether or not an actual HTTP route is wired up in this repo. */
export const AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH = '/api/aoc/pmfreak/governance/evaluate' as const;

/** What this endpoint can do. It only receives, parses, validates, and evaluates PMFreak governance requests (delegating evaluation to the existing Soberanía PMFreak Governance Request Intake) and serializes governance responses -- it never mutates PMFreak, never executes a PMFreak action, and never writes a decision back into PMFreak. */
export const AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_CAPABILITIES = {
  receiveHttpGovernanceRequest: 'receive_http_governance_request',
  parseGovernanceRequest: 'parse_governance_request',
  validateGovernanceRequest: 'validate_governance_request',
  evaluateGovernanceRequest: 'evaluate_governance_request',
  serializeGovernanceResponse: 'serialize_governance_response',
} as const;

/** Operations this endpoint never performs, regardless of configuration. Used by tests and by the descriptor/config/health surfaces to make the boundary explicit rather than implicit. */
export const AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_FORBIDDEN_OPERATIONS = [
  'mutate_pmfreak_project',
  'update_pmfreak_project',
  'delete_pmfreak_project',
  'execute_pmfreak_action',
  'writeback_decision_to_pmfreak',
  'send_email',
  'send_client_communication',
  'post_to_slack',
  'create_invoice',
  'certify_invoice_validity',
  'certify_customer_acceptance',
  'certify_compliance',
] as const;

export const AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_SAFE_LABELS = [
  'Soberanía PMFreak remote governance endpoint',
  'PMFreak consumes Soberanía Governance',
  'Governance decision returned',
  'No PMFreak mutation performed',
  'No action execution performed',
  'No invoice validity claimed',
  'No customer acceptance certification',
  'Not compliance certification',
  'Not legal advice',
] as const;

export const AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_DISCLAIMERS = [
  'This endpoint receives PMFreak governance requests.',
  'This endpoint evaluates requests through Soberanía PMFreak Governance Request Intake.',
  'This endpoint returns governed Soberanía decisions.',
  'This endpoint does not mutate PMFreak data.',
  'This endpoint does not execute PMFreak actions.',
  'This endpoint does not write back to PMFreak.',
  'This endpoint does not send communications.',
  'This endpoint does not create invoices.',
  'This endpoint does not certify compliance.',
  'This endpoint does not certify customer acceptance.',
  'This endpoint does not certify invoice validity.',
  'This endpoint does not provide legal advice.',
] as const;

/** Default shared-secret auth header name, used when `sharedSecretHeaderName` is not configured. */
export const AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_AUTH_HEADER_NAME = 'x-aoc-governance-secret' as const;

/** Response header carrying this endpoint's id, on every success and error response. */
export const AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID_HEADER_NAME = 'x-aoc-endpoint-id' as const;
