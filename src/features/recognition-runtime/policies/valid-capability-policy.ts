import type { ActionRequest } from '../domain/action-request.js';
import type { Policy, PolicyContext, PolicyOutcome } from '../domain/policy.js';

const POLICY_ID = 'valid_capability_required';

export class ValidCapabilityPolicy implements Policy {
  readonly id = POLICY_ID;

  evaluate(request: ActionRequest, context: PolicyContext): PolicyOutcome {
    if (request.capabilityTokenId === undefined) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'CAPABILITY_TOKEN_REQUIRED',
        reason: 'This request does not carry a capability token.',
        decisionType: 'invalid_capability',
      };
    }

    const { capabilityToken } = context;
    if (!capabilityToken) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'CAPABILITY_TOKEN_NOT_FOUND',
        reason: `No capability token found for id ${request.capabilityTokenId}.`,
        decisionType: 'invalid_capability',
      };
    }

    if (capabilityToken.status === 'revoked') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'CAPABILITY_TOKEN_REVOKED',
        reason: `Capability token ${capabilityToken.id} has been revoked.`,
        decisionType: 'revoked',
      };
    }

    if (capabilityToken.expiresAt !== undefined && capabilityToken.expiresAt <= context.now) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'CAPABILITY_TOKEN_EXPIRED',
        reason: `Capability token ${capabilityToken.id} has expired.`,
        decisionType: 'expired',
      };
    }

    if (capabilityToken.status === 'suspended') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'CAPABILITY_TOKEN_SUSPENDED',
        reason: `Capability token ${capabilityToken.id} is suspended.`,
        decisionType: 'invalid_capability',
      };
    }

    if (capabilityToken.subjectActorId !== request.actorId) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'CAPABILITY_TOKEN_SUBJECT_MISMATCH',
        reason: `Capability token ${capabilityToken.id} does not belong to actor ${request.actorId}.`,
        decisionType: 'invalid_capability',
      };
    }

    if (capabilityToken.trustDomainId !== request.trustDomainId) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'CAPABILITY_TOKEN_TRUST_DOMAIN_MISMATCH',
        reason: `Capability token ${capabilityToken.id} was not issued within trust domain ${request.trustDomainId}.`,
        decisionType: 'invalid_capability',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'CAPABILITY_TOKEN_VALID',
      reason: `Capability token ${capabilityToken.id} is valid.`,
    };
  }
}
