import type { ActionRequest } from '../domain/action-request.js';
import type { Policy, PolicyContext, PolicyOutcome } from '../domain/policy.js';

const POLICY_ID = 'revocation_wins';

export class RevocationPolicy implements Policy {
  readonly id = POLICY_ID;

  evaluate(_request: ActionRequest, context: PolicyContext): PolicyOutcome {
    const { revocation } = context;

    if (revocation.revoked) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'REVOKED',
        reason: `${revocation.revokedEntityType ?? 'entity'} ${revocation.revokedEntityId ?? ''} has been revoked.`,
        decisionType: 'revoked',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'NOT_REVOKED',
      reason: 'No revoked entities were found in this request.',
    };
  }
}
