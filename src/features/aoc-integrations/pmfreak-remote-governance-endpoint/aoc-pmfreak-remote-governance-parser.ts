import { createAocPMFreakRemoteGovernanceEndpointError } from './aoc-pmfreak-remote-governance-errors.js';
import type { AocPMFreakGovernanceRequest, AocPMFreakRemoteGovernanceParseResult } from './aoc-pmfreak-remote-governance-endpoint-types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Checks that `evidenceContext`/`approvalContext`-shaped objects carry their
 * three required string-array fields, so a caller cannot silently omit them.
 */
function hasThreeStringArrayFields(value: Record<string, unknown>, fields: readonly [string, string, string]): boolean {
  return fields.every((field) => isStringArray(value[field]));
}

/**
 * Parses an arbitrary request body into an `AocPMFreakGovernanceRequest`.
 * This is a shape/envelope check only -- it confirms the body looks enough
 * like a governance request to be safely narrowed to the compatibility
 * type, so it can be handed to the already-merged AOC PMFreak Governance
 * Request Intake. It deliberately does not duplicate that intake's own
 * `validateAocPMFreakGovernanceRequest` (cross-field consistency, empty-id
 * checks, claim-safety scanning); a body that passes this parser but fails
 * deeper semantic validation still gets a governed `deny` decision from the
 * intake, not a parser-level rejection.
 */
export function parseAocPMFreakRemoteGovernanceRequestBody(body: unknown): AocPMFreakRemoteGovernanceParseResult {
  if (!isRecord(body)) {
    return {
      ok: false,
      error: createAocPMFreakRemoteGovernanceEndpointError('invalid_request', 'Request body must be a JSON object shaped like an AOC PMFreak governance request.'),
    };
  }

  const missingFields: string[] = [];

  if (typeof body.requestId !== 'string' || body.requestId.length === 0) missingFields.push('requestId');
  if (typeof body.clientId !== 'string' || body.clientId.length === 0) missingFields.push('clientId');
  if (!isRecord(body.actionAttempt)) missingFields.push('actionAttempt');
  if (!isRecord(body.projectContext)) missingFields.push('projectContext');
  if (!isRecord(body.agentContext)) missingFields.push('agentContext');
  if (!isRecord(body.actionContext)) missingFields.push('actionContext');

  if (!isRecord(body.evidenceContext) || !hasThreeStringArrayFields(body.evidenceContext, ['evidenceReferenceIds', 'providedEvidenceIds', 'missingEvidenceIds'])) {
    missingFields.push('evidenceContext');
  }
  if (!isRecord(body.approvalContext) || !hasThreeStringArrayFields(body.approvalContext, ['approvalReferenceIds', 'providedApprovalIds', 'missingApprovalIds'])) {
    missingFields.push('approvalContext');
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      error: createAocPMFreakRemoteGovernanceEndpointError('invalid_request', `Request body is missing or has malformed required field(s): ${missingFields.join(', ')}.`, { missingFields }),
    };
  }

  const normalized: Record<string, unknown> = {
    ...body,
    safeLabels: isStringArray(body.safeLabels) ? body.safeLabels : [],
    warnings: isStringArray(body.warnings) ? body.warnings : [],
    errors: isStringArray(body.errors) ? body.errors : [],
  };

  return { ok: true, request: normalized as unknown as AocPMFreakGovernanceRequest };
}
