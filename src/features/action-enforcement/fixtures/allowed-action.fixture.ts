import type { GuardActionRequestInput } from '../sdk/aoc-guard.js';
import { DRAFT_CLOSURE_EMAIL, EMAIL_THREAD_EVIDENCE, PMFREAK_ACTOR_ID, PMFREAK_DRAFTING_TOKEN_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID, VICTOR_ACTOR_ID } from './datasys-enforcement.fixture.js';

/**
 * PMFreak Closure Agent drafting the closure email: valid recognition, valid
 * authority chain, required evidence attached, no approval pending. The
 * canonical "everything checks out" allowed scenario.
 */
export function buildDraftClosureEmailGuardInput(overrides: Partial<GuardActionRequestInput> = {}): GuardActionRequestInput {
  return {
    actorId: PMFREAK_ACTOR_ID,
    principalActorId: VICTOR_ACTOR_ID,
    trustDomainId: TRUST_DOMAIN_ID,
    action: DRAFT_CLOSURE_EMAIL,
    resourceScope: PROJECT_SCOPE,
    capability: 'project_closure.drafting',
    sideEffectType: 'write',
    riskLevel: 'medium',
    metadata: { passportId: 'passport-pmfreak', capabilityTokenId: PMFREAK_DRAFTING_TOKEN_ID, evidence: EMAIL_THREAD_EVIDENCE },
    ...overrides,
  };
}
