import type { GuardActionRequestInput } from '../sdk/aoc-guard.js';
import { READ_PROJECT_SUMMARY, PROJECT_SCOPE, TRUST_DOMAIN_ID, UNKNOWN_AGENT_ACTOR_ID } from './datasys-enforcement.fixture.js';

/**
 * The Unknown External Agent attempting to read the project summary without
 * ever completing an External Agent Handshake. Recognition Runtime denies it
 * outright (unrecognized_actor / rogue actor), so enforcement must block
 * before an executor ever runs.
 */
export function buildUnknownAgentReadGuardInput(overrides: Partial<GuardActionRequestInput> = {}): GuardActionRequestInput {
  return {
    actorId: UNKNOWN_AGENT_ACTOR_ID,
    trustDomainId: TRUST_DOMAIN_ID,
    action: READ_PROJECT_SUMMARY,
    resourceScope: PROJECT_SCOPE,
    sideEffectType: 'read',
    riskLevel: 'low',
    ...overrides,
  };
}
