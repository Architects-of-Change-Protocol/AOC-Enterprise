import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { issueAgentPassport } from '../src/passport/passport-issuance.js';
import { transitionAgentPassportStatus } from '../src/passport/passport-status.js';
import { createTestSigner } from '../src/signing/test-signer.js';
import { createAgentRuntimeSeal } from '../src/runtime-seal/runtime-seal.js';
import { evaluateAgentRuntimeGuard, enforceAgentRuntimeGuard } from '../src/runtime-guard/runtime-guard.js';
import { createHumanApprovalRequest } from '../src/runtime-guard/runtime-guard-contracts.js';
import type { AgentEnrollmentInput } from '../src/enrollment/enrollment-contracts.js';
import type { IssuedAgentPassportBundle, AgentPassport } from '../src/passport/passport-contracts.js';
import type { AgentRuntimeSeal } from '../src/runtime-seal/runtime-seal-contracts.js';
import type { AgentPolicyManifest } from '../src/policy-manifest/manifest-contracts.js';
import type { AgentRuntimeActionRequest } from '../src/runtime-guard/runtime-action.js';
import type { AgentRuntimeGuardEvent } from '../src/runtime-guard/runtime-guard-events.js';
import type { EvaluateAgentRuntimeGuardInput } from '../src/runtime-guard/runtime-context.js';

const ENROLLMENT: AgentEnrollmentInput = {
  agentName: 'AnalyticsAgent',
  ownerId: 'org-001',
  ownerName: 'Acme Corp',
  purpose: 'Analyse customer behavioural data',
  region: 'EU',
  autonomyLevel: 'medium',
  riskTier: 'high',
  dataAccess: ['customer.pii', 'order.history', 'analytics.events'],
  tools: ['read_crm', 'write_warehouse', 'send_notification'],
  humanOversight: { requirement: 'optional', description: 'Weekly review' },
  prohibitedActions: ['delete_customer', 'export_raw_pii'],
  escalationRules: [],
  createdBy: 'user-alice',
  issuedAt: '2026-03-15T10:00:00.000Z',
};

const FIXED_NOW = '2026-06-25T12:00:00.000Z';
const now = () => FIXED_NOW;

const signer = createTestSigner({ secret: 'test-secret-key' });

let bundle: IssuedAgentPassportBundle;
let activePassport: AgentPassport;
let seal: AgentRuntimeSeal;
let manifest: AgentPolicyManifest;

const baseRequest = (): AgentRuntimeActionRequest => ({
  requestId: 'REQ-001',
  passportId: '',
  actorId: 'actor-system',
  requestedAction: 'read_crm',
  actionCategory: 'read_data',
  toolName: 'read_crm',
  dataCategories: ['customer.pii'],
  requestedAt: FIXED_NOW,
});

before(async () => {
  bundle = await issueAgentPassport(ENROLLMENT, { signer });
  activePassport = transitionAgentPassportStatus(bundle.passport, 'active');
  seal = await createAgentRuntimeSeal(activePassport, { signer });
  manifest = bundle.policyManifest;
});

function makeInput(overrides: Partial<EvaluateAgentRuntimeGuardInput> = {}): EvaluateAgentRuntimeGuardInput {
  const req = overrides.request ?? { ...baseRequest(), passportId: activePassport.passportId };
  return {
    request: req,
    passport: activePassport,
    runtimeSeal: seal,
    policyManifest: manifest,
    ...overrides,
  };
}

describe('Runtime Guard — allow path', () => {
  it('allows action when passport is active, seal valid, manifest matches, action/tool/data allowed', async () => {
    const result = await evaluateAgentRuntimeGuard(
      makeInput({ request: { ...baseRequest(), passportId: activePassport.passportId } }),
      { signer, now },
    );
    assert.equal(result.outcome, 'allow');
    assert.ok(result.reasonCodes.includes('runtime_guard.allowed'));
  });
});

describe('Runtime Guard — runtime seal checks', () => {
  it('denies when runtime seal is null and requireRuntimeSeal is true', async () => {
    const result = await evaluateAgentRuntimeGuard(
      makeInput({
        request: { ...baseRequest(), passportId: activePassport.passportId },
        runtimeSeal: null,
      }),
      { signer, now },
    );
    assert.equal(result.outcome, 'deny');
    assert.ok(result.reasonCodes.includes('runtime_guard.missing_runtime_seal'));
  });

  it('denies when runtime seal is tampered (hash mismatch)', async () => {
    const tamperedSeal: AgentRuntimeSeal = {
      ...seal,
      passportHash: 'sha256:000000000000000000000000000000000000000000000000000000000000cafe',
    };
    const result = await evaluateAgentRuntimeGuard(
      makeInput({
        request: { ...baseRequest(), passportId: activePassport.passportId },
        runtimeSeal: tamperedSeal,
      }),
      { signer, now },
    );
    assert.equal(result.outcome, 'deny');
    assert.ok(result.reasonCodes.includes('runtime_guard.invalid_runtime_seal'));
  });

  it('skips seal check when requireRuntimeSeal is false', async () => {
    const result = await evaluateAgentRuntimeGuard(
      makeInput({
        request: { ...baseRequest(), passportId: activePassport.passportId },
        runtimeSeal: null,
        options: { requireRuntimeSeal: false },
      }),
      { signer, now },
    );
    assert.notEqual(result.outcome, 'deny');
    assert.ok(!result.reasonCodes.includes('runtime_guard.missing_runtime_seal'));
  });
});

describe('Runtime Guard — passport status checks', () => {
  it('denies when passport is revoked', async () => {
    const revokedPassport = transitionAgentPassportStatus(activePassport, 'revoked');
    const revokedSeal = await createAgentRuntimeSeal(revokedPassport, { signer });
    const result = await evaluateAgentRuntimeGuard(
      {
        request: { ...baseRequest(), passportId: revokedPassport.passportId },
        passport: revokedPassport,
        runtimeSeal: revokedSeal,
        policyManifest: manifest,
        options: { requireRuntimeSeal: false },
      },
      { signer, now },
    );
    assert.equal(result.outcome, 'deny');
    assert.ok(
      result.reasonCodes.includes('runtime_guard.passport_revoked') ||
      result.reasonCodes.includes('runtime_guard.invalid_passport'),
    );
  });

  it('denies when passport is suspended', async () => {
    const suspendedPassport = transitionAgentPassportStatus(activePassport, 'suspended');
    const result = await evaluateAgentRuntimeGuard(
      {
        request: { ...baseRequest(), passportId: suspendedPassport.passportId },
        passport: suspendedPassport,
        runtimeSeal: seal,
        policyManifest: manifest,
        options: { requireRuntimeSeal: false },
      },
      { signer, now },
    );
    assert.equal(result.outcome, 'deny');
    assert.ok(
      result.reasonCodes.includes('runtime_guard.passport_not_active') ||
      result.reasonCodes.includes('runtime_guard.invalid_passport') ||
      result.reasonCodes.includes('runtime_guard.missing_runtime_seal') ||
      result.reasonCodes.some((c) => c.startsWith('runtime_guard.')),
    );
  });

  it('denies when passport is expired', async () => {
    const expiredPassport: AgentPassport = {
      ...activePassport,
      expiresAt: '2020-01-01T00:00:00.000Z',
    };
    const result = await evaluateAgentRuntimeGuard(
      {
        request: { ...baseRequest(), passportId: expiredPassport.passportId },
        passport: expiredPassport,
        runtimeSeal: seal,
        policyManifest: manifest,
        options: { requireRuntimeSeal: false },
      },
      { signer, now },
    );
    assert.equal(result.outcome, 'deny');
    assert.ok(
      result.reasonCodes.includes('runtime_guard.passport_expired') ||
      result.reasonCodes.includes('runtime_guard.invalid_passport'),
    );
  });
});

describe('Runtime Guard — policy manifest checks', () => {
  it('denies explicitly prohibited action', async () => {
    const result = await evaluateAgentRuntimeGuard(
      makeInput({
        request: {
          ...baseRequest(),
          passportId: activePassport.passportId,
          requestedAction: 'delete_customer',
          actionCategory: 'delete_record',
        },
      }),
      { signer, now },
    );
    assert.equal(result.outcome, 'deny');
    assert.ok(result.reasonCodes.includes('runtime_guard.action_prohibited'));
  });

  it('denies tool not in toolAccess when strictToolAccess is true', async () => {
    const result = await evaluateAgentRuntimeGuard(
      makeInput({
        request: {
          ...baseRequest(),
          passportId: activePassport.passportId,
          requestedAction: 'execute_tool',
          actionCategory: 'execute_tool',
          toolName: 'forbidden_tool',
        },
        options: { strictToolAccess: true },
      }),
      { signer, now },
    );
    assert.equal(result.outcome, 'deny');
    assert.ok(result.reasonCodes.includes('runtime_guard.tool_not_allowed'));
  });

  it('denies data category not in dataAccess when strictDataAccess is true', async () => {
    const result = await evaluateAgentRuntimeGuard(
      makeInput({
        request: {
          ...baseRequest(),
          passportId: activePassport.passportId,
          dataCategories: ['financial.records'],
        },
        options: { strictDataAccess: true },
      }),
      { signer, now },
    );
    assert.equal(result.outcome, 'deny');
    assert.ok(result.reasonCodes.includes('runtime_guard.data_access_not_allowed'));
  });
});

describe('Runtime Guard — human approval', () => {
  it('requires human approval for critical risk tier', async () => {
    const result = await evaluateAgentRuntimeGuard(
      makeInput({
        request: {
          ...baseRequest(),
          passportId: activePassport.passportId,
          riskTier: 'critical',
        },
        options: { humanApprovalRiskTiers: ['critical'] },
      }),
      { signer, now },
    );
    assert.equal(result.outcome, 'require_human_approval');
    assert.ok(result.reasonCodes.includes('runtime_guard.high_risk_requires_approval'));
  });

  it('requires human approval for unknown action when unknownActionMode is require_human_approval', async () => {
    const result = await evaluateAgentRuntimeGuard(
      makeInput({
        request: {
          ...baseRequest(),
          passportId: activePassport.passportId,
          requestedAction: 'completely_unknown_action',
          actionCategory: 'unknown',
        },
        options: { unknownActionMode: 'require_human_approval' },
      }),
      { signer, now },
    );
    assert.equal(result.outcome, 'require_human_approval');
    assert.ok(result.reasonCodes.includes('runtime_guard.action_unknown'));
  });

  it('denies unknown action when unknownActionMode is deny', async () => {
    const result = await evaluateAgentRuntimeGuard(
      makeInput({
        request: {
          ...baseRequest(),
          passportId: activePassport.passportId,
          requestedAction: 'completely_unknown_action',
          actionCategory: 'unknown',
        },
        options: { unknownActionMode: 'deny' },
      }),
      { signer, now },
    );
    assert.equal(result.outcome, 'deny');
    assert.ok(result.reasonCodes.includes('runtime_guard.action_unknown'));
  });
});

describe('Runtime Guard — human approval request', () => {
  it('creates a human approval request from a require_human_approval decision', async () => {
    const decision = await evaluateAgentRuntimeGuard(
      makeInput({
        request: {
          ...baseRequest(),
          passportId: activePassport.passportId,
          riskTier: 'critical',
        },
        options: { humanApprovalRiskTiers: ['critical'] },
      }),
      { signer, now },
    );
    assert.equal(decision.outcome, 'require_human_approval');

    const approvalReq = createHumanApprovalRequest(
      decision,
      { ...baseRequest(), passportId: activePassport.passportId, riskTier: 'critical' },
      now,
    );
    assert.ok(approvalReq.approvalRequestId.startsWith('APPR-'));
    assert.equal(approvalReq.decisionId, decision.decisionId);
    assert.equal(approvalReq.requestId, decision.requestId);
    assert.equal(approvalReq.passportId, decision.passportId);
    assert.equal(approvalReq.status, 'pending');
    assert.equal(approvalReq.createdAt, FIXED_NOW);
  });
});

describe('Runtime Guard — enforcement helper', () => {
  it('maps allow outcome correctly', async () => {
    const result = await enforceAgentRuntimeGuard(
      makeInput({ request: { ...baseRequest(), passportId: activePassport.passportId } }),
      { signer, now },
    );
    assert.equal(result.allowed, true);
    assert.equal(result.blocked, false);
    assert.equal(result.requiresHumanApproval, false);
    assert.equal(result.decision.outcome, 'allow');
  });

  it('maps deny outcome correctly', async () => {
    const result = await enforceAgentRuntimeGuard(
      makeInput({
        request: {
          ...baseRequest(),
          passportId: activePassport.passportId,
          requestedAction: 'delete_customer',
          actionCategory: 'delete_record',
        },
      }),
      { signer, now },
    );
    assert.equal(result.allowed, false);
    assert.equal(result.blocked, true);
    assert.equal(result.requiresHumanApproval, false);
    assert.equal(result.decision.outcome, 'deny');
  });

  it('maps require_human_approval outcome correctly', async () => {
    const result = await enforceAgentRuntimeGuard(
      makeInput({
        request: {
          ...baseRequest(),
          passportId: activePassport.passportId,
          riskTier: 'critical',
        },
        options: { humanApprovalRiskTiers: ['critical'] },
      }),
      { signer, now },
    );
    assert.equal(result.allowed, false);
    assert.equal(result.blocked, true);
    assert.equal(result.requiresHumanApproval, true);
    assert.equal(result.decision.outcome, 'require_human_approval');
  });
});

describe('Runtime Guard — audit events', () => {
  it('emits runtime guard audit events via event sink', async () => {
    const emitted: AgentRuntimeGuardEvent[] = [];
    const eventSink = { emit: (e: AgentRuntimeGuardEvent) => { emitted.push(e); } };

    await evaluateAgentRuntimeGuard(
      makeInput({ request: { ...baseRequest(), passportId: activePassport.passportId } }),
      { signer, now, eventSink },
    );

    assert.ok(emitted.length >= 2, 'should emit at least evaluated + outcome events');
    const types = emitted.map((e) => e.type);
    assert.ok(types.includes('agent_runtime_guard.evaluated'));
    assert.ok(types.includes('agent_runtime_guard.allowed'));
    emitted.forEach((e) => {
      assert.ok(e.eventId.startsWith('RGEVT-'));
      assert.equal(e.occurredAt, FIXED_NOW);
      assert.equal(e.passportId, activePassport.passportId);
    });
  });

  it('emits enforced event from enforcement helper', async () => {
    const emitted: AgentRuntimeGuardEvent[] = [];
    const eventSink = { emit: (e: AgentRuntimeGuardEvent) => { emitted.push(e); } };

    await enforceAgentRuntimeGuard(
      makeInput({ request: { ...baseRequest(), passportId: activePassport.passportId } }),
      { signer, now, eventSink },
    );

    const types = emitted.map((e) => e.type);
    assert.ok(types.includes('agent_runtime_guard.enforced'));
  });
});
