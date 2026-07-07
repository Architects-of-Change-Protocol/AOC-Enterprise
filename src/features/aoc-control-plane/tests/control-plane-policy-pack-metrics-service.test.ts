import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computePolicyPackMetrics } from '../services/control-plane-policy-pack-metrics-service.js';
import type {
  PolicyDecisionRow,
  PolicyEnforcementLinkRow,
  PolicyEvaluationRow,
  PolicyPackRow,
  PolicyPackVersionRow,
  PolicyProofRow,
  PolicyRuleRow,
} from '../domain/policy-pack-view-model.js';

function metric(metrics: ReturnType<typeof computePolicyPackMetrics>, id: string) {
  const found = metrics.find((m) => m.id === id);
  assert.ok(found, `expected metric ${id}`);
  return found!;
}

describe('ControlPlanePolicyPackMetricsService', () => {
  const packs: PolicyPackRow[] = [
    { id: 'pack-1', name: 'Pack 1', description: '', kind: 'demo', domain: 'payments', status: 'active', currentVersionId: 'v1', versionCount: 1, activeVersionCount: 1, demoOnly: true, legalCompleteness: 'not_legal_advice', createdAt: 't', updatedAt: 't' },
    { id: 'pack-2', name: 'Pack 2', description: '', kind: 'demo', domain: 'procurement', status: 'deprecated', currentVersionId: 'v2', versionCount: 1, activeVersionCount: 0, demoOnly: false, legalCompleteness: 'verified_by_counsel', createdAt: 't', updatedAt: 't' },
  ];
  const versions: PolicyPackVersionRow[] = [
    { id: 'v1', policyPackId: 'pack-1', policyPackName: 'Pack 1', version: '1.0.0', status: 'active', demoOnly: true, legalCompleteness: 'not_legal_advice', effectiveFrom: 't', ruleCount: 2, sourceCount: 1, scopeSummary: 'unscoped', jurisdictions: [], countries: [], domains: [], actions: [] },
    { id: 'v2', policyPackId: 'pack-2', policyPackName: 'Pack 2', version: '1.0.0', status: 'deprecated', demoOnly: false, legalCompleteness: 'verified_by_counsel', effectiveFrom: 't', ruleCount: 1, sourceCount: 1, scopeSummary: 'unscoped', jurisdictions: [], countries: [], domains: [], actions: [] },
  ];
  const rules: PolicyRuleRow[] = [
    { id: 'rule-1', policyPackId: 'pack-1', policyPackVersionId: 'v1', policyPackName: 'Pack 1', version: '1.0.0', name: 'Rule 1', description: '', status: 'active', priority: 1, effectType: 'deny', severity: 'critical', reasonCode: 'R1', sourceIds: [], obligationCount: 0, evidenceRequirementCount: 0, approvalRequirementCount: 0 },
  ];
  const evaluations: PolicyEvaluationRow[] = [
    { id: 'eval-1', inputId: 'in-1', trustDomainId: 'td', actorId: 'a', action: 'act', resourceScope: 'rs', riskLevel: 'low', effectiveRiskLevel: 'low', decisionId: 'd1', decisionType: 'denied', allowed: false, applicablePackVersionIds: [], matchedRuleIds: [], evaluatedAt: 't' },
  ];
  const decisions: PolicyDecisionRow[] = [
    { id: 'd1', inputId: 'in-1', type: 'denied', allowed: false, trustDomainId: 'td', actorId: 'a', action: 'act', resourceScope: 'rs', riskLevel: 'low', effectiveRiskLevel: 'low', applicablePackVersionIds: [], matchedRuleIds: [], reasonCode: 'R1', reason: 'because', obligationIds: [], evidenceRequirementIds: [], approvalRequirementIds: [], obligations: [], evidenceRequirements: [], approvalRequirements: [], decidedAt: 't' },
    { id: 'd2', inputId: 'in-2', type: 'requires_approval', allowed: false, trustDomainId: 'td', actorId: 'a', action: 'act2', resourceScope: 'rs', riskLevel: 'low', effectiveRiskLevel: 'low', applicablePackVersionIds: [], matchedRuleIds: [], reasonCode: 'R2', reason: 'because', obligationIds: [], evidenceRequirementIds: [], approvalRequirementIds: [], obligations: [], evidenceRequirements: [], approvalRequirements: [], decidedAt: 't' },
    { id: 'd3', inputId: 'in-3', type: 'requires_evidence', allowed: false, trustDomainId: 'td', actorId: 'a', action: 'act3', resourceScope: 'rs', riskLevel: 'low', effectiveRiskLevel: 'low', applicablePackVersionIds: [], matchedRuleIds: [], reasonCode: 'R3', reason: 'because', obligationIds: [], evidenceRequirementIds: [], approvalRequirementIds: [], obligations: [], evidenceRequirements: [], approvalRequirements: [], decidedAt: 't' },
    { id: 'd4', inputId: 'in-4', type: 'warning', allowed: true, trustDomainId: 'td', actorId: 'a', action: 'act4', resourceScope: 'rs', riskLevel: 'low', effectiveRiskLevel: 'low', applicablePackVersionIds: [], matchedRuleIds: [], reasonCode: 'R4', reason: 'because', obligationIds: [], evidenceRequirementIds: [], approvalRequirements: [], approvalRequirementIds: [], evidenceRequirements: [], obligations: [], decidedAt: 't' },
  ];
  const proofs: PolicyProofRow[] = [
    { id: 'proof-1', evaluationId: 'eval-1', decisionId: 'd1', trustDomainId: 'td', actorId: 'a', action: 'act', resourceScope: 'rs', policyPackVersionIds: [], matchedRuleIds: [], inputHash: 'h', ruleResultsHash: 'h', decisionHash: 'h', proofHash: 'h', createdAt: 't' },
  ];
  const enforcementLinks: PolicyEnforcementLinkRow[] = [
    { id: 'link-1', policyPackVersionIds: [], matchedRuleIds: [], action: 'act', actorId: 'a', resourceScope: 'rs', blockedByPolicy: true },
    { id: 'link-2', policyPackVersionIds: [], matchedRuleIds: [], action: 'act2', actorId: 'a', resourceScope: 'rs', blockedByPolicy: false },
  ];

  const metrics = computePolicyPackMetrics({ packs, versions, rules, evaluations, decisions, proofs, enforcementLinks });

  it('1. counts policy packs', () => {
    assert.equal(metric(metrics, 'policy-packs').value, 2);
  });

  it('2. counts active versions', () => {
    assert.equal(metric(metrics, 'active-policy-pack-versions').value, 1);
  });

  it('3. counts demo-only versions', () => {
    assert.equal(metric(metrics, 'demo-only-policy-pack-versions').value, 1);
  });

  it('4. counts rules', () => {
    assert.equal(metric(metrics, 'policy-rules').value, 1);
  });

  it('5. counts evaluations', () => {
    assert.equal(metric(metrics, 'policy-evaluations').value, 1);
  });

  it('6. counts denied decisions', () => {
    assert.equal(metric(metrics, 'policy-denied-decisions').value, 1);
  });

  it('7. counts approval-required decisions', () => {
    assert.equal(metric(metrics, 'policy-approval-required-decisions').value, 1);
  });

  it('8. counts evidence-required decisions', () => {
    assert.equal(metric(metrics, 'policy-evidence-required-decisions').value, 1);
  });

  it('9. counts warning decisions', () => {
    assert.equal(metric(metrics, 'policy-warning-decisions').value, 1);
  });

  it('10. counts policy proofs', () => {
    assert.equal(metric(metrics, 'policy-proofs').value, 1);
  });

  it('11. counts policy-blocked enforcement decisions', () => {
    assert.equal(metric(metrics, 'policy-blocked-executions').value, 1);
  });

  it('12. assigns expected tones', () => {
    assert.equal(metric(metrics, 'policy-denied-decisions').tone, 'danger');
    assert.equal(metric(metrics, 'policy-blocked-executions').tone, 'danger');
    assert.equal(metric(metrics, 'demo-only-policy-pack-versions').tone, 'warning');
    assert.equal(metric(metrics, 'policy-packs').tone, 'neutral');
  });

  it('13. deterministic metrics', () => {
    const again = computePolicyPackMetrics({ packs, versions, rules, evaluations, decisions, proofs, enforcementLinks });
    assert.deepEqual(metrics, again);
  });
});
