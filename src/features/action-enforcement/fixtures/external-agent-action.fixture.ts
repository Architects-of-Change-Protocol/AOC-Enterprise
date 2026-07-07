import type { HandshakeDecisionResult } from '../../external-agent-handshake/services/handshake-decision-service.js';
import { submitTrustedPartnerHandshakeRequest } from '../../external-agent-handshake/fixtures/known-partner-agent.fixture.js';
import type { GuardActionRequestInput } from '../sdk/aoc-guard.js';
import type { DatasysEnforcementFixture } from './datasys-enforcement.fixture.js';
import { PROJECT_SCOPE, READ_PROJECT_SUMMARY, TRUST_DOMAIN_ID, TRUSTED_PARTNER_AGENT_ID } from './datasys-enforcement.fixture.js';

/** Completes the Trusted Partner Research Agent's handshake, returning the accepted visa/ingress decision. */
export function completeTrustedPartnerHandshake(fixture: DatasysEnforcementFixture, requestId = 'handshake-request-enforcement-demo'): HandshakeDecisionResult {
  const request = submitTrustedPartnerHandshakeRequest(fixture.handshakeRuntime, { id: requestId });
  return fixture.handshakeRuntime.decideHandshake(request.id);
}

/**
 * Trusted Partner Research Agent reading the project summary once its visa
 * and ingress grant are active. Recognition Runtime allows (local capability
 * plus confirmed external standing), so enforcement allows and the executor
 * runs exactly once.
 */
export function buildTrustedPartnerReadGuardInput(handshake: HandshakeDecisionResult, overrides: Partial<GuardActionRequestInput> = {}): GuardActionRequestInput {
  return {
    actorId: TRUSTED_PARTNER_AGENT_ID,
    trustDomainId: TRUST_DOMAIN_ID,
    action: READ_PROJECT_SUMMARY,
    resourceScope: PROJECT_SCOPE,
    capability: READ_PROJECT_SUMMARY,
    sideEffectType: 'read',
    riskLevel: 'low',
    ...(handshake.visa !== undefined ? { visaId: handshake.visa.id } : {}),
    ...(handshake.ingressGrant !== undefined ? { ingressGrantId: handshake.ingressGrant.id } : {}),
    ...(handshake.proof !== undefined ? { handshakeProofId: handshake.proof.id } : {}),
    metadata: { passportId: 'passport-trusted-partner', capabilityTokenId: 'cap-trusted-partner-read' },
    ...overrides,
  };
}
