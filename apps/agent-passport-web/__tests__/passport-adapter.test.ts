import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import type { IssuedAgentPassportBundle } from '@aoc-enterprise/agent-governance';
import {
  enrollAgent,
  getAgentPassportBundle,
  verifyAgentPassportBundle,
  createSampleAgentPassport,
  runRuntimeGuardDemo,
  runGovernanceProofScenarios,
  runGovernanceProofScenario,
} from '../src/lib/passport-adapter.js';
import { createAgentPassportPublicVerificationPayload } from '@aoc-enterprise/agent-governance';

const SAMPLE_INPUT = {
  agentName: 'TestAgent Alpha',
  ownerId: 'test-owner-1',
  ownerName: 'Test Owner Corp',
  purpose: 'Automated testing agent for Soberanía passport adapter.',
  jurisdiction: 'US',
  autonomyLevel: 'low' as const,
  riskTier: 'low' as const,
  dataAccess: ['test_data', 'public_docs'],
  tools: ['read_record', 'write_report'],
  prohibitedActions: ['delete_all', 'bypass_auth'],
  humanApprovalRequiredActions: [],
  escalationRules: [{ trigger: 'delete_all', action: 'block' }],
  createdBy: 'test-suite',
};

describe('passport-adapter', () => {
  let bundle: IssuedAgentPassportBundle;

  before(async () => {
    bundle = await enrollAgent(SAMPLE_INPUT);
  });

  it('enrollment creates a passport bundle', () => {
    assert.ok(bundle.passport.passportId, 'passportId should be set');
    assert.equal(bundle.passport.agentName, SAMPLE_INPUT.agentName);
    assert.equal(bundle.passport.ownerName, SAMPLE_INPUT.ownerName);
    assert.ok(bundle.passport.constitutionHash, 'constitutionHash should be set');
    assert.ok(bundle.passport.policyManifestHash, 'policyManifestHash should be set');
    assert.ok(bundle.passport.passportHash, 'passportHash should be set');
    assert.ok(bundle.runtimeSeal, 'runtimeSeal should be present');
  });

  it('getAgentPassportBundle retrieves stored bundle', () => {
    const retrieved = getAgentPassportBundle(bundle.passport.passportId);
    assert.ok(retrieved, 'should retrieve bundle');
    assert.equal(retrieved.passport.passportId, bundle.passport.passportId);
  });

  it('public verification payload hides sensitive metadata', () => {
    const publicPayload = createAgentPassportPublicVerificationPayload(bundle.passport);
    assert.ok(!('signature' in publicPayload), 'signature should not be in public payload');
    assert.ok(!('ownerId' in publicPayload), 'ownerId should not be in public payload');
    assert.ok(!('metadata' in publicPayload), 'metadata should not be in public payload');
    assert.ok(publicPayload.passportId, 'passportId should be present');
    assert.ok(publicPayload.passportHash, 'passportHash should be present');
  });

  it('verifyAgentPassportBundle returns valid for active/issued passport', async () => {
    const result = await verifyAgentPassportBundle(bundle.passport.passportId);
    assert.ok(result, 'should return result');
    assert.equal(result.passportResult.valid, true, 'passport verification should be valid');
    if (result.runtimeSealResult) {
      assert.equal(result.runtimeSealResult.valid, true, 'runtime seal should be valid');
    }
  });

  it('verifyAgentPassportBundle returns null for unknown passport ID', async () => {
    const result = await verifyAgentPassportBundle('AGT-NONEXISTENT-0000-0000');
    assert.equal(result, null);
  });

  it('createSampleAgentPassport creates SalesBot CR passport', async () => {
    const sample = await createSampleAgentPassport();
    assert.equal(sample.passport.agentName, 'SalesBot CR');
    assert.equal(sample.passport.ownerName, 'Soberanía Demo Company');
    assert.equal(sample.passport.jurisdiction, 'CR');
    assert.equal(sample.passport.autonomyLevel, 'medium');
    assert.equal(sample.passport.riskTier, 'medium');
  });

  it('createSampleAgentPassport is idempotent (returns existing)', async () => {
    const a = await createSampleAgentPassport();
    const b = await createSampleAgentPassport();
    assert.equal(a.passport.passportId, b.passport.passportId, 'should return same passport');
  });

  it('runtime guard allows permitted action (create_lead)', async () => {
    const sample = await createSampleAgentPassport();
    const decision = await runRuntimeGuardDemo(
      sample.passport.passportId,
      'create_lead',
      'create_record',
      'create_lead',
      ['crm_lead_notes'],
    );
    assert.ok(decision, 'should return decision');
    // create_lead is in tools, so with humanOversight=required it requires human approval or allow
    // With allowIssuedPassport=true, it should not deny on passport status
    assert.notEqual(decision.outcome, 'deny', 'should not deny permitted action');
  });

  it('runtime guard denies prohibited action (offer_unapproved_discounts)', async () => {
    const sample = await createSampleAgentPassport();
    const decision = await runRuntimeGuardDemo(
      sample.passport.passportId,
      'offer_unapproved_discounts',
      'execute_tool',
      'offer_unapproved_discounts',
      [],
    );
    assert.ok(decision, 'should return decision');
    assert.equal(decision.outcome, 'deny', 'should deny prohibited action');
    assert.ok(
      decision.reasonCodes.includes('runtime_guard.action_prohibited'),
      'should include action_prohibited reason code',
    );
  });

  it('runtime guard returns null for unknown passport ID', async () => {
    const result = await runRuntimeGuardDemo(
      'AGT-NONEXISTENT-0000-0000',
      'create_lead',
      'create_record',
      'create_lead',
      [],
    );
    assert.equal(result, null);
  });
});



describe('proof-of-governance scenarios', () => {
  it('allowed action returns allow', async () => {
    const result = await runGovernanceProofScenario('allowed_action');
    assert.equal(result.decision.outcome, 'allow');
    assert.equal(result.executionResult, 'Allowed to proceed');
  });

  it('prohibited action returns deny', async () => {
    const result = await runGovernanceProofScenario('prohibited_action');
    assert.equal(result.decision.outcome, 'deny');
    assert.ok(result.decision.reasonCodes.includes('runtime_guard.action_prohibited'));
  });

  it('unauthorized data returns deny', async () => {
    const result = await runGovernanceProofScenario('unauthorized_data_access');
    assert.equal(result.decision.outcome, 'deny');
    assert.ok(result.decision.reasonCodes.includes('runtime_guard.data_access_not_allowed'));
  });

  it('human approval scenario returns require_human_approval', async () => {
    const result = await runGovernanceProofScenario('human_approval_required');
    assert.equal(result.decision.outcome, 'require_human_approval');
    assert.ok(result.decision.reasonCodes.includes('runtime_guard.high_risk_requires_approval'));
  });

  it('tampered runtime seal returns deny', async () => {
    const result = await runGovernanceProofScenario('tampered_runtime_seal');
    assert.equal(result.decision.outcome, 'deny');
    assert.ok(result.decision.reasonCodes.includes('runtime_guard.invalid_runtime_seal'));
  });

  it('revoked passport returns deny', async () => {
    const result = await runGovernanceProofScenario('revoked_passport');
    assert.equal(result.decision.outcome, 'deny');
    assert.ok(result.decision.reasonCodes.includes('runtime_guard.passport_revoked'));
  });

  it('each scenario emits at least one audit event and passes expectations', async () => {
    const results = await runGovernanceProofScenarios();
    assert.ok(results.length >= 7);
    for (const result of results) {
      assert.ok(result.auditEvents.length > 0, `${result.scenarioKey} should emit audit events`);
      assert.equal(result.passed, true, `${result.scenarioKey} should pass expected outcome`);
    }
  });
});
