import { AOC_PMFREAK_GOVERNANCE_INTAKE_DISCLAIMERS, AOC_PMFREAK_GOVERNANCE_INTAKE_SAFE_LABELS } from './aoc-pmfreak-governance-intake-constants.js';
import { assertNoAocPMFreakGovernanceIntakeOverclaim } from './aoc-pmfreak-governance-intake-claim-safety.js';
import { createAocPMFreakDecisionSafeSummary, mapAocPMFreakDecisionToLabel, mapAocPMFreakDecisionToSeverity } from './aoc-pmfreak-governance-decision-mapping.js';
import type {
  AocPMFreakGovernanceDecision,
  AocPMFreakGovernanceRequest,
  AocPMFreakGovernanceResponse,
  AocPMFreakGovernanceResponseTraceStep,
} from './aoc-pmfreak-governance-intake-types.js';

export interface CreateAocPMFreakGovernanceResponseInput {
  readonly request: AocPMFreakGovernanceRequest;
  readonly decision: AocPMFreakGovernanceDecision;
  readonly reasonCodes?: readonly string[];
  readonly requiredEvidenceIds?: readonly string[];
  readonly requiredApprovalIds?: readonly string[];
  readonly missingEvidenceIds?: readonly string[];
  readonly missingApprovalIds?: readonly string[];
  readonly policyPackIds?: readonly string[];
  readonly jurisdictionPackIds?: readonly string[];
  readonly warnings?: readonly string[];
  readonly errors?: readonly string[];
}

/** Every non-identifier character replaced, so a response id is always a safe, deterministic path-like segment. */
function safeIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function buildTrace(input: CreateAocPMFreakGovernanceResponseInput): readonly AocPMFreakGovernanceResponseTraceStep[] {
  const errors = input.errors ?? [];
  const missingEvidenceIds = input.missingEvidenceIds ?? [];
  const missingApprovalIds = input.missingApprovalIds ?? [];

  return [
    {
      stepId: 'validation',
      label: 'Request validation',
      status: errors.length > 0 ? 'blocked' : 'passed',
      summary: errors.length > 0 ? 'Request validation reported one or more errors.' : 'Request passed structural validation.',
    },
    {
      stepId: 'evidence_gate',
      label: 'Evidence gate',
      status: missingEvidenceIds.length > 0 ? 'blocked' : 'passed',
      summary: missingEvidenceIds.length > 0 ? `Missing evidence: ${missingEvidenceIds.join(', ')}.` : 'No missing evidence reported.',
    },
    {
      stepId: 'approval_gate',
      label: 'Approval gate',
      status: missingApprovalIds.length > 0 ? 'blocked' : 'passed',
      summary: missingApprovalIds.length > 0 ? `Missing approvals: ${missingApprovalIds.join(', ')}.` : 'No missing approvals reported.',
    },
    {
      stepId: 'decision',
      label: 'Governance decision',
      status: input.decision === 'allow' ? 'passed' : input.decision === 'deny' ? 'blocked' : 'warning',
      summary: `AOC returned decision "${input.decision}".`,
    },
  ];
}

/**
 * Builds a governed AOC response for PMFreak. Deterministic response id,
 * preserves `requestId`/`clientId`, never mutates `request`, never contacts
 * PMFreak, never executes an action, and never writes back a decision.
 * Self-scans its own output with `assertNoAocPMFreakGovernanceIntakeOverclaim`
 * as defense in depth before returning.
 */
export function createAocPMFreakGovernanceResponse(input: CreateAocPMFreakGovernanceResponseInput): AocPMFreakGovernanceResponse {
  const responseId = `aoc.pmfreak.response.${safeIdSegment(input.request.requestId)}.v1`;

  const response: AocPMFreakGovernanceResponse = {
    responseId,
    requestId: input.request.requestId,
    clientId: input.request.clientId,
    providerId: 'aoc',
    evaluatedFor: 'pmfreak',
    decision: input.decision,
    decisionLabel: mapAocPMFreakDecisionToLabel(input.decision),
    decisionSeverity: mapAocPMFreakDecisionToSeverity(input.decision),
    reasonCodes: [...(input.reasonCodes ?? [])],
    safeSummary: createAocPMFreakDecisionSafeSummary(input.decision, input.request),
    requiredEvidenceIds: [...(input.requiredEvidenceIds ?? [])],
    requiredApprovalIds: [...(input.requiredApprovalIds ?? [])],
    missingEvidenceIds: [...(input.missingEvidenceIds ?? [])],
    missingApprovalIds: [...(input.missingApprovalIds ?? [])],
    trace: buildTrace(input),
    policyPackIds: [...(input.policyPackIds ?? [])],
    jurisdictionPackIds: [...(input.jurisdictionPackIds ?? [])],
    safeLabels: [...AOC_PMFREAK_GOVERNANCE_INTAKE_SAFE_LABELS],
    disclaimers: [...AOC_PMFREAK_GOVERNANCE_INTAKE_DISCLAIMERS],
    warnings: [...(input.warnings ?? [])],
    errors: [...(input.errors ?? [])],
  };

  assertNoAocPMFreakGovernanceIntakeOverclaim(response);
  return response;
}
