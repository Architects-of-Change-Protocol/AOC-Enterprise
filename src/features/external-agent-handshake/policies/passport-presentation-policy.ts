import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * A presented passport must be current, unrevoked and issued by an issuer
 * this trust domain accepts before the handshake can proceed further.
 */
export class PassportPresentationPolicy implements HandshakePolicy {
  readonly id = 'passport_presentation';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const presentation = context.request.passportPresentation;
    if (!presentation) {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'PASSPORT_MISSING',
        reason: 'No passport presentation was provided.',
        severity: 'critical',
      };
    }

    switch (presentation.status) {
      case 'valid':
        return { policyId: this.id, passed: true, reasonCode: 'PASSPORT_VALID', reason: `Passport presentation ${presentation.id} is valid.`, severity: 'info' };
      case 'expired':
        return {
          policyId: this.id,
          passed: false,
          decisionType: 'rejected',
          reasonCode: 'PASSPORT_EXPIRED',
          reason: `Passport presentation ${presentation.id} has expired.`,
          severity: 'critical',
        };
      case 'revoked':
        return {
          policyId: this.id,
          passed: false,
          decisionType: 'rejected',
          reasonCode: 'PASSPORT_REVOKED',
          reason: `Passport presentation ${presentation.id} was revoked.`,
          severity: 'critical',
        };
      case 'issuer_untrusted':
        return {
          policyId: this.id,
          passed: false,
          decisionType: 'rejected',
          reasonCode: 'PASSPORT_ISSUER_UNTRUSTED',
          reason: `Passport presentation ${presentation.id} was issued by an untrusted issuer.`,
          severity: 'critical',
        };
      default:
        return {
          policyId: this.id,
          passed: false,
          decisionType: 'rejected',
          reasonCode: 'PASSPORT_INVALID',
          reason: `Passport presentation ${presentation.id} is invalid.`,
          severity: 'critical',
        };
    }
  }
}
