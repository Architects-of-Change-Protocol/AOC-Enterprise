import { evaluateAocPMFreakGovernanceIntakeClaimSafety } from './aoc-pmfreak-governance-intake-claim-safety.js';
import type { AocPMFreakGovernanceRequest, AocPMFreakGovernanceRequestValidationResult } from './aoc-pmfreak-governance-intake-types.js';

/**
 * Validates a PMFreak governance request. Pure and read-only: it never
 * mutates `request`, never contacts PMFreak, and never makes a network
 * call. Only structural and cross-field validation -- decision-making
 * belongs to `evaluateAocPMFreakGovernanceRequest`, not here.
 */
export function validateAocPMFreakGovernanceRequest(request: AocPMFreakGovernanceRequest): AocPMFreakGovernanceRequestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!request.requestId) errors.push('requestId is required.');
  if (!request.clientId) errors.push('clientId is required.');
  if (request.providerId !== 'pmfreak') errors.push('providerId must be "pmfreak".');
  if (request.consumerOf !== 'aoc') errors.push('consumerOf must be "aoc".');
  if (request.requestMode !== 'dry_run' && request.requestMode !== 'evaluate_only') {
    errors.push('requestMode must be "dry_run" or "evaluate_only".');
  }

  if (request.actionAttempt === undefined) {
    errors.push('actionAttempt is required.');
  } else {
    if (!request.actionAttempt.agentId) errors.push('actionAttempt.agentId is required.');
    if (!request.actionAttempt.projectId) errors.push('actionAttempt.projectId is required.');
    if (!request.actionAttempt.actionId) errors.push('actionAttempt.actionId is required.');
    if (!request.actionAttempt.actionCategory) errors.push('actionAttempt.actionCategory is required.');
  }

  if (request.projectContext === undefined) {
    errors.push('projectContext is required.');
  } else if (request.actionAttempt !== undefined && request.projectContext.projectId !== request.actionAttempt.projectId) {
    errors.push('projectContext.projectId must match actionAttempt.projectId.');
  }

  if (request.agentContext === undefined) {
    errors.push('agentContext is required.');
  } else if (request.actionAttempt !== undefined && request.agentContext.agentId !== request.actionAttempt.agentId) {
    errors.push('agentContext.agentId must match actionAttempt.agentId.');
  }

  if (request.actionContext === undefined) {
    errors.push('actionContext is required.');
  } else if (request.actionAttempt !== undefined && request.actionContext.actionId !== request.actionAttempt.actionId) {
    errors.push('actionContext.actionId must match actionAttempt.actionId.');
  }

  if (request.evidenceContext === undefined) {
    errors.push('evidenceContext is required.');
  } else {
    if (!Array.isArray(request.evidenceContext.evidenceReferenceIds)) errors.push('evidenceContext.evidenceReferenceIds must be an array.');
    if (!Array.isArray(request.evidenceContext.providedEvidenceIds)) errors.push('evidenceContext.providedEvidenceIds must be an array.');
    if (!Array.isArray(request.evidenceContext.missingEvidenceIds)) errors.push('evidenceContext.missingEvidenceIds must be an array.');
  }

  if (request.approvalContext === undefined) {
    errors.push('approvalContext is required.');
  } else {
    if (!Array.isArray(request.approvalContext.approvalReferenceIds)) errors.push('approvalContext.approvalReferenceIds must be an array.');
    if (!Array.isArray(request.approvalContext.providedApprovalIds)) errors.push('approvalContext.providedApprovalIds must be an array.');
    if (!Array.isArray(request.approvalContext.missingApprovalIds)) errors.push('approvalContext.missingApprovalIds must be an array.');
  }

  const claimSafety = evaluateAocPMFreakGovernanceIntakeClaimSafety(request);
  if (!claimSafety.safe) {
    errors.push(`Request contains unsafe claim phrases: ${claimSafety.unsafePhrases.join(', ')}.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
