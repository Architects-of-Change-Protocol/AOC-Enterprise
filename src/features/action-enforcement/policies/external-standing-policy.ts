import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';

const POLICY_ID = 'external_standing';

const CLEARED_MAPPED_TYPES = new Set(['execute_allowed', 'approval_required', 'evidence_required']);

/**
 * External standing (visa/ingress) never overrides local Recognition Runtime
 * denial -- it can only ever narrow, not widen, what an external agent may
 * do. Recognition Runtime's own External Agent Handshake integration already
 * folds visa/ingress/standing checks into its ordinary decision type (an
 * invalid visa surfaces as 'revoked'/'expired'/'unrecognized_actor', not as a
 * distinct handshake field on the decision) -- so this policy does not
 * re-derive standing itself, it only confirms that whenever a request
 * declares external standing, the upstream mapped decision is one Recognition
 * Runtime would only reach after validating that standing.
 */
export class ExternalStandingPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    const { request, recognitionResult, recognitionMappedDecisionType } = context;
    const declaresExternalStanding = request.visaId !== undefined || request.ingressGrantId !== undefined || request.handshakeProofId !== undefined;

    if (!declaresExternalStanding) {
      return { policyId: POLICY_ID, passed: true, reasonCode: 'NO_EXTERNAL_STANDING_DECLARED', reason: 'This request does not depend on external agent standing.', severity: 'info' };
    }

    if (recognitionMappedDecisionType !== undefined && !CLEARED_MAPPED_TYPES.has(recognitionMappedDecisionType)) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'EXTERNAL_STANDING_INVALID',
        reason: recognitionResult?.reason ?? 'External agent standing is missing, expired or revoked.',
        severity: 'error',
        decisionType: recognitionMappedDecisionType,
      };
    }

    return { policyId: POLICY_ID, passed: true, reasonCode: 'EXTERNAL_STANDING_VALID', reason: 'External agent standing is confirmed.', severity: 'info' };
  }
}
