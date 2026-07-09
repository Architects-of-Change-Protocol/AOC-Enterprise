import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSigner, transitionAgentPassportStatus, createAgentRuntimeSeal } from '@aoc-enterprise/agent-governance';
import type { AgentPassport, AgentPolicyManifest, AgentRuntimeActionRequest } from '@aoc-enterprise/agent-governance';

import { issuePMFreakAgentPassport } from '../src/services/pmfreak-agent-passport-issuance-service.js';
import { buildPMFreakAgentRuntimeActionRequest } from '../src/services/pmfreak-agent-runtime-guard-service.js';
import {
  resolvePMFreakAgentPassportAction,
  type ResolvePMFreakAgentPassportActionInput,
} from '../src/services/pmfreak-agent-passport-resolution-service.js';
import type { PMFreakCapabilityTokenMirror } from '../src/domain/pmfreak-capability-token-mirror.js';
import type { PMFreakEvidenceRequirementMirror } from '../src/domain/pmfreak-evidence-requirement-mirror.js';
import type { PMFreakApprovalRequirementMirror } from '../src/domain/pmfreak-approval-requirement-mirror.js';
import type { PMFreakAuthorityScope } from '../src/domain/pmfreak-authority-scope.js';
import { findPMFreakPassportScenarioFixture } from '../src/fixtures/pmfreak-passport-scenario-fixtures.js';

const signer = createTestSigner({ secret: 'pmfreak-resolution-test-secret' });
const FIXED_NOW = '2026-06-25T12:00:00.000Z';
const now = () => FIXED_NOW;

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

const PLANNING_ACTION = 'pmfreak.foundation.action.schedule.detect_variance';
const BILLING_ACTION = 'pmfreak.foundation.action.billing.check_readiness';

const IN_SCOPE_AUTHORITY: PMFreakAuthorityScope = {
  workspaceIds: ['workspace-1'],
  projectIds: ['proj-1'],
  customerIds: [],
  allowedProjectPhases: ['planning', 'execution', 'monitoring', 'closure', 'billing'],
};

let activePlanningPassport: AgentPassport;
let planningManifest: AgentPolicyManifest;
let planningRequest: AgentRuntimeActionRequest;

let activeBillingPassport: AgentPassport;
let billingManifest: AgentPolicyManifest;

before(async () => {
  const planningFixture = must(findPMFreakPassportScenarioFixture('planning'), 'expected a planning fixture');
  const planningBundle = await issuePMFreakAgentPassport(planningFixture.role, planningFixture.enrollmentOptions, { signer });
  activePlanningPassport = transitionAgentPassportStatus(planningBundle.bundle.passport, 'active');
  planningManifest = planningBundle.bundle.policyManifest;
  planningRequest = buildPMFreakAgentRuntimeActionRequest({
    requestId: 'REQ-planning-resolution',
    passport: activePlanningPassport,
    actorId: 'actor-system',
    requestedAction: PLANNING_ACTION,
    actionCategory: 'read_data',
    toolName: 'schedule_reader',
    dataCategories: ['project.schedule'],
    requestedAt: FIXED_NOW,
  });

  const billingFixture = must(findPMFreakPassportScenarioFixture('billing_readiness'), 'expected a billing_readiness fixture');
  const billingBundle = await issuePMFreakAgentPassport(billingFixture.role, billingFixture.enrollmentOptions, { signer });
  activeBillingPassport = transitionAgentPassportStatus(billingBundle.bundle.passport, 'active');
  billingManifest = billingBundle.bundle.policyManifest;
});

function planningToken(overrides?: Partial<PMFreakCapabilityTokenMirror>): PMFreakCapabilityTokenMirror {
  return {
    id: 'tok-planning-1',
    passportId: activePlanningPassport.passportId,
    role: 'planning',
    capability: 'pmfreak.foundation.capability.schedule.detect_variance',
    actions: [PLANNING_ACTION],
    resourceScopes: ['project.schedule'],
    constraints: { prohibitedActions: [] },
    delegation: { delegable: false, delegationDepth: 0, maxDelegationDepth: 0 },
    evidenceRequirements: [],
    riskLevel: 'medium',
    status: 'valid',
    issuedAt: FIXED_NOW,
    ...overrides,
  };
}

function baseInput(overrides?: Partial<ResolvePMFreakAgentPassportActionInput>): ResolvePMFreakAgentPassportActionInput {
  return {
    actionAttemptId: 'attempt-1',
    role: 'planning',
    request: planningRequest,
    passport: activePlanningPassport,
    runtimeSeal: undefined,
    policyManifest: planningManifest,
    authorityScope: IN_SCOPE_AUTHORITY,
    workspaceId: 'workspace-1',
    projectId: 'proj-1',
    projectPhase: 'planning',
    capabilityToken: planningToken(),
    evidenceRequirements: [],
    approvalRequirements: [],
    grantedApprovalRequirementIds: [],
    ...overrides,
  };
}

describe('PMFreak agent passport action resolution', () => {
  it('allows an action authorized by an active passport, a valid capability token, and in-scope authority', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const resolution = await resolvePMFreakAgentPassportAction(baseInput({ runtimeSeal: seal }), { signer, now });

    assert.equal(resolution.decision, 'allow');
    assert.equal(resolution.allowedByRuntimeGuard, true);
    assert.equal(resolution.allowedByCapabilityToken, true);
    assert.equal(resolution.allowedByAuthorityScope, true);
    assert.equal(resolution.evidenceSatisfied, true);
    assert.equal(resolution.approvalsSatisfied, true);
    assert.equal(resolution.passportStatus, 'active');
    assert.equal(resolution.errors.length, 0);
    assert.ok(resolution.warnings.some((w) => w.includes('not legal advice')));
  });

  it('denies when the runtime guard denies (missing runtime seal)', async () => {
    const resolution = await resolvePMFreakAgentPassportAction(baseInput({ runtimeSeal: null }), { signer, now });

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.allowedByRuntimeGuard, false);
    assert.ok(resolution.errors.some((e) => e.includes('Runtime guard denied')));
  });

  it('denies for a revoked passport without calling the runtime guard', async () => {
    const revoked = transitionAgentPassportStatus(activePlanningPassport, 'revoked');
    const resolution = await resolvePMFreakAgentPassportAction(baseInput({ passport: revoked, runtimeSeal: null }), {
      signer,
      now,
    });

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.passportStatus, 'revoked');
    assert.equal(resolution.allowedByRuntimeGuard, false);
    assert.ok(resolution.errors.some((e) => e.includes('not active')));
  });

  it('denies for an expired passport', async () => {
    const expired = transitionAgentPassportStatus(activePlanningPassport, 'expired');
    const resolution = await resolvePMFreakAgentPassportAction(baseInput({ passport: expired, runtimeSeal: null }), {
      signer,
      now,
    });

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.passportStatus, 'expired');
  });

  it('denies for a not-yet-active (issued) passport', async () => {
    const planningFixture = must(findPMFreakPassportScenarioFixture('planning'), 'expected a planning fixture');
    const { bundle } = await issuePMFreakAgentPassport(planningFixture.role, planningFixture.enrollmentOptions, { signer });
    assert.equal(bundle.passport.status, 'issued');

    const resolution = await resolvePMFreakAgentPassportAction(baseInput({ passport: bundle.passport, runtimeSeal: null }), {
      signer,
      now,
    });

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.passportStatus, 'issued');
  });

  it('holds (not denies) for a suspended passport', async () => {
    const suspended = transitionAgentPassportStatus(activePlanningPassport, 'suspended');
    const resolution = await resolvePMFreakAgentPassportAction(baseInput({ passport: suspended, runtimeSeal: null }), {
      signer,
      now,
    });

    assert.equal(resolution.decision, 'hold');
    assert.equal(resolution.passportStatus, 'suspended');
    assert.ok(resolution.warnings.some((w) => w.includes('suspended')));
  });

  it('denies when the runtime guard denies a prohibited action', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const prohibitedAction = must(planningManifest.prohibitedActions[0], 'expected a prohibited action on the manifest');
    const request = buildPMFreakAgentRuntimeActionRequest({
      requestId: 'REQ-planning-prohibited',
      passport: activePlanningPassport,
      actorId: 'actor-system',
      requestedAction: prohibitedAction,
      actionCategory: 'update_record',
      requestedAt: FIXED_NOW,
    });

    const resolution = await resolvePMFreakAgentPassportAction(
      baseInput({ request, runtimeSeal: seal, capabilityToken: planningToken({ actions: [prohibitedAction] }) }),
      { signer, now },
    );

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.allowedByRuntimeGuard, false);
  });

  it('denies when no capability token is supplied', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const { capabilityToken: _omitted, ...inputWithoutToken } = baseInput({ runtimeSeal: seal });
    const resolution = await resolvePMFreakAgentPassportAction(inputWithoutToken, { signer, now });

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.allowedByCapabilityToken, false);
    assert.ok(resolution.errors.some((e) => e.includes('No capability token supplied')));
  });

  it('denies when the capability token is not valid', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const resolution = await resolvePMFreakAgentPassportAction(
      baseInput({ runtimeSeal: seal, capabilityToken: planningToken({ status: 'revoked' }) }),
      { signer, now },
    );

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.allowedByCapabilityToken, false);
  });

  it('denies when the action is explicitly prohibited by the capability token constraints', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const resolution = await resolvePMFreakAgentPassportAction(
      baseInput({ runtimeSeal: seal, capabilityToken: planningToken({ constraints: { prohibitedActions: [PLANNING_ACTION] } }) }),
      { signer, now },
    );

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.allowedByCapabilityToken, false);
  });

  it('denies when the action attempt is outside the authority scope (workspace)', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const resolution = await resolvePMFreakAgentPassportAction(baseInput({ runtimeSeal: seal, workspaceId: 'workspace-2' }), {
      signer,
      now,
    });

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.allowedByAuthorityScope, false);
  });

  it('denies when the action attempt is outside the authority scope (project phase)', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const resolution = await resolvePMFreakAgentPassportAction(baseInput({ runtimeSeal: seal, projectPhase: 'initiation' }), {
      signer,
      now,
    });

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.allowedByAuthorityScope, false);
  });

  it('requires evidence when a required evidence requirement is not satisfied', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const evidenceRequirements: readonly PMFreakEvidenceRequirementMirror[] = [
      {
        id: 'ev-1',
        type: 'schedule_baseline',
        passportId: activePlanningPassport.passportId,
        role: 'planning',
        action: PLANNING_ACTION,
        description: 'Schedule baseline must be attached before variance detection.',
        required: true,
        status: 'open',
        createdAt: FIXED_NOW,
      },
    ];

    const resolution = await resolvePMFreakAgentPassportAction(
      baseInput({ runtimeSeal: seal, evidenceRequirements }),
      { signer, now },
    );

    assert.equal(resolution.decision, 'require_evidence');
    assert.equal(resolution.evidenceSatisfied, false);
    assert.deepEqual(resolution.missingEvidenceIds, ['ev-1']);
    assert.deepEqual(resolution.requiredEvidenceIds, ['ev-1']);
  });

  it('does not require evidence that is satisfied or waived', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const evidenceRequirements: readonly PMFreakEvidenceRequirementMirror[] = [
      {
        id: 'ev-1',
        type: 'schedule_baseline',
        passportId: activePlanningPassport.passportId,
        role: 'planning',
        description: 'Satisfied evidence.',
        required: true,
        status: 'satisfied',
        createdAt: FIXED_NOW,
      },
      {
        id: 'ev-2',
        type: 'dependency_record',
        passportId: activePlanningPassport.passportId,
        role: 'planning',
        description: 'Waived evidence.',
        required: true,
        status: 'waived',
        createdAt: FIXED_NOW,
      },
    ];

    const resolution = await resolvePMFreakAgentPassportAction(
      baseInput({ runtimeSeal: seal, evidenceRequirements }),
      { signer, now },
    );

    assert.equal(resolution.decision, 'allow');
    assert.equal(resolution.evidenceSatisfied, true);
    assert.deepEqual(resolution.missingEvidenceIds, []);
  });

  it('maps an ungranted pm_approval requirement to require_pm_approval', async () => {
    const seal = await createAgentRuntimeSeal(activeBillingPassport, { signer });
    const request = buildPMFreakAgentRuntimeActionRequest({
      requestId: 'REQ-billing-pm-approval',
      passport: activeBillingPassport,
      actorId: 'actor-system',
      requestedAction: BILLING_ACTION,
      actionCategory: 'read_data',
      requestedAt: FIXED_NOW,
    });
    const approvalRequirements: readonly PMFreakApprovalRequirementMirror[] = [
      {
        id: 'appr-1',
        type: 'pm_approval',
        passportId: activeBillingPassport.passportId,
        role: 'billing_readiness',
        action: BILLING_ACTION,
        riskLevel: 'critical',
        minimumApprovals: 1,
        requiresSegregationOfDuties: false,
        evidenceRequirements: [],
      },
    ];
    const billingToken = planningToken({
      id: 'tok-billing-1',
      passportId: activeBillingPassport.passportId,
      role: 'billing_readiness',
      actions: [BILLING_ACTION],
    });

    const resolution = await resolvePMFreakAgentPassportAction(
      baseInput({
        passport: activeBillingPassport,
        policyManifest: billingManifest,
        request,
        runtimeSeal: seal,
        capabilityToken: billingToken,
        approvalRequirements,
        grantedApprovalRequirementIds: [],
      }),
      { signer, now },
    );

    assert.equal(resolution.decision, 'require_pm_approval');
    assert.equal(resolution.approvalsSatisfied, false);
    assert.deepEqual(resolution.missingApprovalIds, ['appr-1']);
  });

  it('is satisfied once the approval requirement id is in the granted set', async () => {
    const seal = await createAgentRuntimeSeal(activeBillingPassport, { signer });
    const request = buildPMFreakAgentRuntimeActionRequest({
      requestId: 'REQ-billing-pm-approval-granted',
      passport: activeBillingPassport,
      actorId: 'actor-system',
      requestedAction: BILLING_ACTION,
      actionCategory: 'read_data',
      requestedAt: FIXED_NOW,
    });
    const approvalRequirements: readonly PMFreakApprovalRequirementMirror[] = [
      {
        id: 'appr-1',
        type: 'pm_approval',
        passportId: activeBillingPassport.passportId,
        role: 'billing_readiness',
        action: BILLING_ACTION,
        riskLevel: 'critical',
        minimumApprovals: 1,
        requiresSegregationOfDuties: false,
        evidenceRequirements: [],
      },
    ];
    const billingToken = planningToken({
      id: 'tok-billing-1',
      passportId: activeBillingPassport.passportId,
      role: 'billing_readiness',
      actions: [BILLING_ACTION],
    });

    const resolution = await resolvePMFreakAgentPassportAction(
      baseInput({
        passport: activeBillingPassport,
        policyManifest: billingManifest,
        request,
        runtimeSeal: seal,
        capabilityToken: billingToken,
        approvalRequirements,
        grantedApprovalRequirementIds: ['appr-1'],
        // billing_readiness is a 'critical'-risk-tier role, which would
        // otherwise itself force require_human_approval via the runtime
        // guard's default humanApprovalRiskTiers; disabling that here
        // isolates the approval-requirement-satisfaction path specifically
        // under test (mirrors the same isolation pattern used in
        // pmfreak-agent-runtime-guard.test.ts).
        guardOptions: { humanApprovalRiskTiers: [] },
      }),
      { signer, now },
    );

    assert.equal(resolution.decision, 'allow');
    assert.equal(resolution.approvalsSatisfied, true);
    assert.deepEqual(resolution.missingApprovalIds, []);
  });

  it('requires legal review when the context is flagged legal-sensitive, even with no approval requirements supplied', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const resolution = await resolvePMFreakAgentPassportAction(
      baseInput({ runtimeSeal: seal, context: { legalSensitive: true } }),
      { signer, now },
    );

    assert.equal(resolution.decision, 'require_legal_review');
    assert.ok(resolution.warnings.some((w) => w.includes('Legal-sensitive')));
  });

  it('requires contract review and customer validation when the context flags a customer commitment', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const resolution = await resolvePMFreakAgentPassportAction(
      baseInput({ runtimeSeal: seal, context: { customerCommitment: true } }),
      { signer, now },
    );

    // require_contract_review outranks require_customer_validation in the priority order.
    assert.equal(resolution.decision, 'require_contract_review');
  });

  it('requires pm approval when the context flags external/customer-facing communication', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const resolution = await resolvePMFreakAgentPassportAction(
      baseInput({ runtimeSeal: seal, context: { externalCommunication: true } }),
      { signer, now },
    );

    assert.equal(resolution.decision, 'require_pm_approval');
  });

  it('picks the highest-priority decision when multiple candidates apply', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const evidenceRequirements: readonly PMFreakEvidenceRequirementMirror[] = [
      {
        id: 'ev-1',
        type: 'schedule_baseline',
        passportId: activePlanningPassport.passportId,
        role: 'planning',
        description: 'Missing evidence, lower priority than legal review.',
        required: true,
        status: 'open',
        createdAt: FIXED_NOW,
      },
    ];

    const resolution = await resolvePMFreakAgentPassportAction(
      baseInput({
        runtimeSeal: seal,
        evidenceRequirements,
        context: { legalSensitive: true, externalCommunication: true },
      }),
      { signer, now },
    );

    assert.equal(resolution.decision, 'require_legal_review');
    assert.equal(resolution.evidenceSatisfied, false);
  });

  it('is deterministic: identical input yields an identical resolution', async () => {
    const seal = await createAgentRuntimeSeal(activePlanningPassport, { signer });
    const input = baseInput({ runtimeSeal: seal });

    const first = await resolvePMFreakAgentPassportAction(input, { signer, now });
    const second = await resolvePMFreakAgentPassportAction(input, { signer, now });

    assert.deepEqual(first, second);
  });
});
