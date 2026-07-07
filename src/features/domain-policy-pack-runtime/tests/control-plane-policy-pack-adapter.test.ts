import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPolicyPackControlPlaneViewModel } from '../integrations/control-plane-policy-pack-adapter.js';
import { buildDemoPolicyPackRuntime } from '../fixtures/domain-policy-pack-demo.fixture.js';
import { buildApprovePaymentInput } from '../fixtures/payments-policy-demo.fixture.js';

describe('PolicyPackControlPlaneAdapter', () => {
  it('1. maps policy packs to rows', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const viewModel = buildPolicyPackControlPlaneViewModel(runtime);
    assert.equal(viewModel.policyPacks.length, 6);

    const paymentsRow = viewModel.policyPacks.find((row) => row.id === 'policy-pack-payments-basic');
    assert.ok(paymentsRow);
    assert.equal(paymentsRow!.kind, 'demo');
    assert.equal(paymentsRow!.domain, 'payments');
    assert.equal(paymentsRow!.status, 'active');
  });

  it('2. maps policy decisions to rows', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const evaluation = runtime.evaluatePolicy(buildApprovePaymentInput());
    const viewModel = buildPolicyPackControlPlaneViewModel(runtime);

    assert.ok(viewModel.policyDecisions.length >= 1);
    const decisionRow = viewModel.policyDecisions.find((row) => row.id === evaluation.decision.id);
    assert.ok(decisionRow);
    assert.equal(decisionRow!.type, evaluation.decision.type);
    assert.equal(decisionRow!.allowed, evaluation.decision.allowed);
    assert.equal(decisionRow!.trustDomainId, evaluation.decision.trustDomainId);
    assert.equal(decisionRow!.actorId, evaluation.decision.actorId);
  });

  it('3. maps proofs to rows', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const evaluation = runtime.evaluatePolicy(buildApprovePaymentInput());
    const viewModel = buildPolicyPackControlPlaneViewModel(runtime);

    assert.ok(viewModel.policyProofs.length >= 1);
    assert.ok(evaluation.proof);
    const proofRow = viewModel.policyProofs.find((row) => row.id === evaluation.proof!.id);
    assert.ok(proofRow);
    assert.equal(proofRow!.proofHash, evaluation.proof!.proofHash);
  });

  it('4. maps events to rows', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const viewModel = buildPolicyPackControlPlaneViewModel(runtime);

    assert.ok(viewModel.policyEvents.length > 0);
    assert.ok(viewModel.policyEvents.some((row) => row.type === 'policy_pack_registered'));
  });

  it('5. deterministic output', () => {
    const firstViewModel = buildPolicyPackControlPlaneViewModel(buildDemoPolicyPackRuntime());
    const secondViewModel = buildPolicyPackControlPlaneViewModel(buildDemoPolicyPackRuntime());

    assert.deepEqual(firstViewModel.policyPacks, secondViewModel.policyPacks);
    assert.deepEqual(firstViewModel.policyPackVersions, secondViewModel.policyPackVersions);
    assert.deepEqual(firstViewModel.policyRules, secondViewModel.policyRules);
  });
});
