import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakGovernanceResponse } from '../aoc-pmfreak-governance-response-builder.js';
import { demoAocPMFreakBillingAllowedRequest } from '../aoc-pmfreak-governance-intake-fixtures.js';

describe('AOC PMFreak Governance Request Intake -- response builder', () => {
  it('creates a deterministic responseId derived from requestId', () => {
    const responseA = createAocPMFreakGovernanceResponse({ request: demoAocPMFreakBillingAllowedRequest, decision: 'allow' });
    const responseB = createAocPMFreakGovernanceResponse({ request: demoAocPMFreakBillingAllowedRequest, decision: 'allow' });

    assert.equal(responseA.responseId, responseB.responseId);
    assert.equal(responseA.responseId, `aoc.pmfreak.response.${demoAocPMFreakBillingAllowedRequest.requestId}.v1`);
  });

  it('preserves requestId and clientId', () => {
    const response = createAocPMFreakGovernanceResponse({ request: demoAocPMFreakBillingAllowedRequest, decision: 'allow' });
    assert.equal(response.requestId, demoAocPMFreakBillingAllowedRequest.requestId);
    assert.equal(response.clientId, demoAocPMFreakBillingAllowedRequest.clientId);
  });

  it('sets providerId to "aoc" and evaluatedFor to "pmfreak"', () => {
    const response = createAocPMFreakGovernanceResponse({ request: demoAocPMFreakBillingAllowedRequest, decision: 'allow' });
    assert.equal(response.providerId, 'aoc');
    assert.equal(response.evaluatedFor, 'pmfreak');
  });

  it('includes a safe summary, trace, safe labels, and disclaimers', () => {
    const response = createAocPMFreakGovernanceResponse({ request: demoAocPMFreakBillingAllowedRequest, decision: 'require_evidence', missingEvidenceIds: ['pmfreak.evidence.deliverable_evidence'] });

    assert.ok(response.safeSummary.length > 0);
    assert.ok(response.trace.length > 0);
    assert.ok(response.safeLabels.length > 0);
    assert.ok(response.disclaimers.length > 0);
    assert.ok(response.trace.some((step) => step.stepId === 'evidence_gate' && step.status === 'blocked'));
  });

  it('preserves warnings and errors passed in', () => {
    const response = createAocPMFreakGovernanceResponse({ request: demoAocPMFreakBillingAllowedRequest, decision: 'deny', warnings: ['a warning'], errors: ['an error'] });
    assert.deepEqual(response.warnings, ['a warning']);
    assert.deepEqual(response.errors, ['an error']);
  });

  it('never mutates the request it builds a response from', () => {
    const before = JSON.parse(JSON.stringify(demoAocPMFreakBillingAllowedRequest)) as unknown;
    createAocPMFreakGovernanceResponse({ request: demoAocPMFreakBillingAllowedRequest, decision: 'allow' });
    assert.deepEqual(demoAocPMFreakBillingAllowedRequest, before);
  });
});
