import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakGovernanceRequestIntakeClient } from '../aoc-pmfreak-governance-intake-client.js';
import { demoAocPMFreakBillingAllowedRequest, demoAocPMFreakBillingMissingEvidenceRequest } from '../aoc-pmfreak-governance-intake-fixtures.js';

describe('AOC PMFreak Governance Request Intake -- client/facade', () => {
  it('exposes a descriptor and config', () => {
    const client = createAocPMFreakGovernanceRequestIntakeClient();
    assert.equal(client.descriptor.intakeId, 'aoc.integration.pmfreak.governance_request_intake.v1');
    assert.equal(client.config.evaluationMode, 'deterministic_local');
  });

  it('validateRequest works', () => {
    const client = createAocPMFreakGovernanceRequestIntakeClient();
    const result = client.validateRequest(demoAocPMFreakBillingAllowedRequest);
    assert.equal(result.valid, true);
  });

  it('evaluateRequest works', async () => {
    const client = createAocPMFreakGovernanceRequestIntakeClient();
    const response = await client.evaluateRequest(demoAocPMFreakBillingMissingEvidenceRequest);
    assert.equal(response.decision, 'require_evidence');
  });

  it('receiveAndEvaluate returns a request/response pair', async () => {
    const client = createAocPMFreakGovernanceRequestIntakeClient();
    const { request, response } = await client.receiveAndEvaluate(demoAocPMFreakBillingAllowedRequest);

    assert.equal(request, demoAocPMFreakBillingAllowedRequest);
    assert.equal(response.requestId, demoAocPMFreakBillingAllowedRequest.requestId);
    assert.equal(response.decision, 'allow');
  });

  it('getHealth reports a healthy status by default', async () => {
    const client = createAocPMFreakGovernanceRequestIntakeClient();
    const health = await client.getHealth();
    assert.equal(health.status, 'healthy');
    assert.equal(health.pmfreakMutationCapable, false);
    assert.equal(health.actionExecutionCapable, false);
  });

  it('honors a passed-in config override', () => {
    const client = createAocPMFreakGovernanceRequestIntakeClient({ config: { environment: 'staging' } });
    assert.equal(client.config.environment, 'staging');
  });
});
