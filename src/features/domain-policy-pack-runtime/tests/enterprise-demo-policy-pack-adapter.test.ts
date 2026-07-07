import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPolicyPackDemoScenarioMetadata,
  buildPolicyPackProofChainReference,
  buildPolicyPackDemoExportSnippet,
} from '../integrations/enterprise-demo-policy-pack-adapter.js';
import { buildDemoPolicyPackRuntime } from '../fixtures/domain-policy-pack-demo.fixture.js';
import { buildApprovePaymentInput } from '../fixtures/payments-policy-demo.fixture.js';
import { buildReadProjectSummaryInput } from '../fixtures/data-boundary-policy-demo.fixture.js';

describe('EnterpriseDemoPolicyPackAdapter', () => {
  it('1. produces demo metadata', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const evaluation = runtime.evaluatePolicy(buildApprovePaymentInput());
    const metadata = buildPolicyPackDemoScenarioMetadata(evaluation);

    assert.equal(metadata.evaluationId, evaluation.id);
    assert.equal(metadata.decisionId, evaluation.decision.id);
    assert.equal(metadata.decisionType, evaluation.decision.type);
    assert.equal(metadata.reasonCode, evaluation.decision.reasonCode);
    assert.equal(metadata.reason, evaluation.decision.reason);
  });

  it('2. produces export snippet', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const evaluation = runtime.evaluatePolicy(buildApprovePaymentInput());
    const snippet = buildPolicyPackDemoExportSnippet(evaluation);

    const parsed = JSON.parse(snippet.json);
    assert.deepEqual(parsed, buildPolicyPackDemoScenarioMetadata(evaluation));
  });

  it('3. includes policy proof references', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const evaluation = runtime.evaluatePolicy(buildApprovePaymentInput());
    const proofReference = buildPolicyPackProofChainReference(evaluation);

    assert.ok(evaluation.proof);
    assert.ok(proofReference);
    assert.equal(proofReference!.proofId, evaluation.proof!.id);
    assert.equal(proofReference!.proofHash, evaluation.proof!.proofHash);
    assert.equal(proofReference!.decisionId, evaluation.proof!.decisionId);
    assert.equal(proofReference!.evaluationId, evaluation.proof!.evaluationId);
  });

  it('4. does not fake scenario outcomes', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const approvalEvaluation = runtime.evaluatePolicy(buildApprovePaymentInput());
    const readEvaluation = runtime.evaluatePolicy(buildReadProjectSummaryInput());

    const approvalMetadata = buildPolicyPackDemoScenarioMetadata(approvalEvaluation);
    const readMetadata = buildPolicyPackDemoScenarioMetadata(readEvaluation);

    assert.notEqual(approvalMetadata.decisionType, readMetadata.decisionType);
    assert.notEqual(approvalMetadata.reasonCode, readMetadata.reasonCode);
  });
});
