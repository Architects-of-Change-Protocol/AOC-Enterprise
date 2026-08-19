import { findPMFreakAction } from './pmfreak-action-catalog.js';
import { isCustomerWithinAuthorityScope, isProjectPhaseWithinAuthorityScope, isProjectWithinAuthorityScope, isWorkspaceWithinAuthorityScope } from './pmfreak-authority-scope.js';
import { PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID } from './pmfreak-agent-passport-constants.js';
import type { PMFreakAgentPassport, PMFreakAgentPassportDecision, PMFreakAgentPassportRegistry, PMFreakAgentPassportResolution, ResolvePMFreakAgentPassportActionInput } from './pmfreak-agent-passport-types.js';

/**
 * PMFreak agent passport action resolver.
 *
 * PMFreak agents should not act only because they are technically able to
 * act. This resolver is the single deterministic place that turns a
 * passport, an authority scope, a capability token, evidence, and approvals
 * into a decision -- a passport granting authority for an action never by
 * itself authorizes execution; approvals still gate it.
 *
 * Passport status handling (documented, deterministic):
 *   - missing passport -> deny
 *   - revoked           -> deny
 *   - expired           -> deny
 *   - draft              -> deny (not yet active; never treated as authorized)
 *   - suspended         -> hold
 *   - active            -> evaluated normally (capability/scope/evidence/approval gates below)
 *
 * When no passport is found for `passportId`, `passportStatus` on the
 * resolution is reported as `'revoked'` -- a documented, deterministic
 * choice: an absent passport is treated identically to a revoked one for
 * decision purposes (`deny`), since `PMFreakAgentPassportStatus` has no
 * dedicated "not found" literal.
 *
 * Decision priority (highest wins when multiple conditions apply), matching
 * the PR's suggested priority order:
 *   deny > require_legal_review > require_contract_review > require_billing_review >
 *   require_security_review > require_executive_approval > require_customer_validation >
 *   require_pm_approval > require_evidence > hold > allow
 */

const DECISION_PRIORITY: readonly PMFreakAgentPassportDecision[] = [
  'deny',
  'require_legal_review',
  'require_contract_review',
  'require_billing_review',
  'require_security_review',
  'require_executive_approval',
  'require_customer_validation',
  'require_pm_approval',
  'require_evidence',
  'hold',
  'allow',
];

const PM_APPROVAL_ID = 'pmfreak.approval.pm_approval';
const CUSTOMER_VALIDATION_ID = 'pmfreak.approval.customer_validation';
const CONTRACT_REVIEW_ID = 'pmfreak.approval.contract_review';
const BILLING_REVIEW_ID = 'pmfreak.approval.billing_review';
const LEGAL_REVIEW_ID = 'pmfreak.approval.legal_review';
const SECURITY_REVIEW_ID = 'pmfreak.approval.security_review';
const EXECUTIVE_APPROVAL_ID = 'pmfreak.approval.executive_approval';

const APPROVAL_ID_TO_DECISION: ReadonlyArray<readonly [string, PMFreakAgentPassportDecision]> = [
  [LEGAL_REVIEW_ID, 'require_legal_review'],
  [CONTRACT_REVIEW_ID, 'require_contract_review'],
  [BILLING_REVIEW_ID, 'require_billing_review'],
  [SECURITY_REVIEW_ID, 'require_security_review'],
  [EXECUTIVE_APPROVAL_ID, 'require_executive_approval'],
  [CUSTOMER_VALIDATION_ID, 'require_customer_validation'],
];

function pickHighestPriorityDecision(candidates: ReadonlySet<PMFreakAgentPassportDecision>): PMFreakAgentPassportDecision {
  for (const decision of DECISION_PRIORITY) {
    if (candidates.has(decision)) return decision;
  }
  return 'allow';
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

const SAFE_FRAMING_WARNING =
  'This decision reflects Soberanía Enterprise passport, authority-scope, capability, evidence, and approval gating only. It is not legal advice, not a compliance certification, and not a guarantee of contractual, billing, or invoice validity.';

export function resolvePMFreakAgentPassportAction(input: ResolvePMFreakAgentPassportActionInput, registry: PMFreakAgentPassportRegistry): PMFreakAgentPassportResolution {
  const warnings: string[] = [SAFE_FRAMING_WARNING];
  const errors: string[] = [];
  const decisionCandidates = new Set<PMFreakAgentPassportDecision>();

  const action = findPMFreakAction(input.actionId);
  if (action === undefined) {
    errors.push(`Unknown PMFreak action id "${input.actionId}".`);
    decisionCandidates.add('deny');
  }

  const passport: PMFreakAgentPassport | undefined = registry.findByPassportId(input.passportId);
  if (passport === undefined) {
    errors.push(`No PMFreak agent passport found for passportId "${input.passportId}".`);
    decisionCandidates.add('deny');
  } else {
    if (passport.status === 'revoked') {
      errors.push(`Passport "${passport.passportId}" is revoked.`);
      decisionCandidates.add('deny');
    } else if (passport.status === 'expired') {
      errors.push(`Passport "${passport.passportId}" is expired.`);
      decisionCandidates.add('deny');
    } else if (passport.status === 'draft') {
      errors.push(`Passport "${passport.passportId}" is still in draft status and is not yet active.`);
      decisionCandidates.add('deny');
    } else if (passport.status === 'suspended') {
      warnings.push(`Passport "${passport.passportId}" is suspended; the action is held pending reinstatement.`);
      decisionCandidates.add('hold');
    }
  }

  const allowedByPassport = passport !== undefined && action !== undefined && passport.allowedActionIds.includes(action.actionId) && !passport.restrictedActionIds.includes(action.actionId);

  const allowedByCapability = passport !== undefined && action !== undefined && passport.capabilityTokenIds.includes(action.capabilityId);

  const allowedByAuthorityScope =
    passport !== undefined &&
    action !== undefined &&
    isWorkspaceWithinAuthorityScope(passport.authorityScope, input.workspaceId) &&
    isProjectWithinAuthorityScope(passport.authorityScope, input.projectId) &&
    isProjectPhaseWithinAuthorityScope(passport.authorityScope, input.projectPhase) &&
    isCustomerWithinAuthorityScope(passport.authorityScope, input.customerId);

  if (passport !== undefined && action !== undefined) {
    if (passport.restrictedActionIds.includes(action.actionId)) {
      errors.push(`Action "${action.actionId}" is explicitly restricted for passport "${passport.passportId}".`);
      decisionCandidates.add('deny');
    } else if (!passport.allowedActionIds.includes(action.actionId)) {
      errors.push(`Action "${action.actionId}" is not among the actions allowed by passport "${passport.passportId}".`);
      decisionCandidates.add('deny');
    }

    if (!allowedByCapability) {
      errors.push(`Passport "${passport.passportId}" does not hold a capability token for "${action.capabilityId}".`);
      decisionCandidates.add('deny');
    }

    if (!allowedByAuthorityScope) {
      errors.push(`Action attempt is outside passport "${passport.passportId}"'s authority scope (workspace/project/phase/customer).`);
      decisionCandidates.add('deny');
    }
  }

  const requiredEvidenceIds = action?.requiresEvidenceIds ?? [];
  const requiredApprovalIds = action?.requiresApprovalIds ?? [];
  const missingEvidenceIds = requiredEvidenceIds.filter((evidenceId) => !input.evidenceIds.includes(evidenceId));
  const missingApprovalIds = requiredApprovalIds.filter((approvalId) => !input.approvalIds.includes(approvalId));
  const evidenceSatisfied = missingEvidenceIds.length === 0;
  const approvalsSatisfied = missingApprovalIds.length === 0;

  if (action !== undefined) {
    if (!evidenceSatisfied) decisionCandidates.add('require_evidence');

    if (!approvalsSatisfied) {
      let matchedSpecificApproval = false;
      for (const [approvalId, decision] of APPROVAL_ID_TO_DECISION) {
        if (missingApprovalIds.includes(approvalId)) {
          decisionCandidates.add(decision);
          matchedSpecificApproval = true;
        }
      }
      if (missingApprovalIds.includes(PM_APPROVAL_ID)) decisionCandidates.add('require_pm_approval');
      if (!matchedSpecificApproval && !missingApprovalIds.includes(PM_APPROVAL_ID)) {
        // A required approval type this catalog does not map to a dedicated review decision
        // (e.g. project sponsor / commercial review) still escalates to PM approval by default,
        // rather than silently allowing.
        decisionCandidates.add('require_pm_approval');
      }
    }
  }

  const context = input.context ?? {};

  if (context.legalSensitive === true && !input.approvalIds.includes(LEGAL_REVIEW_ID)) {
    decisionCandidates.add('require_legal_review');
    warnings.push('Legal-sensitive context flagged; this does not constitute legal advice or legal clearance.');
  }

  if (context.contractSensitive === true && !input.approvalIds.includes(CONTRACT_REVIEW_ID)) {
    decisionCandidates.add('require_contract_review');
  }

  if (context.billingSensitive === true && !input.approvalIds.includes(BILLING_REVIEW_ID)) {
    decisionCandidates.add('require_billing_review');
  }

  if (context.customerCommitment === true) {
    if (!input.approvalIds.includes(CONTRACT_REVIEW_ID)) decisionCandidates.add('require_contract_review');
    if (!input.approvalIds.includes(CUSTOMER_VALIDATION_ID)) decisionCandidates.add('require_customer_validation');
  }

  if ((context.externalCommunication === true || context.customerFacing === true) && !input.approvalIds.includes(PM_APPROVAL_ID)) {
    decisionCandidates.add('require_pm_approval');
  }

  if (decisionCandidates.size === 0) decisionCandidates.add('allow');

  const appliedPolicyPackIds = dedupe([PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID, ...(input.policyPackIds ?? passport?.policyPackIds ?? [])]);
  const jurisdictionPackIds = passport?.jurisdictionPackIds ?? [];

  return {
    actionAttemptId: input.actionAttemptId,
    agentId: input.agentId,
    passportId: input.passportId,
    actionId: input.actionId,
    ...(passport !== undefined ? { role: passport.role } : {}),
    passportStatus: passport?.status ?? 'revoked',
    decision: pickHighestPriorityDecision(decisionCandidates),
    allowedByPassport,
    allowedByCapability,
    allowedByAuthorityScope,
    evidenceSatisfied,
    approvalsSatisfied,
    missingEvidenceIds,
    missingApprovalIds,
    requiredEvidenceIds,
    requiredApprovalIds,
    appliedPolicyPackIds,
    jurisdictionPackIds,
    warnings,
    errors,
  };
}
