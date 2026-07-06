import type { ActionRequest } from '../domain/action-request.js';
import type { Policy, PolicyContext, PolicyOutcome } from '../domain/policy.js';

const POLICY_ID = 'approval_required';

export class ApprovalPolicy implements Policy {
  readonly id = POLICY_ID;

  evaluate(request: ActionRequest, context: PolicyContext): PolicyOutcome {
    const approval = context.capabilityToken?.approvalRequirement;
    if (!approval?.actions.includes(request.action)) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'NO_APPROVAL_REQUIRED',
        reason: `Action ${request.action} does not require human approval.`,
      };
    }

    return {
      policyId: POLICY_ID,
      passed: false,
      reasonCode: 'HUMAN_APPROVAL_REQUIRED',
      reason: `Action ${request.action} requires human approval before it can proceed.`,
      decisionType: 'require_human_approval',
      ...(context.capabilityToken?.riskLevel !== undefined ? { riskLevel: context.capabilityToken.riskLevel } : {}),
      ...(approval.requiredApproverActorIds !== undefined ? { requiredApproverActorIds: approval.requiredApproverActorIds } : {}),
    };
  }
}
