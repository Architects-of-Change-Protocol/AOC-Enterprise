import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * An external agent starts every handshake with no local standing. Agents
 * already known to be quarantined, suspended, revoked or expired never
 * proceed past this point, regardless of what their passport/authority claim.
 */
export class ExternalAgentRecognitionPolicy implements HandshakePolicy {
  readonly id = 'external_agent_recognition';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const agent = context.request.externalAgent;
    switch (agent.status) {
      case 'quarantined':
        return {
          policyId: this.id,
          passed: false,
          decisionType: 'quarantined',
          reasonCode: 'EXTERNAL_AGENT_QUARANTINED',
          reason: `External agent ${agent.id} is quarantined.`,
          severity: 'critical',
        };
      case 'revoked':
        return {
          policyId: this.id,
          passed: false,
          decisionType: 'rejected',
          reasonCode: 'EXTERNAL_AGENT_REVOKED',
          reason: `External agent ${agent.id} has been revoked.`,
          severity: 'critical',
        };
      case 'suspended':
        return {
          policyId: this.id,
          passed: false,
          decisionType: 'rejected',
          reasonCode: 'EXTERNAL_AGENT_NO_STANDING',
          reason: `External agent ${agent.id} is suspended and holds no local standing.`,
          severity: 'critical',
        };
      default:
        return {
          policyId: this.id,
          passed: true,
          reasonCode: 'EXTERNAL_AGENT_ELIGIBLE',
          reason: `External agent ${agent.id} is eligible to continue the handshake.`,
          severity: 'info',
        };
    }
  }
}
