import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDemoPolicyPackRuntime,
  DEMO_POLICY_PACK_NOW,
  DEMO_TRUST_DOMAIN_ID,
  DEMO_ACTOR_ID,
  DEMO_RESOURCE_SCOPE,
} from '../../fixtures/domain-policy-pack-demo.fixture.js';
import { buildReadProjectSummaryInput } from '../../fixtures/data-boundary-policy-demo.fixture.js';
import {
  createActionEnforcementPolicyPackIntegration,
  type PolicyEnforcementEvaluationInput,
} from '../../integrations/action-enforcement-policy-pack-integration.js';

describe('policy pack allows a low-risk, non-sensitive read', () => {
  it('1. read_project_summary touching no sensitive data domain is allowed', () => {
    const runtime = buildDemoPolicyPackRuntime();

    const result = runtime.evaluatePolicy(buildReadProjectSummaryInput());

    assert.equal(result.decision.type, 'allowed');
    assert.equal(result.decision.allowed, true);

    assert.ok(result.proof);
    assert.equal(result.decision.proofId, result.proof!.id);
  });

  it('2. an allowed policy result does not itself block enforcement', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const integration = createActionEnforcementPolicyPackIntegration(runtime);

    const enforcementInput: PolicyEnforcementEvaluationInput = {
      trustDomainId: DEMO_TRUST_DOMAIN_ID,
      actorId: DEMO_ACTOR_ID,
      action: 'read_project_summary',
      resourceScope: DEMO_RESOURCE_SCOPE,
      riskLevel: 'low',
      requestedAt: DEMO_POLICY_PACK_NOW,
      domain: 'data_boundary',
      dataDomains: ['project_metadata'],
    };

    const enforcementResult = integration.evaluatePolicyForEnforcement(enforcementInput);

    assert.equal(enforcementResult.type, 'policy_allowed');
    assert.equal(enforcementResult.allowed, true);
  });
});
