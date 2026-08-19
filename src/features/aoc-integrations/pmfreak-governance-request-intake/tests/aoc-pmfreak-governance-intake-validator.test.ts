import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateAocPMFreakGovernanceRequest } from '../aoc-pmfreak-governance-intake-validator.js';
import { demoAocPMFreakBillingAllowedRequest } from '../aoc-pmfreak-governance-intake-fixtures.js';
import type { AocPMFreakGovernanceRequest } from '../aoc-pmfreak-governance-intake-types.js';

describe('Soberanía PMFreak Governance Request Intake -- validator', () => {
  it('accepts a valid request', () => {
    const result = validateAocPMFreakGovernanceRequest(demoAocPMFreakBillingAllowedRequest);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('rejects a request missing critical fields', () => {
    const invalid: AocPMFreakGovernanceRequest = {
      ...demoAocPMFreakBillingAllowedRequest,
      requestId: '',
      clientId: '',
    };

    const result = validateAocPMFreakGovernanceRequest(invalid);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('requestId')));
    assert.ok(result.errors.some((error) => error.includes('clientId')));
  });

  it('rejects a request with the wrong providerId or consumerOf', () => {
    const wrongProvider = { ...demoAocPMFreakBillingAllowedRequest, providerId: 'not-pmfreak' as unknown as 'pmfreak' };
    const wrongConsumer = { ...demoAocPMFreakBillingAllowedRequest, consumerOf: 'not-aoc' as unknown as 'aoc' };

    assert.equal(validateAocPMFreakGovernanceRequest(wrongProvider).valid, false);
    assert.equal(validateAocPMFreakGovernanceRequest(wrongConsumer).valid, false);
  });

  it('rejects a request with an invalid requestMode', () => {
    const invalid = { ...demoAocPMFreakBillingAllowedRequest, requestMode: 'execute' as unknown as 'dry_run' };
    const result = validateAocPMFreakGovernanceRequest(invalid);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('requestMode')));
  });

  it('rejects a request whose projectContext.projectId does not match actionAttempt.projectId', () => {
    const mismatched: AocPMFreakGovernanceRequest = {
      ...demoAocPMFreakBillingAllowedRequest,
      projectContext: { ...demoAocPMFreakBillingAllowedRequest.projectContext, projectId: 'project.other' },
    };

    const result = validateAocPMFreakGovernanceRequest(mismatched);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('projectContext.projectId')));
  });

  it('rejects a request whose agentContext.agentId does not match actionAttempt.agentId', () => {
    const mismatched: AocPMFreakGovernanceRequest = {
      ...demoAocPMFreakBillingAllowedRequest,
      agentContext: { ...demoAocPMFreakBillingAllowedRequest.agentContext, agentId: 'pmfreak.agent.other' },
    };

    const result = validateAocPMFreakGovernanceRequest(mismatched);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('agentContext.agentId')));
  });

  it('rejects a request whose actionContext.actionId does not match actionAttempt.actionId', () => {
    const mismatched: AocPMFreakGovernanceRequest = {
      ...demoAocPMFreakBillingAllowedRequest,
      actionContext: { ...demoAocPMFreakBillingAllowedRequest.actionContext, actionId: 'pmfreak.action.other' },
    };

    const result = validateAocPMFreakGovernanceRequest(mismatched);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('actionContext.actionId')));
  });

  it('rejects a request carrying an unsafe claim phrase', () => {
    const unsafe: AocPMFreakGovernanceRequest = {
      ...demoAocPMFreakBillingAllowedRequest,
      actionAttempt: { ...demoAocPMFreakBillingAllowedRequest.actionAttempt, actionDescription: 'invoice validity certified' },
    };

    const result = validateAocPMFreakGovernanceRequest(unsafe);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('unsafe claim')));
  });

  it('never mutates the request it validates', () => {
    const before = JSON.parse(JSON.stringify(demoAocPMFreakBillingAllowedRequest)) as unknown;
    validateAocPMFreakGovernanceRequest(demoAocPMFreakBillingAllowedRequest);
    assert.deepEqual(demoAocPMFreakBillingAllowedRequest, before);
  });
});
