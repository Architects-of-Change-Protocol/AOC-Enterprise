import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDemoPolicyPackRuntime } from '../../domain-policy-pack-runtime/fixtures/domain-policy-pack-demo.fixture.js';
import { buildApprovePaymentInput } from '../../domain-policy-pack-runtime/fixtures/payments-policy-demo.fixture.js';
import { buildPolicyPackViewModel, buildPolicyEnforcementLinks } from '../services/control-plane-policy-pack-read-model-service.js';
import type { EnforcementDecisionRow, EnforcementProofRow, EnforcementRequestRow } from '../domain/control-plane-view-model.js';

function buildRequestRow(overrides: Partial<EnforcementRequestRow> = {}): EnforcementRequestRow {
  return {
    id: 'enforcement-request-1',
    mode: 'execute',
    status: 'decided',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'approve_payment',
    resourceScope: 'project:1',
    targetType: 'generic',
    targetName: 'approve_payment',
    sideEffectType: 'financial',
    submittedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildDecisionRow(overrides: Partial<EnforcementDecisionRow> = {}): EnforcementDecisionRow {
  return {
    id: 'enforcement-decision-1',
    enforcementRequestId: 'enforcement-request-1',
    type: 'execution_blocked',
    allowedToExecute: false,
    reasonCode: 'POLICY_PACK_DENIED',
    reason: 'blocked by policy',
    decidedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ControlPlanePolicyPackReadModelService', () => {
  it('1. returns empty policy view model when no policy data is available', () => {
    const viewModel = buildPolicyPackViewModel({ enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    assert.deepEqual(viewModel.packs, []);
    assert.deepEqual(viewModel.versions, []);
    assert.deepEqual(viewModel.rules, []);
    assert.deepEqual(viewModel.evaluations, []);
    assert.deepEqual(viewModel.decisions, []);
    assert.deepEqual(viewModel.proofs, []);
    assert.deepEqual(viewModel.events, []);
    assert.deepEqual(viewModel.enforcementLinks, []);
    assert.ok(viewModel.metrics.length > 0);
    assert.ok(viewModel.metrics.every((metric) => metric.value === 0));
  });

  it('2. maps PolicyPack to PolicyPackRow', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const viewModel = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    assert.equal(viewModel.packs.length, 6);
    const paymentsPack = viewModel.packs.find((pack) => pack.id === 'policy-pack-payments-basic');
    assert.ok(paymentsPack);
    assert.equal(paymentsPack!.kind, 'demo');
    assert.equal(paymentsPack!.domain, 'payments');
    assert.equal(paymentsPack!.status, 'active');
    assert.ok(paymentsPack!.description.length > 0);
  });

  it('3. maps PolicyPackVersion to PolicyPackVersionRow', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const viewModel = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    assert.ok(viewModel.versions.length >= 6);
    const version = viewModel.versions.find((v) => v.policyPackId === 'policy-pack-payments-basic');
    assert.ok(version);
    assert.equal(version!.status, 'active');
    assert.ok(version!.ruleCount > 0);
    assert.ok(version!.scopeSummary.length > 0);
  });

  it('4. maps PolicyPackRule to PolicyRuleRow', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const viewModel = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    assert.ok(viewModel.rules.length > 0);
    const rule = viewModel.rules[0]!;
    assert.ok(rule.policyPackId.length > 0);
    assert.ok(rule.name.length > 0);
    assert.ok(['allow', 'deny', 'require_evidence', 'require_approval', 'require_authority', 'require_external_standing', 'limit_scope', 'raise_risk', 'warn', 'no_op'].includes(rule.effectType));
  });

  it('5. maps PolicyEvaluation to PolicyEvaluationRow', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const evaluation = runtime.evaluatePolicy(buildApprovePaymentInput());
    const viewModel = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    const row = viewModel.evaluations.find((e) => e.id === evaluation.id);
    assert.ok(row);
    assert.equal(row!.decisionId, evaluation.decision.id);
    assert.equal(row!.decisionType, evaluation.decision.type);
    assert.equal(row!.allowed, evaluation.decision.allowed);
    assert.equal(row!.action, 'approve_payment');
  });

  it('6. maps PolicyPackDecision to PolicyDecisionRow', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const evaluation = runtime.evaluatePolicy(buildApprovePaymentInput());
    const viewModel = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    const row = viewModel.decisions.find((d) => d.id === evaluation.decision.id);
    assert.ok(row);
    assert.equal(row!.type, evaluation.decision.type);
    assert.equal(row!.reasonCode, evaluation.decision.reasonCode);
    assert.deepEqual(row!.obligationIds, evaluation.decision.obligations.map((o) => o.id));
  });

  it('7. maps PolicyPackProof to PolicyProofRow', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const evaluation = runtime.evaluatePolicy(buildApprovePaymentInput());
    const viewModel = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    assert.ok(evaluation.proof);
    const row = viewModel.proofs.find((p) => p.id === evaluation.proof!.id);
    assert.ok(row);
    assert.equal(row!.proofHash, evaluation.proof!.proofHash);
    assert.equal(row!.inputHash, evaluation.proof!.inputHash);
  });

  it('8. maps PolicyPackEvent to PolicyEventRow', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const viewModel = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    assert.ok(viewModel.events.length > 0);
    assert.ok(viewModel.events.some((event) => event.type === 'policy_pack_registered'));
    assert.ok(viewModel.events.every((event) => event.summary.length > 0));
  });

  it('9. builds PolicyEnforcementLinkRow from EnforcementDecision policy metadata', () => {
    const requests = [buildRequestRow()];
    const decisions = [buildDecisionRow({ policyDecisionId: 'policy-decision-1', policyReasonCode: 'POLICY_PACK_DENIED', reasonCode: 'POLICY_PACK_DENIED' })];
    const links = buildPolicyEnforcementLinks(requests, decisions, []);
    assert.equal(links.length, 1);
    assert.equal(links[0]!.policyDecisionId, 'policy-decision-1');
    assert.equal(links[0]!.action, 'approve_payment');
    assert.equal(links[0]!.blockedByPolicy, true);
  });

  it('10. builds PolicyEnforcementLinkRow from EnforcementProof policy metadata', () => {
    const requests = [buildRequestRow()];
    const decisions = [buildDecisionRow({ policyProofId: 'policy-proof-1' })];
    const proofs: EnforcementProofRow[] = [
      {
        id: 'enforcement-proof-1',
        enforcementRequestId: 'enforcement-request-1',
        enforcementDecisionId: 'enforcement-decision-1',
        allowedToExecute: false,
        executed: false,
        proofHash: 'hash',
        createdAt: '2026-01-01T00:00:00.000Z',
        policyProofId: 'policy-proof-1',
      },
    ];
    const links = buildPolicyEnforcementLinks(requests, decisions, proofs);
    assert.equal(links.length, 1);
    assert.equal(links[0]!.enforcementProofId, 'enforcement-proof-1');
    assert.equal(links[0]!.policyProofId, 'policy-proof-1');
  });

  it('11. preserves demoOnly', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const viewModel = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    assert.ok(viewModel.versions.every((version) => version.demoOnly === true));
  });

  it('12. preserves legalCompleteness', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const viewModel = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    assert.ok(viewModel.versions.every((version) => version.legalCompleteness === 'not_legal_advice'));
  });

  it('13. does not infer legal compliance', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const viewModel = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    for (const pack of viewModel.packs) {
      assert.equal(pack.legalCompleteness, 'not_legal_advice');
    }
  });

  it('14. deterministic output with same input', () => {
    const runtime = buildDemoPolicyPackRuntime();
    runtime.evaluatePolicy(buildApprovePaymentInput());
    const first = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    const second = buildPolicyPackViewModel({ policyPackRuntime: runtime, enforcementRequests: [], enforcementDecisions: [], enforcementProofs: [] });
    assert.deepEqual(first, second);
  });
});
