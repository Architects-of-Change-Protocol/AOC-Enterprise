import type { PMFreakAgentPassportDecision } from '../../aoc-enterprise-demo/pmfreak-agent-passport/index.js';
import { buildPMFreakAgentPassportRegistryFixture, resolvePMFreakAgentPassportAction } from '../../aoc-enterprise-demo/pmfreak-agent-passport/index.js';
import { createAocPMFreakGovernanceRequestIntakeConfig } from './aoc-pmfreak-governance-intake-config.js';
import { validateAocPMFreakGovernanceRequest } from './aoc-pmfreak-governance-intake-validator.js';
import { mapAocPMFreakGovernanceRequestToEvaluationInput, mapAocPMFreakGovernanceRequestToPassportResolverInput } from './aoc-pmfreak-request-to-passport-adapter.js';
import { createAocPMFreakGovernanceResponse } from './aoc-pmfreak-governance-response-builder.js';
import type {
  AocPMFreakGovernanceDecision,
  AocPMFreakGovernanceRequest,
  AocPMFreakGovernanceRequestIntakeConfigInput,
  AocPMFreakGovernanceResponse,
} from './aoc-pmfreak-governance-intake-types.js';

export interface EvaluateAocPMFreakGovernanceRequestInput {
  readonly request: AocPMFreakGovernanceRequest;
  readonly config?: AocPMFreakGovernanceRequestIntakeConfigInput;
}

/**
 * Default deterministic decision rules, matching the PMFreak Governance
 * Request Client v1 mock, in priority order (first match wins):
 *   1. invalid request                              -> deny (handled before this function runs)
 *   2. actionAttempt.status === 'cancelled'          -> deny
 *   3. billing action + missing evidence             -> require_evidence
 *   4. billing action + missing billing_review       -> require_billing_review
 *   5. missing evidence                              -> require_evidence
 *   6. missing pm_approval                           -> require_pm_approval
 *   7. missing customer_validation                   -> require_customer_validation
 *   8. missing contract_review                       -> require_contract_review
 *   9. missing security_review                       -> require_security_review
 *   10. missing executive_approval                   -> require_executive_approval
 *   11. otherwise                                    -> allow
 */
function decideDeterministicLocal(request: AocPMFreakGovernanceRequest): { decision: AocPMFreakGovernanceDecision; reasonCodes: string[] } {
  if (request.actionAttempt.status === 'cancelled') {
    return { decision: 'deny', reasonCodes: ['action_attempt_cancelled'] };
  }

  const isBillingAction = request.actionAttempt.actionCategory === 'billing' || request.billingContext?.billingSensitive === true;
  const missingEvidenceIds = request.evidenceContext.missingEvidenceIds;
  const missingApprovalIds = request.approvalContext.missingApprovalIds;
  const hasMissingApproval = (needle: string): boolean => missingApprovalIds.some((id) => id.toLowerCase().includes(needle));

  if (isBillingAction && missingEvidenceIds.length > 0) {
    return { decision: 'require_evidence', reasonCodes: ['billing_action_missing_evidence'] };
  }
  if (isBillingAction && hasMissingApproval('billing_review')) {
    return { decision: 'require_billing_review', reasonCodes: ['billing_action_missing_billing_review'] };
  }
  if (missingEvidenceIds.length > 0) {
    return { decision: 'require_evidence', reasonCodes: ['missing_evidence'] };
  }
  if (hasMissingApproval('pm_approval')) {
    return { decision: 'require_pm_approval', reasonCodes: ['missing_pm_approval'] };
  }
  if (hasMissingApproval('customer_validation')) {
    return { decision: 'require_customer_validation', reasonCodes: ['missing_customer_validation'] };
  }
  if (hasMissingApproval('contract_review')) {
    return { decision: 'require_contract_review', reasonCodes: ['missing_contract_review'] };
  }
  if (hasMissingApproval('security_review')) {
    return { decision: 'require_security_review', reasonCodes: ['missing_security_review'] };
  }
  if (hasMissingApproval('executive_approval')) {
    return { decision: 'require_executive_approval', reasonCodes: ['missing_executive_approval'] };
  }

  return { decision: 'allow', reasonCodes: ['no_blocking_condition_found'] };
}

/**
 * This intake's public decision vocabulary has no dedicated legal-review
 * bucket (see `AocPMFreakGovernanceDecision`). A legal-review escalation
 * from the passport resolver is routed through `require_contract_review`,
 * the closest existing review path -- every response still carries a fixed
 * disclaimer that this is never legal advice or legal clearance.
 */
const PASSPORT_DECISION_TO_AOC_DECISION: Readonly<Record<PMFreakAgentPassportDecision, AocPMFreakGovernanceDecision>> = {
  allow: 'allow',
  hold: 'hold',
  deny: 'deny',
  require_evidence: 'require_evidence',
  require_pm_approval: 'require_pm_approval',
  require_customer_validation: 'require_customer_validation',
  require_contract_review: 'require_contract_review',
  require_billing_review: 'require_billing_review',
  require_legal_review: 'require_contract_review',
  require_security_review: 'require_security_review',
  require_executive_approval: 'require_executive_approval',
};

interface PassportRuntimeResult {
  readonly decision: AocPMFreakGovernanceDecision;
  readonly reasonCodes: string[];
  readonly requiredEvidenceIds: string[];
  readonly requiredApprovalIds: string[];
  readonly missingEvidenceIds: string[];
  readonly missingApprovalIds: string[];
  readonly policyPackIds: string[];
  readonly warnings: string[];
  readonly errors: string[];
}

/**
 * Delegates to the existing, exported PMFreak Agent Passport demo resolver
 * against its own deterministic fixture registry (this intake has no
 * production passport store of its own). Never duplicates the resolver's
 * internals and never invents a second policy engine.
 */
function decidePassportRuntime(request: AocPMFreakGovernanceRequest): PassportRuntimeResult {
  const resolverInput = mapAocPMFreakGovernanceRequestToPassportResolverInput(request);
  const registry = buildPMFreakAgentPassportRegistryFixture();
  const resolution = resolvePMFreakAgentPassportAction(resolverInput, registry);

  return {
    decision: PASSPORT_DECISION_TO_AOC_DECISION[resolution.decision],
    reasonCodes: [`passport_runtime_decision_${resolution.decision}`],
    requiredEvidenceIds: [...resolution.requiredEvidenceIds],
    requiredApprovalIds: [...resolution.requiredApprovalIds],
    missingEvidenceIds: [...resolution.missingEvidenceIds],
    missingApprovalIds: [...resolution.missingApprovalIds],
    policyPackIds: [...resolution.appliedPolicyPackIds],
    warnings: [...resolution.warnings],
    errors: [...resolution.errors],
  };
}

/**
 * Evaluates a PMFreak governance request and returns a governed Soberanía
 * response. Deterministic in `deterministic_local` mode (the default) and
 * in `passport_runtime` mode (backed by a deterministic fixture registry).
 * Never mutates `input.request`, never contacts PMFreak, never executes an
 * action, and never writes a decision back into PMFreak.
 */
export function evaluateAocPMFreakGovernanceRequest(input: EvaluateAocPMFreakGovernanceRequestInput): AocPMFreakGovernanceResponse {
  const config = createAocPMFreakGovernanceRequestIntakeConfig(input.config);
  const validation = validateAocPMFreakGovernanceRequest(input.request);

  if (!validation.valid) {
    return createAocPMFreakGovernanceResponse({
      request: input.request,
      decision: 'deny',
      reasonCodes: ['invalid_request'],
      warnings: validation.warnings,
      errors: validation.errors,
    });
  }

  if (config.evaluationMode === 'unsupported') {
    return createAocPMFreakGovernanceResponse({
      request: input.request,
      decision: 'deny',
      reasonCodes: ['unsupported_runtime'],
      warnings: [...validation.warnings, `Evaluation mode "${config.evaluationMode}" is not supported; the request was denied rather than silently allowed.`],
    });
  }

  if (config.evaluationMode === 'passport_runtime') {
    const resolved = decidePassportRuntime(input.request);
    return createAocPMFreakGovernanceResponse({
      request: input.request,
      decision: resolved.decision,
      reasonCodes: resolved.reasonCodes,
      requiredEvidenceIds: resolved.requiredEvidenceIds,
      requiredApprovalIds: resolved.requiredApprovalIds,
      missingEvidenceIds: resolved.missingEvidenceIds,
      missingApprovalIds: resolved.missingApprovalIds,
      policyPackIds: resolved.policyPackIds,
      warnings: [...validation.warnings, ...resolved.warnings],
      errors: resolved.errors,
    });
  }

  const evaluationInput = mapAocPMFreakGovernanceRequestToEvaluationInput(input.request);
  const decided = decideDeterministicLocal(input.request);

  return createAocPMFreakGovernanceResponse({
    request: input.request,
    decision: decided.decision,
    reasonCodes: decided.reasonCodes,
    requiredEvidenceIds: [...input.request.evidenceContext.evidenceReferenceIds],
    requiredApprovalIds: [...input.request.approvalContext.approvalReferenceIds],
    missingEvidenceIds: evaluationInput.missingEvidenceIds,
    missingApprovalIds: evaluationInput.missingApprovalIds,
    policyPackIds: evaluationInput.policyPackIds,
    jurisdictionPackIds: evaluationInput.jurisdictionPackIds,
    warnings: validation.warnings,
  });
}
