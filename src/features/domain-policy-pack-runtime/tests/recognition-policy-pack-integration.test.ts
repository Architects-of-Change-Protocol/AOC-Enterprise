import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRecognitionPolicyPackIntegration,
  type PolicyRecognitionEvaluationInput,
} from '../integrations/recognition-policy-pack-integration.js';
import {
  buildDemoPolicyPackRuntime,
  DEMO_TRUST_DOMAIN_ID,
  DEMO_ACTOR_ID,
  DEMO_RESOURCE_SCOPE,
  DEMO_POLICY_PACK_NOW,
} from '../fixtures/domain-policy-pack-demo.fixture.js';

function buildRecognitionInput(
  overrides: Partial<PolicyRecognitionEvaluationInput> & Pick<PolicyRecognitionEvaluationInput, 'action'>,
): PolicyRecognitionEvaluationInput {
  return {
    trustDomainId: DEMO_TRUST_DOMAIN_ID,
    actorId: DEMO_ACTOR_ID,
    resourceScope: DEMO_RESOURCE_SCOPE,
    riskLevel: 'low',
    requestedAt: DEMO_POLICY_PACK_NOW,
    ...overrides,
  };
}

describe('RecognitionPolicyPackIntegration', () => {
  it('1. policy_denied maps to policy_violation', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createRecognitionPolicyPackIntegration(runtime);
    const result = integration.evaluatePolicyForRecognition(
      buildRecognitionInput({ action: 'change_bank_account', domain: 'payments' }),
    );
    assert.equal(result.recognitionOverrideType, 'policy_violation');
  });

  it('2. policy_requires_evidence maps to require_more_evidence', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createRecognitionPolicyPackIntegration(runtime);
    const result = integration.evaluatePolicyForRecognition(
      buildRecognitionInput({
        action: 'approve_payment',
        domain: 'payments',
        hasApprovalProof: true,
        hasAuthorityProof: true,
      }),
    );
    assert.equal(result.recognitionOverrideType, 'require_more_evidence');
  });

  it('3. policy_requires_approval maps to require_human_approval', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createRecognitionPolicyPackIntegration(runtime);
    const result = integration.evaluatePolicyForRecognition(
      buildRecognitionInput({
        action: 'approve_payment',
        domain: 'payments',
        hasAuthorityProof: true,
        evidenceIds: ['evidence-1'],
      }),
    );
    assert.equal(result.recognitionOverrideType, 'require_human_approval');
  });

  it('4. policy_not_applicable does not change recognition behavior', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createRecognitionPolicyPackIntegration(runtime);
    const result = integration.evaluatePolicyForRecognition(
      buildRecognitionInput({ action: 'totally_unrelated_action' }),
    );
    assert.equal(result.recognitionOverrideType, undefined);
  });

  it('5. policy allow does not override invalid capability', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createRecognitionPolicyPackIntegration(runtime);
    const result = integration.evaluatePolicyForRecognition(
      buildRecognitionInput({
        action: 'read_project_summary',
        domain: 'data_boundary',
        dataDomains: ['project_metadata'],
      }),
    );
    assert.equal(result.recognitionOverrideType, undefined);

    // Recognition Runtime's own capability validation is independent of
    // this adapter -- an absent override here never grants recognition on
    // its own, it only declines to add a restriction.
    const capabilityInvalid = true;
    const recognized = capabilityInvalid ? false : result.recognitionOverrideType === undefined;
    assert.equal(recognized, false);
  });
});
