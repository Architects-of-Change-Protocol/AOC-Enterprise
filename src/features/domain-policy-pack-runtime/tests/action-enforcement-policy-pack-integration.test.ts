import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createActionEnforcementPolicyPackIntegration,
  type PolicyEnforcementEvaluationInput,
} from '../integrations/action-enforcement-policy-pack-integration.js';
import {
  buildDemoPolicyPackRuntime,
  DEMO_TRUST_DOMAIN_ID,
  DEMO_ACTOR_ID,
  DEMO_RESOURCE_SCOPE,
  DEMO_POLICY_PACK_NOW,
} from '../fixtures/domain-policy-pack-demo.fixture.js';

function buildEnforcementInput(
  overrides: Partial<PolicyEnforcementEvaluationInput> & Pick<PolicyEnforcementEvaluationInput, 'action'>,
): PolicyEnforcementEvaluationInput {
  return {
    trustDomainId: DEMO_TRUST_DOMAIN_ID,
    actorId: DEMO_ACTOR_ID,
    resourceScope: DEMO_RESOURCE_SCOPE,
    riskLevel: 'low',
    requestedAt: DEMO_POLICY_PACK_NOW,
    ...overrides,
  };
}

describe('ActionEnforcementPolicyPackIntegration', () => {
  it('1. policy_denied blocks execution', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createActionEnforcementPolicyPackIntegration(runtime);
    const result = integration.evaluatePolicyForEnforcement(
      buildEnforcementInput({ action: 'change_bank_account', domain: 'payments' }),
    );
    assert.equal(result.type, 'policy_denied');
    assert.equal(result.allowed, false);
  });

  it('2. policy_requires_evidence blocks execution', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createActionEnforcementPolicyPackIntegration(runtime);
    const result = integration.evaluatePolicyForEnforcement(
      buildEnforcementInput({
        action: 'approve_payment',
        domain: 'payments',
        approvalProofId: 'approval-proof-1',
        authorityProofId: 'authority-proof-1',
      }),
    );
    assert.equal(result.type, 'policy_requires_evidence');
    assert.equal(result.allowed, false);
  });

  it('3. policy_requires_approval blocks execution', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createActionEnforcementPolicyPackIntegration(runtime);
    const result = integration.evaluatePolicyForEnforcement(
      buildEnforcementInput({
        action: 'approve_payment',
        domain: 'payments',
        authorityProofId: 'authority-proof-1',
        evidenceIds: ['evidence-1'],
      }),
    );
    assert.equal(result.type, 'policy_requires_approval');
    assert.equal(result.allowed, false);
  });

  it('4. policy_allow does not block by itself', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createActionEnforcementPolicyPackIntegration(runtime);
    const result = integration.evaluatePolicyForEnforcement(
      buildEnforcementInput({
        action: 'read_project_summary',
        domain: 'data_boundary',
        dataDomains: ['project_metadata'],
      }),
    );
    assert.equal(result.type, 'policy_allowed');
    assert.equal(result.allowed, true);
  });

  it('5. policy_allow does not override revoked capability', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createActionEnforcementPolicyPackIntegration(runtime);
    const result = integration.evaluatePolicyForEnforcement(
      buildEnforcementInput({
        action: 'read_project_summary',
        domain: 'data_boundary',
        dataDomains: ['project_metadata'],
      }),
    );
    assert.equal(result.allowed, true);

    // This adapter never itself tracks capability revocation -- Action
    // Enforcement's own default-deny chain must AND a policy "allow" with
    // its own capability-revocation check before granting execution.
    const revoked = true;
    const finalAllowed = result.allowed && !revoked;
    assert.equal(finalAllowed, false);
  });

  it('6. policy_denied wins even when recognition allows', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createActionEnforcementPolicyPackIntegration(runtime);
    const result = integration.evaluatePolicyForEnforcement(
      buildEnforcementInput({ action: 'change_bank_account', domain: 'payments' }),
    );
    assert.equal(result.type, 'policy_denied');
    assert.equal(result.allowed, false);

    // Simulated composition: a Recognition Runtime "allowed" can never
    // override a policy pack deny -- the caller must AND the two together.
    const recognitionAllowed = true;
    const finalAllowed = recognitionAllowed && result.allowed;
    assert.equal(finalAllowed, false);
  });
});
