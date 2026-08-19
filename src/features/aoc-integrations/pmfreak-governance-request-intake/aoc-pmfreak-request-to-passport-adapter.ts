import type { PMFreakProjectPhase, ResolvePMFreakAgentPassportActionInput } from '../../aoc-enterprise-demo/pmfreak-agent-passport/index.js';
import type { AocPMFreakGovernanceEvaluationInput, AocPMFreakGovernanceRequest } from './aoc-pmfreak-governance-intake-types.js';

/**
 * Normalizes a PMFreak governance request into a stable Soberanía evaluation
 * input. Pure and read-only -- never mutates `request`.
 */
export function mapAocPMFreakGovernanceRequestToEvaluationInput(request: AocPMFreakGovernanceRequest): AocPMFreakGovernanceEvaluationInput {
  return {
    requestId: request.requestId,
    agentId: request.agentContext.agentId,
    agentRole: request.agentContext.agentRole,
    ...(request.agentContext.passportId !== undefined ? { passportId: request.agentContext.passportId } : {}),
    projectId: request.projectContext.projectId,
    actionId: request.actionContext.actionId,
    actionCategory: request.actionContext.actionCategory,
    contextFlags: [...request.actionContext.contextFlags],
    providedEvidenceIds: [...request.evidenceContext.providedEvidenceIds],
    missingEvidenceIds: [...request.evidenceContext.missingEvidenceIds],
    providedApprovalIds: [...request.approvalContext.providedApprovalIds],
    missingApprovalIds: [...request.approvalContext.missingApprovalIds],
    billingSensitive: request.billingContext?.billingSensitive ?? request.actionContext.actionCategory === 'billing',
    policyPackIds: [...(request.policyContext?.requestedPolicyPackIds ?? [])],
    jurisdictionPackIds: [...(request.policyContext?.requestedJurisdictionPackIds ?? [])],
  };
}

const KNOWN_PMFREAK_PROJECT_PHASES: readonly PMFreakProjectPhase[] = ['initiation', 'planning', 'execution', 'monitoring', 'closure', 'billing'];

function normalizeToPMFreakProjectPhase(phase: string | undefined): PMFreakProjectPhase {
  if (phase !== undefined && (KNOWN_PMFREAK_PROJECT_PHASES as readonly string[]).includes(phase)) {
    return phase as PMFreakProjectPhase;
  }
  return 'execution';
}

/**
 * Optional adapter onto the existing, exported PMFreak Agent Passport
 * resolver (`src/features/aoc-enterprise-demo/pmfreak-agent-passport`). This
 * is the synchronous, dependency-free demo resolver -- not the newer
 * `@aoc-enterprise/pmfreak-agent-passport-foundation` package, whose
 * resolver is async and requires real cryptographic passport/capability-
 * token/runtime-guard material this intake boundary has no safe way to
 * synthesize from a bare governance request. Reusing the heavier resolver
 * here would mean forcing a brittle import rather than a clean one.
 *
 * `passportId`/`workspaceId` default to `''` when absent from the request,
 * which the resolver treats as "no matching passport" -> `deny`, a safe
 * conservative default rather than a guess.
 */
export function mapAocPMFreakGovernanceRequestToPassportResolverInput(request: AocPMFreakGovernanceRequest): ResolvePMFreakAgentPassportActionInput {
  return {
    actionAttemptId: request.actionAttempt.actionAttemptId,
    agentId: request.agentContext.agentId,
    passportId: request.agentContext.passportId ?? '',
    actionId: request.actionContext.actionId,
    workspaceId: request.projectContext.workspaceId ?? '',
    projectId: request.projectContext.projectId,
    ...(request.projectContext.customerId !== undefined ? { customerId: request.projectContext.customerId } : {}),
    projectPhase: normalizeToPMFreakProjectPhase(request.projectContext.phase),
    evidenceIds: [...request.evidenceContext.providedEvidenceIds],
    approvalIds: [...request.approvalContext.providedApprovalIds],
    ...(request.policyContext?.requestedPolicyPackIds !== undefined ? { policyPackIds: [...request.policyContext.requestedPolicyPackIds] } : {}),
    context: {
      billingSensitive: request.billingContext?.billingSensitive ?? false,
    },
  };
}
