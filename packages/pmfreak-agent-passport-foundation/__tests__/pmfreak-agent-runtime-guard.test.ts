import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTestSigner,
  transitionAgentPassportStatus,
  createAgentRuntimeSeal,
} from '@aoc-enterprise/agent-governance';
import type { AgentPassport, AgentRuntimeSeal, AgentPolicyManifest } from '@aoc-enterprise/agent-governance';

import { issuePMFreakAgentPassport } from '../src/services/pmfreak-agent-passport-issuance-service.js';
import {
  buildPMFreakAgentRuntimeActionRequest,
  evaluatePMFreakAgentRuntimeGuard,
  enforcePMFreakAgentRuntimeGuard,
} from '../src/services/pmfreak-agent-runtime-guard-service.js';
import { PMFREAK_AGENT_ROLE_PROFILES } from '../src/fixtures/pmfreak-agent-role-fixtures.js';
import { PMFREAK_PASSPORT_SCENARIO_FIXTURES } from '../src/fixtures/pmfreak-passport-scenario-fixtures.js';

const signer = createTestSigner({ secret: 'pmfreak-runtime-guard-test-secret' });
const FIXED_NOW = '2026-06-25T12:00:00.000Z';
const now = () => FIXED_NOW;

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

interface ActivatedScenario {
  readonly activePassport: AgentPassport;
  readonly seal: AgentRuntimeSeal;
  readonly manifest: AgentPolicyManifest;
}

const activated = new Map<string, ActivatedScenario>();

before(async () => {
  for (const fixture of PMFREAK_PASSPORT_SCENARIO_FIXTURES) {
    const { bundle } = await issuePMFreakAgentPassport(fixture.role, fixture.enrollmentOptions, { signer });
    const activePassport = transitionAgentPassportStatus(bundle.passport, 'active');
    const seal = await createAgentRuntimeSeal(activePassport, { signer });
    activated.set(fixture.role, { activePassport, seal, manifest: bundle.policyManifest });
  }
});

function getScenario(role: string): ActivatedScenario {
  return must(activated.get(role), `expected an activated scenario for role ${role}`);
}

describe('PMFreak agent runtime guard', () => {
  for (const profile of PMFREAK_AGENT_ROLE_PROFILES) {
    describe(`role: ${profile.role}`, () => {
      it('denies a prohibited action', async () => {
        const scenario = getScenario(profile.role);
        const prohibitedAction = must(profile.prohibitedActions[0], `role ${profile.role} must fixture a prohibited action`);

        const request = buildPMFreakAgentRuntimeActionRequest({
          requestId: `REQ-${profile.role}-deny`,
          passport: scenario.activePassport,
          actorId: 'actor-system',
          requestedAction: prohibitedAction,
          actionCategory: 'update_record',
          requestedAt: FIXED_NOW,
        });

        const decision = await evaluatePMFreakAgentRuntimeGuard(
          {
            request,
            passport: scenario.activePassport,
            runtimeSeal: scenario.seal,
            policyManifest: scenario.manifest,
          },
          { signer, now },
        );

        assert.equal(decision.outcome, 'deny');
        assert.ok(decision.reasonCodes.includes('runtime_guard.action_prohibited'));
      });

      it("reflects the real policy manifest's human-oversight-driven approval requirement", async () => {
        const scenario = getScenario(profile.role);

        // The real `createAgentPolicyManifest` (agent-governance) computes
        // `humanApprovalRequiredFor` as ALL of the enrollment's `tools` when
        // `humanOversight.requirement === 'required'`, and an empty list
        // otherwise -- it has no concept of a per-action approval flag. This
        // test asserts against that REAL, already-issued manifest field
        // (`scenario.manifest.humanApprovalRequiredFor`) rather than this
        // package's own fixture-level `humanApprovalRequiredFor` metadata,
        // so it never asserts a scenario the real dependency wouldn't
        // actually produce.
        if (scenario.manifest.humanApprovalRequiredFor.length === 0) {
          assert.notEqual(profile.humanOversightRequirement, 'required');
          return;
        }

        const flaggedTool = must(
          scenario.manifest.humanApprovalRequiredFor[0],
          `role ${profile.role} manifest must flag at least one tool for approval`,
        );

        const request = buildPMFreakAgentRuntimeActionRequest({
          requestId: `REQ-${profile.role}-approval`,
          passport: scenario.activePassport,
          actorId: 'actor-system',
          requestedAction: flaggedTool,
          actionCategory: 'update_record',
          toolName: flaggedTool,
          requestedAt: FIXED_NOW,
        });

        // Isolate the manifest-driven humanApprovalRequiredFor signal from
        // the role's own risk-tier default (some roles, e.g.
        // billing_readiness, are 'critical' and would otherwise also
        // trigger approval via risk tier -- see the dedicated risk-tier
        // test below).
        const decision = await enforcePMFreakAgentRuntimeGuard(
          {
            request,
            passport: scenario.activePassport,
            runtimeSeal: scenario.seal,
            policyManifest: scenario.manifest,
            options: { humanApprovalRiskTiers: [] },
          },
          { signer, now },
        );

        assert.equal(decision.decision.outcome, 'require_human_approval');
        assert.equal(decision.requiresHumanApproval, true);
        assert.equal(decision.allowed, false);
      });

      it('allows an action that is neither prohibited nor flagged for approval', async () => {
        const scenario = getScenario(profile.role);
        const allowAction = must(
          profile.allowedActions.find((action) => !profile.humanApprovalRequiredFor.includes(action)),
          `role ${profile.role} must fixture at least one allowed, non-approval-gated action`,
        );
        const tool = profile.toolAccessScope[0];
        const dataCategory = profile.dataAccessScope[0];

        const request = buildPMFreakAgentRuntimeActionRequest({
          requestId: `REQ-${profile.role}-allow`,
          passport: scenario.activePassport,
          actorId: 'actor-system',
          requestedAction: allowAction,
          actionCategory: 'read_data',
          ...(tool !== undefined ? { toolName: tool } : {}),
          ...(dataCategory !== undefined ? { dataCategories: [dataCategory] } : {}),
          requestedAt: FIXED_NOW,
        });

        // The role's own risk tier (e.g. billing_readiness is 'critical') may
        // itself force human approval by design; disabling that here isolates
        // the "allowed action" path specifically for this test.
        const decision = await evaluatePMFreakAgentRuntimeGuard(
          {
            request,
            passport: scenario.activePassport,
            runtimeSeal: scenario.seal,
            policyManifest: scenario.manifest,
            options: { humanApprovalRiskTiers: [] },
          },
          { signer, now },
        );

        assert.equal(decision.outcome, 'allow');
        assert.ok(decision.reasonCodes.includes('runtime_guard.allowed'));
      });
    });
  }

  it("billing_readiness's own critical risk tier forces human approval even for an otherwise-allowed action", async () => {
    const scenario = getScenario('billing_readiness');
    const profile = must(
      PMFREAK_AGENT_ROLE_PROFILES.find((p) => p.role === 'billing_readiness'),
      'expected a billing_readiness role profile',
    );
    const allowAction = must(
      profile.allowedActions.find((action) => !profile.humanApprovalRequiredFor.includes(action)),
      'expected an allowed, non-approval-gated action',
    );
    const tool = profile.toolAccessScope[0];
    const dataCategory = must(profile.dataAccessScope[0], 'expected a data access scope entry');

    const request = buildPMFreakAgentRuntimeActionRequest({
      requestId: 'REQ-billing_readiness-risk-tier',
      passport: scenario.activePassport,
      actorId: 'actor-system',
      requestedAction: allowAction,
      actionCategory: 'read_data',
      ...(tool !== undefined ? { toolName: tool } : {}),
      dataCategories: [dataCategory],
      requestedAt: FIXED_NOW,
    });

    // No override here: default humanApprovalRiskTiers includes 'critical'.
    const decision = await evaluatePMFreakAgentRuntimeGuard(
      {
        request,
        passport: scenario.activePassport,
        runtimeSeal: scenario.seal,
        policyManifest: scenario.manifest,
      },
      { signer, now },
    );

    assert.equal(decision.outcome, 'require_human_approval');
    assert.ok(decision.reasonCodes.includes('runtime_guard.high_risk_requires_approval'));
  });

  it('denies when the runtime seal is missing', async () => {
    const scenario = getScenario('planning');
    const request = buildPMFreakAgentRuntimeActionRequest({
      requestId: 'REQ-planning-missing-seal',
      passport: scenario.activePassport,
      actorId: 'actor-system',
      requestedAction: 'pmfreak.foundation.action.schedule.detect_variance',
      actionCategory: 'read_data',
      requestedAt: FIXED_NOW,
    });

    const decision = await evaluatePMFreakAgentRuntimeGuard(
      {
        request,
        passport: scenario.activePassport,
        runtimeSeal: null,
        policyManifest: scenario.manifest,
      },
      { signer, now },
    );

    assert.equal(decision.outcome, 'deny');
    assert.ok(decision.reasonCodes.includes('runtime_guard.missing_runtime_seal'));
  });

  it('emits runtime guard events with the fixed injected clock', async () => {
    const scenario = getScenario('risk');
    const emitted: { type: string; occurredAt: string }[] = [];
    const request = buildPMFreakAgentRuntimeActionRequest({
      requestId: 'REQ-risk-events',
      passport: scenario.activePassport,
      actorId: 'actor-system',
      requestedAction: 'pmfreak.foundation.action.risk.detect',
      actionCategory: 'read_data',
      toolName: 'risk_register_reader',
      dataCategories: ['project.risk_register'],
      requestedAt: FIXED_NOW,
    });

    await evaluatePMFreakAgentRuntimeGuard(
      {
        request,
        passport: scenario.activePassport,
        runtimeSeal: scenario.seal,
        policyManifest: scenario.manifest,
        options: { humanApprovalRiskTiers: [] },
      },
      {
        signer,
        now,
        eventSink: { emit: (event) => { emitted.push({ type: event.type, occurredAt: event.occurredAt }); } },
      },
    );

    assert.ok(emitted.length >= 2);
    for (const event of emitted) {
      assert.equal(event.occurredAt, FIXED_NOW);
    }
  });
});
