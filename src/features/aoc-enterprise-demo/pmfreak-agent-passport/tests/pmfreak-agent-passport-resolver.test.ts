import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePMFreakAgentPassportAction } from '../pmfreak-passport-resolver.js';
import {
  buildPMFreakActionAttemptFixture,
  buildPMFreakAgentPassportRegistryFixture,
  buildPlanningAgentPassportFixture,
} from '../pmfreak-agent-passport-fixtures.js';
import { createPMFreakAgentPassportRegistry } from '../pmfreak-passport-registry.js';
import { PMFREAK_DEMO_PROJECT_ID, PMFREAK_DEMO_WORKSPACE_ID } from '../pmfreak-agent-passport-constants.js';

describe('PMFreak agent passport resolver -- passport status gates', () => {
  it('6. a missing passport denies the action', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-missing-passport',
        agentId: 'pmfreak.agent.planning',
        passportId: 'aoc.passport.pmfreak.does_not_exist.v1',
        actionId: 'pmfreak.action.schedule.detect_variance',
      }),
      registry,
    );

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.allowedByPassport, false);
    assert.ok(resolution.errors.length > 0);
  });

  it('7. a revoked passport denies the action', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-revoked',
        agentId: 'pmfreak.agent.billing_readiness.revoked',
        passportId: 'aoc.passport.pmfreak.billing_readiness.revoked.v1',
        actionId: 'pmfreak.action.billing.check_readiness',
        projectPhase: 'billing',
      }),
      registry,
    );

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.passportStatus, 'revoked');
  });

  it('8. a suspended passport holds the action', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-suspended',
        agentId: 'pmfreak.agent.client_communication.suspended',
        passportId: 'aoc.passport.pmfreak.client_communication.suspended.v1',
        actionId: 'pmfreak.action.communication.draft_client_update',
        projectPhase: 'planning',
      }),
      registry,
    );

    assert.equal(resolution.decision, 'hold');
    assert.equal(resolution.passportStatus, 'suspended');
  });

  it('9. an expired passport denies the action', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-expired',
        agentId: 'pmfreak.agent.planning.expired',
        passportId: 'aoc.passport.pmfreak.planning.expired.v1',
        actionId: 'pmfreak.action.schedule.detect_variance',
      }),
      registry,
    );

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.passportStatus, 'expired');
  });

  it('a draft passport denies the action', () => {
    const draftPassport = { ...buildPlanningAgentPassportFixture(), passportId: 'aoc.passport.pmfreak.planning.draft.v1', status: 'draft' as const };
    const registry = createPMFreakAgentPassportRegistry([draftPassport]);
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-draft',
        agentId: draftPassport.agentId,
        passportId: draftPassport.passportId,
        actionId: 'pmfreak.action.schedule.detect_variance',
      }),
      registry,
    );

    assert.equal(resolution.decision, 'deny');
    assert.equal(resolution.passportStatus, 'draft');
  });
});

describe('PMFreak agent passport resolver -- authority scope, action list, and capability gates', () => {
  it('10. an out-of-scope project denies the action', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-out-of-scope',
        agentId: 'pmfreak.agent.risk.out_of_scope',
        passportId: 'aoc.passport.pmfreak.risk.out_of_scope.v1',
        actionId: 'pmfreak.action.risk.create_draft',
      }),
      registry,
    );

    assert.equal(resolution.allowedByAuthorityScope, false);
    assert.equal(resolution.decision, 'deny');
  });

  it('11. an action not allowed by the passport denies the action', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-not-allowed',
        agentId: 'pmfreak.agent.planning',
        passportId: 'aoc.passport.pmfreak.planning.demo.v1',
        actionId: 'pmfreak.action.billing.check_readiness',
      }),
      registry,
    );

    assert.equal(resolution.allowedByPassport, false);
    assert.equal(resolution.decision, 'deny');
  });

  it('12. an explicitly restricted action denies the action', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-restricted',
        agentId: 'pmfreak.agent.planning',
        passportId: 'aoc.passport.pmfreak.planning.demo.v1',
        actionId: 'pmfreak.action.schedule.apply_change',
        evidenceIds: ['pmfreak.evidence.schedule_baseline'],
        approvalIds: ['pmfreak.approval.pm_approval'],
      }),
      registry,
    );

    assert.equal(resolution.decision, 'deny');
    assert.ok(resolution.errors.some((error) => error.toLowerCase().includes('restricted')));
  });

  it('13. a missing capability token denies the action', () => {
    const planning = buildPlanningAgentPassportFixture();
    const gapped = { ...planning, capabilityTokenIds: planning.capabilityTokenIds.filter((id) => id !== 'pmfreak.capability.schedule.detect_variance') };
    const registry = createPMFreakAgentPassportRegistry([gapped]);

    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-missing-capability-token',
        agentId: gapped.agentId,
        passportId: gapped.passportId,
        actionId: 'pmfreak.action.schedule.detect_variance',
      }),
      registry,
    );

    assert.equal(resolution.allowedByCapability, false);
    assert.equal(resolution.decision, 'deny');
  });
});

describe('PMFreak agent passport resolver -- baseline allow path', () => {
  it('allows an in-scope, evidence-satisfied, approval-free action', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-allow-baseline',
        agentId: 'pmfreak.agent.planning',
        passportId: 'aoc.passport.pmfreak.planning.demo.v1',
        actionId: 'pmfreak.action.schedule.detect_variance',
        evidenceIds: ['pmfreak.evidence.project_status_source', 'pmfreak.evidence.schedule_baseline'],
      }),
      registry,
    );

    assert.equal(resolution.decision, 'allow');
    assert.equal(resolution.allowedByPassport, true);
    assert.equal(resolution.allowedByCapability, true);
    assert.equal(resolution.allowedByAuthorityScope, true);
    assert.equal(resolution.evidenceSatisfied, true);
    assert.equal(resolution.role, 'planning_agent');
    assert.ok(resolution.appliedPolicyPackIds.includes('aoc.demo.pmfreak.agent_passport.v1'));
  });

  it('carries the workspace/project ids through unchanged for an in-scope attempt', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-scope-echo',
        agentId: 'pmfreak.agent.planning',
        passportId: 'aoc.passport.pmfreak.planning.demo.v1',
        actionId: 'pmfreak.action.schedule.detect_variance',
        workspaceId: PMFREAK_DEMO_WORKSPACE_ID,
        projectId: PMFREAK_DEMO_PROJECT_ID,
      }),
      registry,
    );

    assert.equal(resolution.allowedByAuthorityScope, true);
  });
});
