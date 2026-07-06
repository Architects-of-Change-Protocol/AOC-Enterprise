import type { ActionRequest } from '../domain/action-request.js';
import type { Policy, PolicyContext, PolicyOutcome } from '../domain/policy.js';

const POLICY_ID = 'valid_passport_required';

export class ValidPassportPolicy implements Policy {
  readonly id = POLICY_ID;

  evaluate(request: ActionRequest, context: PolicyContext): PolicyOutcome {
    if (request.passportId === undefined) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'PASSPORT_REQUIRED',
        reason: 'This request does not carry a passport.',
        decisionType: 'invalid_passport',
      };
    }

    const { passport } = context;
    if (!passport) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'PASSPORT_NOT_FOUND',
        reason: `No passport found for id ${request.passportId}.`,
        decisionType: 'invalid_passport',
      };
    }

    if (passport.status === 'revoked') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'PASSPORT_REVOKED',
        reason: `Passport ${passport.id} has been revoked.`,
        decisionType: 'revoked',
      };
    }

    if (passport.expiresAt !== undefined && passport.expiresAt <= context.now) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'PASSPORT_EXPIRED',
        reason: `Passport ${passport.id} has expired.`,
        decisionType: 'expired',
      };
    }

    if (passport.status === 'suspended') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'PASSPORT_SUSPENDED',
        reason: `Passport ${passport.id} is suspended.`,
        decisionType: 'invalid_passport',
      };
    }

    if (passport.subjectActorId !== request.actorId) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'PASSPORT_SUBJECT_MISMATCH',
        reason: `Passport ${passport.id} does not belong to actor ${request.actorId}.`,
        decisionType: 'invalid_passport',
      };
    }

    if (passport.trustDomainId !== request.trustDomainId) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'PASSPORT_TRUST_DOMAIN_MISMATCH',
        reason: `Passport ${passport.id} was not issued within trust domain ${request.trustDomainId}.`,
        decisionType: 'invalid_passport',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'PASSPORT_VALID',
      reason: `Passport ${passport.id} is valid.`,
    };
  }
}
