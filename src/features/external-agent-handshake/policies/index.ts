import type { HandshakePolicy } from '../domain/handshake-policy.js';
import { ApprovalRequiredPolicy } from './approval-required-policy.js';
import { AuthorityPresentationPolicy } from './authority-presentation-policy.js';
import { ChallengeResponsePolicy } from './challenge-response-policy.js';
import { DataBoundaryPolicy } from './data-boundary-policy.js';
import { DuplicateHandshakePolicy } from './duplicate-handshake-policy.js';
import { ExpirationPolicy } from './expiration-policy.js';
import { ExternalAgentRecognitionPolicy } from './external-agent-recognition-policy.js';
import { LocalTrustBoundaryPolicy } from './local-trust-boundary-policy.js';
import { PassportPresentationPolicy } from './passport-presentation-policy.js';
import { RequestedCapabilityPolicy } from './requested-capability-policy.js';
import { RequestedScopePolicy } from './requested-scope-policy.js';
import { RevocationPolicy } from './revocation-policy.js';
import { RiskClassificationPolicy } from './risk-classification-policy.js';
import { TrustedIssuerPolicy } from './trusted-issuer-policy.js';

export { LocalTrustBoundaryPolicy } from './local-trust-boundary-policy.js';
export { TrustedIssuerPolicy } from './trusted-issuer-policy.js';
export { PassportPresentationPolicy } from './passport-presentation-policy.js';
export { ExternalAgentRecognitionPolicy } from './external-agent-recognition-policy.js';
export { ChallengeResponsePolicy } from './challenge-response-policy.js';
export { RequestedScopePolicy } from './requested-scope-policy.js';
export { RequestedCapabilityPolicy } from './requested-capability-policy.js';
export { DataBoundaryPolicy } from './data-boundary-policy.js';
export { AuthorityPresentationPolicy } from './authority-presentation-policy.js';
export { RiskClassificationPolicy } from './risk-classification-policy.js';
export { ApprovalRequiredPolicy } from './approval-required-policy.js';
export { ExpirationPolicy } from './expiration-policy.js';
export { RevocationPolicy } from './revocation-policy.js';
export { DuplicateHandshakePolicy } from './duplicate-handshake-policy.js';

/**
 * The canonical, deterministic evaluation order for External Agent Handshake
 * policies. Revocation and expiration still get their own late checks (they
 * always win, however evaluation got there), while local-trust-boundary and
 * trusted-issuer fail fast at the top for the clearest possible rejection
 * reason.
 */
export function createDefaultHandshakePolicyChain(): readonly HandshakePolicy[] {
  return [
    new LocalTrustBoundaryPolicy(),
    new TrustedIssuerPolicy(),
    new PassportPresentationPolicy(),
    new ExternalAgentRecognitionPolicy(),
    new ChallengeResponsePolicy(),
    new RequestedScopePolicy(),
    new RequestedCapabilityPolicy(),
    new DataBoundaryPolicy(),
    new AuthorityPresentationPolicy(),
    new RiskClassificationPolicy(),
    new ApprovalRequiredPolicy(),
    new ExpirationPolicy(),
    new RevocationPolicy(),
    new DuplicateHandshakePolicy(),
  ];
}
