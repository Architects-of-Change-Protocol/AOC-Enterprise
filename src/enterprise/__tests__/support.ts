import {
  bridgeRecognitionRuntime,
  buildDatasysEnforcementFixture,
  DRAFT_CLOSURE_EMAIL,
  EMAIL_THREAD_EVIDENCE,
  PMFREAK_ACTOR_ID,
  PMFREAK_COMMUNICATION_TOKEN_ID,
  PMFREAK_DRAFTING_TOKEN_ID,
  PROJECT_SCOPE,
  READ_PROJECT_SUMMARY,
  SEND_CLIENT_FOLLOW_UP,
  TRUST_DOMAIN_ID,
  UNKNOWN_AGENT_ACTOR_ID,
  VICTOR_ACTOR_ID,
} from '../../features/action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { createManualEnforcementClock, createSequentialEnforcementIdGenerator } from '../../features/action-enforcement/runtime/enforcement-runtime-context.js';
import type { GovernanceEvaluateRequestBody } from '../api/governance-evaluate-contract.js';
import type { KernelProviderSet } from '../providers/kernel-provider-composition.js';

export const FIXTURE_NOW = '2026-01-01T00:00:00.000Z';

/**
 * Builds a real, fully-seeded `KernelProviderSet` from the exact same
 * "Datasys Agent Republic" fixture the Kernel's own characterization suite
 * runs against (`bridgeRecognitionRuntime` over `buildDatasysEnforcementFixture()`).
 * Every Enterprise Host test that needs an "allowed" or "approval_required"
 * outcome uses this instead of the Enterprise Host's own fail-closed empty default
 * -- there is no fake/mock decision engine anywhere in this test suite,
 * only real Recognition Runtime, Authority Graph, Approval Runtime, and
 * External Agent Handshake instances, wired exactly as they are in
 * production, seeded with test data.
 */
export function buildTestKernelProviders(): KernelProviderSet {
  const fixture = buildDatasysEnforcementFixture();
  return {
    recognitionRuntime: fixture.recognitionRuntime,
    authorityRuntime: fixture.authorityRuntime,
    approvalRuntime: fixture.approvalRuntime,
    handshakeRuntime: fixture.handshakeRuntime,
    recognitionProvider: bridgeRecognitionRuntime(fixture.recognitionRuntime),
    clock: createManualEnforcementClock(FIXTURE_NOW),
    idGenerator: createSequentialEnforcementIdGenerator(),
  };
}

/** The canonical "everything checks out" allowed scenario, as an Enterprise Host wire request body. */
export function buildAllowedRequestBody(overrides: Partial<GovernanceEvaluateRequestBody> = {}): GovernanceEvaluateRequestBody {
  return {
    actor: { id: PMFREAK_ACTOR_ID, principalId: VICTOR_ACTOR_ID, trustDomainId: TRUST_DOMAIN_ID },
    action: { type: DRAFT_CLOSURE_EMAIL, resourceScope: PROJECT_SCOPE, capability: 'project_closure.drafting', sideEffectType: 'write', riskLevel: 'medium' },
    context: { passportId: 'passport-pmfreak', capabilityTokenId: PMFREAK_DRAFTING_TOKEN_ID, evidence: EMAIL_THREAD_EVIDENCE },
    ...overrides,
  };
}

/** An unrecognized external actor -- denied by recognition, no authority/approval/policy chain ever runs. */
export function buildDeniedRequestBody(overrides: Partial<GovernanceEvaluateRequestBody> = {}): GovernanceEvaluateRequestBody {
  return {
    actor: { id: UNKNOWN_AGENT_ACTOR_ID, trustDomainId: TRUST_DOMAIN_ID },
    action: { type: READ_PROJECT_SUMMARY, resourceScope: PROJECT_SCOPE, sideEffectType: 'read', riskLevel: 'low' },
    ...overrides,
  };
}

/** PMFreak attempting to send a client follow-up before Victor has approved it -- a genuine `approval_required` outcome. */
export function buildApprovalRequiredRequestBody(overrides: Partial<GovernanceEvaluateRequestBody> = {}): GovernanceEvaluateRequestBody {
  return {
    actor: { id: PMFREAK_ACTOR_ID, principalId: VICTOR_ACTOR_ID, trustDomainId: TRUST_DOMAIN_ID },
    action: { type: SEND_CLIENT_FOLLOW_UP, resourceScope: PROJECT_SCOPE, capability: 'project_closure.client_communication', sideEffectType: 'send_message', riskLevel: 'high' },
    context: { passportId: 'passport-pmfreak', capabilityTokenId: PMFREAK_COMMUNICATION_TOKEN_ID },
    ...overrides,
  };
}
