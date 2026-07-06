import type { ActionRequest } from '../domain/action-request.js';
import type { Policy, PolicyContext, PolicyOutcome } from '../domain/policy.js';

const POLICY_ID = 'evidence_required';

export class EvidencePolicy implements Policy {
  readonly id = POLICY_ID;

  evaluate(request: ActionRequest, context: PolicyContext): PolicyOutcome {
    const requirement = context.capabilityToken?.evidenceRequirements.find((entry) => entry.action === request.action);
    if (!requirement) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'NO_EVIDENCE_REQUIRED',
        reason: `Action ${request.action} does not require evidence.`,
      };
    }

    const providedTypes = new Set((request.evidence ?? []).map((item) => item.type));
    const missingTypes = requirement.requiredEvidenceTypes.filter((type) => !providedTypes.has(type));

    if (missingTypes.length > 0) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'EVIDENCE_MISSING',
        reason: `Action ${request.action} is missing required evidence: ${missingTypes.join(', ')}.`,
        decisionType: 'require_more_evidence',
        requiredEvidence: missingTypes,
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'EVIDENCE_SATISFIED',
      reason: `All required evidence for ${request.action} was provided.`,
    };
  }
}
