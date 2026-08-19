import type {
  AgentPassport,
  AgentPassportStatus,
  AgentPolicyManifest,
  AgentRuntimeActionRequest,
  AgentRuntimeSeal,
  EvaluateAgentRuntimeGuardDeps,
  EvaluateAgentRuntimeGuardOptions,
} from '@aoc-enterprise/agent-governance';
import type { PMFreakAgentRole } from '../domain/pmfreak-agent-role.js';
import type { PMFreakAuthorityScope, PMFreakProjectPhase } from '../domain/pmfreak-authority-scope.js';
import {
  isCustomerWithinPMFreakAuthorityScope,
  isProjectPhaseWithinPMFreakAuthorityScope,
  isProjectWithinPMFreakAuthorityScope,
  isWorkspaceWithinPMFreakAuthorityScope,
} from '../domain/pmfreak-authority-scope.js';
import type { PMFreakCapabilityTokenMirror } from '../domain/pmfreak-capability-token-mirror.js';
import type { PMFreakEvidenceRequirementMirror } from '../domain/pmfreak-evidence-requirement-mirror.js';
import type { PMFreakApprovalRequirementMirror, PMFreakApprovalRequirementType } from '../domain/pmfreak-approval-requirement-mirror.js';
import type { PMFreakPassportActionDecision } from '../domain/pmfreak-passport-action-decision.js';
import { PMFREAK_PASSPORT_ACTION_DECISION_PRIORITY } from '../domain/pmfreak-passport-action-decision.js';
import { evaluatePMFreakAgentRuntimeGuard } from './pmfreak-agent-runtime-guard-service.js';

/**
 * PMFreak agent passport action resolver.
 *
 * Ports the decision logic of the demo pack's
 * `resolvePMFreakAgentPassportAction`
 * (`src/features/aoc-enterprise-demo/pmfreak-agent-passport/pmfreak-passport-resolver.ts`)
 * onto this package's real dependencies: a real `AgentPassport` /
 * `AgentPolicyManifest` / `AgentRuntimeSeal` gated through the real
 * `evaluateAgentRuntimeGuard` (wrapped here as `evaluatePMFreakAgentRuntimeGuard`),
 * combined with this package's own capability-token, evidence-requirement,
 * and approval-requirement structural mirrors and authority-scope model.
 *
 * A passport (and a runtime-guard allow) granting authority for an action
 * never by itself authorizes execution -- capability scope, authority
 * scope, evidence, and approvals still gate it.
 *
 * Passport status handling (documented, deterministic):
 *   - status !== 'active' and !== 'suspended' (draft/issued/revoked/expired) -> deny
 *   - suspended -> hold
 *   - active -> evaluated via the real runtime guard, then capability/scope/evidence/approval gates below
 *
 * Decision priority (highest wins when multiple conditions apply), matching
 * the demo resolver's priority order:
 *   deny > require_legal_review > require_contract_review > require_billing_review >
 *   require_security_review > require_executive_approval > require_customer_validation >
 *   require_pm_approval > require_evidence > hold > allow
 */

export interface ResolvePMFreakAgentPassportActionInput {
  readonly actionAttemptId: string;
  readonly role: PMFreakAgentRole;

  readonly request: AgentRuntimeActionRequest;
  readonly passport: AgentPassport;
  readonly runtimeSeal: AgentRuntimeSeal | null | undefined;
  readonly policyManifest: AgentPolicyManifest;
  readonly guardOptions?: EvaluateAgentRuntimeGuardOptions;

  readonly authorityScope: PMFreakAuthorityScope;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly projectPhase: PMFreakProjectPhase;
  readonly customerId?: string;

  /** The capability token this action is attempted under, if any. */
  readonly capabilityToken?: PMFreakCapabilityTokenMirror;

  /** Every evidence requirement applicable to this action attempt. */
  readonly evidenceRequirements: readonly PMFreakEvidenceRequirementMirror[];

  /** Every approval requirement applicable to this action attempt. */
  readonly approvalRequirements: readonly PMFreakApprovalRequirementMirror[];
  /** IDs (from `approvalRequirements`) that have already been granted. */
  readonly grantedApprovalRequirementIds: readonly string[];

  readonly context?: {
    readonly customerFacing?: boolean;
    readonly billingSensitive?: boolean;
    readonly contractSensitive?: boolean;
    readonly legalSensitive?: boolean;
    readonly externalCommunication?: boolean;
    readonly customerCommitment?: boolean;
  };
}

export interface PMFreakAgentPassportResolution {
  readonly actionAttemptId: string;
  readonly passportId: string;
  readonly actionId: string;
  readonly role: PMFreakAgentRole;

  readonly passportStatus: AgentPassportStatus;

  readonly decision: PMFreakPassportActionDecision;

  readonly allowedByRuntimeGuard: boolean;
  readonly allowedByCapabilityToken: boolean;
  readonly allowedByAuthorityScope: boolean;
  readonly evidenceSatisfied: boolean;
  readonly approvalsSatisfied: boolean;

  readonly requiredEvidenceIds: readonly string[];
  readonly missingEvidenceIds: readonly string[];

  readonly requiredApprovalIds: readonly string[];
  readonly missingApprovalIds: readonly string[];

  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

const SAFE_FRAMING_WARNING =
  'This decision reflects Soberanía Enterprise passport, runtime-guard, capability, evidence, and approval gating only. It is not legal advice, not a compliance certification, and not a guarantee of contractual, billing, or invoice validity.';

const APPROVAL_TYPE_TO_DECISION: Readonly<Record<PMFreakApprovalRequirementType, PMFreakPassportActionDecision>> = {
  legal_review: 'require_legal_review',
  contract_review: 'require_contract_review',
  billing_review: 'require_billing_review',
  security_review: 'require_security_review',
  executive_approval: 'require_executive_approval',
  customer_validation: 'require_customer_validation',
  pm_approval: 'require_pm_approval',
  // These two approval types have no dedicated review decision in the
  // priority list above; they escalate to PM approval by default rather
  // than silently allowing, mirroring the demo resolver's fallback.
  project_sponsor_approval: 'require_pm_approval',
  commercial_review: 'require_pm_approval',
};

function pickHighestPriorityDecision(candidates: ReadonlySet<PMFreakPassportActionDecision>): PMFreakPassportActionDecision {
  for (const decision of PMFREAK_PASSPORT_ACTION_DECISION_PRIORITY) {
    if (candidates.has(decision)) return decision;
  }
  return 'allow';
}

export async function resolvePMFreakAgentPassportAction(
  input: ResolvePMFreakAgentPassportActionInput,
  deps: EvaluateAgentRuntimeGuardDeps,
): Promise<PMFreakAgentPassportResolution> {
  const warnings: string[] = [SAFE_FRAMING_WARNING];
  const errors: string[] = [];
  const decisionCandidates = new Set<PMFreakPassportActionDecision>();

  const { passport } = input;
  const actionId = input.request.requestedAction;

  let allowedByRuntimeGuard = false;

  if (passport.status === 'active') {
    const guardDecision = await evaluatePMFreakAgentRuntimeGuard(
      {
        request: input.request,
        passport,
        runtimeSeal: input.runtimeSeal,
        policyManifest: input.policyManifest,
        ...(input.guardOptions !== undefined ? { options: input.guardOptions } : {}),
      },
      deps,
    );

    if (guardDecision.outcome === 'deny') {
      errors.push(
        `Runtime guard denied action "${actionId}" for passport "${passport.passportId}" (${guardDecision.reasonCodes.join(', ')}).`,
      );
      decisionCandidates.add('deny');
    } else if (guardDecision.outcome === 'require_human_approval') {
      warnings.push(
        `Runtime guard requires human approval for action "${actionId}" on passport "${passport.passportId}" (${guardDecision.reasonCodes.join(', ')}).`,
      );
      decisionCandidates.add('require_pm_approval');
    } else {
      allowedByRuntimeGuard = true;
    }
  } else if (passport.status === 'suspended') {
    warnings.push(`Passport "${passport.passportId}" is suspended; the action is held pending reinstatement.`);
    decisionCandidates.add('hold');
  } else {
    errors.push(`Passport "${passport.passportId}" is not active (status: "${passport.status}").`);
    decisionCandidates.add('deny');
  }

  const token = input.capabilityToken;
  let allowedByCapabilityToken = false;
  if (token === undefined) {
    errors.push(`No capability token supplied for action "${actionId}".`);
    decisionCandidates.add('deny');
  } else if (token.status !== 'valid') {
    errors.push(`Capability token "${token.id}" is not valid (status: "${token.status}").`);
    decisionCandidates.add('deny');
  } else if (token.constraints.prohibitedActions.includes(actionId)) {
    errors.push(`Action "${actionId}" is explicitly prohibited by capability token "${token.id}".`);
    decisionCandidates.add('deny');
  } else if (!token.actions.includes(actionId)) {
    errors.push(`Action "${actionId}" is not among the actions authorized by capability token "${token.id}".`);
    decisionCandidates.add('deny');
  } else {
    allowedByCapabilityToken = true;
  }

  const allowedByAuthorityScope =
    isWorkspaceWithinPMFreakAuthorityScope(input.authorityScope, input.workspaceId) &&
    isProjectWithinPMFreakAuthorityScope(input.authorityScope, input.projectId) &&
    isProjectPhaseWithinPMFreakAuthorityScope(input.authorityScope, input.projectPhase) &&
    isCustomerWithinPMFreakAuthorityScope(input.authorityScope, input.customerId);

  if (!allowedByAuthorityScope) {
    errors.push(`Action attempt is outside passport "${passport.passportId}"'s authority scope (workspace/project/phase/customer).`);
    decisionCandidates.add('deny');
  }

  const requiredEvidence = input.evidenceRequirements.filter((requirement) => requirement.required);
  const missingEvidence = requiredEvidence.filter(
    (requirement) => requirement.status !== 'satisfied' && requirement.status !== 'waived',
  );
  const evidenceSatisfied = missingEvidence.length === 0;
  if (!evidenceSatisfied) decisionCandidates.add('require_evidence');

  const missingApprovalRequirements = input.approvalRequirements.filter(
    (requirement) => !input.grantedApprovalRequirementIds.includes(requirement.id),
  );
  const approvalsSatisfied = missingApprovalRequirements.length === 0;
  for (const requirement of missingApprovalRequirements) {
    decisionCandidates.add(APPROVAL_TYPE_TO_DECISION[requirement.type]);
  }

  const context = input.context ?? {};
  const hasGrantedApprovalOfType = (type: PMFreakApprovalRequirementType): boolean =>
    input.approvalRequirements.some(
      (requirement) => requirement.type === type && input.grantedApprovalRequirementIds.includes(requirement.id),
    );

  if (context.legalSensitive === true && !hasGrantedApprovalOfType('legal_review')) {
    decisionCandidates.add('require_legal_review');
    warnings.push('Legal-sensitive context flagged; this does not constitute legal advice or legal clearance.');
  }

  if (context.contractSensitive === true && !hasGrantedApprovalOfType('contract_review')) {
    decisionCandidates.add('require_contract_review');
  }

  if (context.billingSensitive === true && !hasGrantedApprovalOfType('billing_review')) {
    decisionCandidates.add('require_billing_review');
  }

  if (context.customerCommitment === true) {
    if (!hasGrantedApprovalOfType('contract_review')) decisionCandidates.add('require_contract_review');
    if (!hasGrantedApprovalOfType('customer_validation')) decisionCandidates.add('require_customer_validation');
  }

  if ((context.externalCommunication === true || context.customerFacing === true) && !hasGrantedApprovalOfType('pm_approval')) {
    decisionCandidates.add('require_pm_approval');
  }

  if (decisionCandidates.size === 0) decisionCandidates.add('allow');

  return {
    actionAttemptId: input.actionAttemptId,
    passportId: passport.passportId,
    actionId,
    role: input.role,
    passportStatus: passport.status,
    decision: pickHighestPriorityDecision(decisionCandidates),
    allowedByRuntimeGuard,
    allowedByCapabilityToken,
    allowedByAuthorityScope,
    evidenceSatisfied,
    approvalsSatisfied,
    requiredEvidenceIds: requiredEvidence.map((requirement) => requirement.id),
    missingEvidenceIds: missingEvidence.map((requirement) => requirement.id),
    requiredApprovalIds: input.approvalRequirements.map((requirement) => requirement.id),
    missingApprovalIds: missingApprovalRequirements.map((requirement) => requirement.id),
    warnings,
    errors,
  };
}
