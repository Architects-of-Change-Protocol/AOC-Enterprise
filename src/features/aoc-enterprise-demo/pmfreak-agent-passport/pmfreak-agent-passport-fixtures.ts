import { createDefaultPMFreakAuthorityScope } from './pmfreak-authority-scope.js';
import { findPMFreakAgentRoleProfile } from './pmfreak-agent-roles.js';
import {
  PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID,
  PMFREAK_AGENT_PASSPORT_ISSUER,
  PMFREAK_DEMO_EXPIRED_AT,
  PMFREAK_DEMO_EXPIRES_AT,
  PMFREAK_DEMO_ISSUED_AT,
  PMFREAK_DEMO_OUT_OF_SCOPE_PROJECT_ID,
  PMFREAK_DEMO_PROJECT_ID,
  PMFREAK_DEMO_WORKSPACE_ID,
  PMFREAK_SYSTEM_ID,
} from './pmfreak-agent-passport-constants.js';
import type { PMFreakAgentPassport, PMFreakAgentPassportRegistry, PMFreakAgentRole, ResolvePMFreakAgentPassportActionInput } from './pmfreak-agent-passport-types.js';
import { createPMFreakAgentPassportRegistry } from './pmfreak-passport-registry.js';

function buildPassport(role: PMFreakAgentRole, overrides: Partial<PMFreakAgentPassport> & Pick<PMFreakAgentPassport, 'passportId' | 'agentId' | 'agentDisplayName'>): PMFreakAgentPassport {
  const profile = findPMFreakAgentRoleProfile(role);
  if (profile === undefined) throw new Error(`No PMFreak agent role profile found for role "${role}".`);

  const base: PMFreakAgentPassport = {
    passportId: overrides.passportId,
    agentId: overrides.agentId,
    agentDisplayName: overrides.agentDisplayName,
    systemId: PMFREAK_SYSTEM_ID,
    role,
    status: 'active',
    issuedBy: PMFREAK_AGENT_PASSPORT_ISSUER,
    issuedAt: PMFREAK_DEMO_ISSUED_AT,
    expiresAt: PMFREAK_DEMO_EXPIRES_AT,
    authorityScope: createDefaultPMFreakAuthorityScope(role),
    capabilityTokenIds: profile.allowedCapabilityIds,
    allowedActionIds: [],
    restrictedActionIds: [],
    defaultEvidenceRequirementIds: profile.defaultEvidenceRequirementIds,
    defaultApprovalRequirementIds: profile.defaultApprovalRequirementIds,
    policyPackIds: [PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID],
    jurisdictionPackIds: [],
    notes: profile.safeOperatingNotes,
  };

  return { ...base, ...overrides };
}

const PLANNING_ALLOWED_ACTION_IDS = ['pmfreak.action.schedule.detect_variance', 'pmfreak.action.schedule.propose_change', 'pmfreak.action.risk.create_draft'];
const PLANNING_RESTRICTED_ACTION_IDS = ['pmfreak.action.schedule.apply_change', 'pmfreak.action.billing.mark_ready', 'pmfreak.action.communication.send_client_update', 'pmfreak.action.change_control.approve_request'];

const RISK_ALLOWED_ACTION_IDS = ['pmfreak.action.risk.create_draft', 'pmfreak.action.evidence.request', 'pmfreak.action.communication.draft_client_update'];
const RISK_RESTRICTED_ACTION_IDS = ['pmfreak.action.risk.close', 'pmfreak.action.communication.send_client_update', 'pmfreak.action.billing.mark_ready', 'pmfreak.action.change_control.approve_request'];

const EVIDENCE_ALLOWED_ACTION_IDS = ['pmfreak.action.evidence.request', 'pmfreak.action.evidence.classify', 'pmfreak.action.evidence.prepare_bundle'];
const EVIDENCE_RESTRICTED_ACTION_IDS = ['pmfreak.action.billing.mark_ready', 'pmfreak.action.risk.close', 'pmfreak.action.schedule.apply_change', 'pmfreak.action.communication.send_client_update'];

const CLIENT_COMMUNICATION_ALLOWED_ACTION_IDS = ['pmfreak.action.communication.draft_client_update', 'pmfreak.action.communication.send_client_update'];
const CLIENT_COMMUNICATION_RESTRICTED_ACTION_IDS = ['pmfreak.action.billing.mark_ready', 'pmfreak.action.schedule.apply_change', 'pmfreak.action.change_control.approve_request', 'pmfreak.action.risk.close'];

const BILLING_READINESS_ALLOWED_ACTION_IDS = ['pmfreak.action.billing.check_readiness', 'pmfreak.action.billing.mark_ready', 'pmfreak.action.evidence.prepare_bundle'];
const BILLING_READINESS_RESTRICTED_ACTION_IDS = ['pmfreak.action.schedule.apply_change', 'pmfreak.action.change_control.approve_request', 'pmfreak.action.risk.close', 'pmfreak.action.communication.send_client_update'];

const CHANGE_CONTROL_ALLOWED_ACTION_IDS = ['pmfreak.action.change_control.classify_request', 'pmfreak.action.communication.draft_client_update', 'pmfreak.action.evidence.request'];
const CHANGE_CONTROL_RESTRICTED_ACTION_IDS = ['pmfreak.action.change_control.approve_request', 'pmfreak.action.billing.mark_ready', 'pmfreak.action.schedule.apply_change', 'pmfreak.action.communication.send_client_update'];

// ---------------------------------------------------------------------------
// Positive (active) demo passports -- one per PMFreak demo agent.
// ---------------------------------------------------------------------------

export function buildPlanningAgentPassportFixture(): PMFreakAgentPassport {
  return buildPassport('planning_agent', {
    passportId: 'aoc.passport.pmfreak.planning.demo.v1',
    agentId: 'pmfreak.agent.planning',
    agentDisplayName: 'PMFreak Planning Agent',
    allowedActionIds: PLANNING_ALLOWED_ACTION_IDS,
    restrictedActionIds: PLANNING_RESTRICTED_ACTION_IDS,
  });
}

export function buildRiskAgentPassportFixture(): PMFreakAgentPassport {
  return buildPassport('risk_agent', {
    passportId: 'aoc.passport.pmfreak.risk.demo.v1',
    agentId: 'pmfreak.agent.risk',
    agentDisplayName: 'PMFreak Risk Agent',
    allowedActionIds: RISK_ALLOWED_ACTION_IDS,
    restrictedActionIds: RISK_RESTRICTED_ACTION_IDS,
  });
}

export function buildEvidenceAgentPassportFixture(): PMFreakAgentPassport {
  return buildPassport('evidence_agent', {
    passportId: 'aoc.passport.pmfreak.evidence.demo.v1',
    agentId: 'pmfreak.agent.evidence',
    agentDisplayName: 'PMFreak Evidence Agent',
    allowedActionIds: EVIDENCE_ALLOWED_ACTION_IDS,
    restrictedActionIds: EVIDENCE_RESTRICTED_ACTION_IDS,
  });
}

export function buildClientCommunicationAgentPassportFixture(): PMFreakAgentPassport {
  return buildPassport('client_communication_agent', {
    passportId: 'aoc.passport.pmfreak.client_communication.demo.v1',
    agentId: 'pmfreak.agent.client_communication',
    agentDisplayName: 'PMFreak Client Communication Agent',
    allowedActionIds: CLIENT_COMMUNICATION_ALLOWED_ACTION_IDS,
    restrictedActionIds: CLIENT_COMMUNICATION_RESTRICTED_ACTION_IDS,
  });
}

export function buildBillingReadinessAgentPassportFixture(): PMFreakAgentPassport {
  return buildPassport('billing_readiness_agent', {
    passportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
    agentId: 'pmfreak.agent.billing_readiness',
    agentDisplayName: 'PMFreak Billing Readiness Agent',
    allowedActionIds: BILLING_READINESS_ALLOWED_ACTION_IDS,
    restrictedActionIds: BILLING_READINESS_RESTRICTED_ACTION_IDS,
  });
}

export function buildChangeControlAgentPassportFixture(): PMFreakAgentPassport {
  return buildPassport('change_control_agent', {
    passportId: 'aoc.passport.pmfreak.change_control.demo.v1',
    agentId: 'pmfreak.agent.change_control',
    agentDisplayName: 'PMFreak Change Control Agent',
    allowedActionIds: CHANGE_CONTROL_ALLOWED_ACTION_IDS,
    restrictedActionIds: CHANGE_CONTROL_RESTRICTED_ACTION_IDS,
  });
}

export function buildAllPMFreakAgentPassportFixtures(): readonly PMFreakAgentPassport[] {
  return [
    buildPlanningAgentPassportFixture(),
    buildRiskAgentPassportFixture(),
    buildEvidenceAgentPassportFixture(),
    buildClientCommunicationAgentPassportFixture(),
    buildBillingReadinessAgentPassportFixture(),
    buildChangeControlAgentPassportFixture(),
  ];
}

// ---------------------------------------------------------------------------
// Negative demo passports -- exercise revoked/suspended/expired/out-of-scope paths.
// ---------------------------------------------------------------------------

export function buildRevokedBillingReadinessPassportFixture(): PMFreakAgentPassport {
  return buildPassport('billing_readiness_agent', {
    passportId: 'aoc.passport.pmfreak.billing_readiness.revoked.v1',
    agentId: 'pmfreak.agent.billing_readiness.revoked',
    agentDisplayName: 'PMFreak Billing Readiness Agent (revoked demo)',
    status: 'revoked',
    allowedActionIds: BILLING_READINESS_ALLOWED_ACTION_IDS,
    restrictedActionIds: BILLING_READINESS_RESTRICTED_ACTION_IDS,
  });
}

export function buildSuspendedClientCommunicationPassportFixture(): PMFreakAgentPassport {
  return buildPassport('client_communication_agent', {
    passportId: 'aoc.passport.pmfreak.client_communication.suspended.v1',
    agentId: 'pmfreak.agent.client_communication.suspended',
    agentDisplayName: 'PMFreak Client Communication Agent (suspended demo)',
    status: 'suspended',
    allowedActionIds: CLIENT_COMMUNICATION_ALLOWED_ACTION_IDS,
    restrictedActionIds: CLIENT_COMMUNICATION_RESTRICTED_ACTION_IDS,
  });
}

export function buildExpiredPlanningPassportFixture(): PMFreakAgentPassport {
  return buildPassport('planning_agent', {
    passportId: 'aoc.passport.pmfreak.planning.expired.v1',
    agentId: 'pmfreak.agent.planning.expired',
    agentDisplayName: 'PMFreak Planning Agent (expired demo)',
    status: 'expired',
    issuedAt: PMFREAK_DEMO_EXPIRED_AT,
    expiresAt: PMFREAK_DEMO_EXPIRED_AT,
    allowedActionIds: PLANNING_ALLOWED_ACTION_IDS,
    restrictedActionIds: PLANNING_RESTRICTED_ACTION_IDS,
  });
}

export function buildOutOfScopeRiskPassportFixture(): PMFreakAgentPassport {
  return buildPassport('risk_agent', {
    passportId: 'aoc.passport.pmfreak.risk.out_of_scope.v1',
    agentId: 'pmfreak.agent.risk.out_of_scope',
    agentDisplayName: 'PMFreak Risk Agent (out-of-scope demo)',
    authorityScope: createDefaultPMFreakAuthorityScope('risk_agent', { projectIds: [PMFREAK_DEMO_OUT_OF_SCOPE_PROJECT_ID] }),
    allowedActionIds: RISK_ALLOWED_ACTION_IDS,
    restrictedActionIds: RISK_RESTRICTED_ACTION_IDS,
  });
}

export function buildAllPMFreakNegativePassportFixtures(): readonly PMFreakAgentPassport[] {
  return [buildRevokedBillingReadinessPassportFixture(), buildSuspendedClientCommunicationPassportFixture(), buildExpiredPlanningPassportFixture(), buildOutOfScopeRiskPassportFixture()];
}

/** A registry containing every positive and negative demo passport fixture. */
export function buildPMFreakAgentPassportRegistryFixture(): PMFreakAgentPassportRegistry {
  return createPMFreakAgentPassportRegistry([...buildAllPMFreakAgentPassportFixtures(), ...buildAllPMFreakNegativePassportFixtures()]);
}

// ---------------------------------------------------------------------------
// Action-attempt fixtures -- deterministic `ResolvePMFreakAgentPassportActionInput`s.
// ---------------------------------------------------------------------------

/** Builds an action-attempt input against the demo workspace/project/phase, with every optional field defaulted to empty/absent. Callers override only what a given scenario needs. */
export function buildPMFreakActionAttemptFixture(
  input: Pick<ResolvePMFreakAgentPassportActionInput, 'actionAttemptId' | 'agentId' | 'passportId' | 'actionId'> & Partial<ResolvePMFreakAgentPassportActionInput>,
): ResolvePMFreakAgentPassportActionInput {
  return {
    workspaceId: PMFREAK_DEMO_WORKSPACE_ID,
    projectId: PMFREAK_DEMO_PROJECT_ID,
    projectPhase: 'execution',
    evidenceIds: [],
    approvalIds: [],
    ...input,
  };
}
