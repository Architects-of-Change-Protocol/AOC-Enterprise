import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapPolicyPackToItem,
  mapPolicyPackVersionToItem,
  mapPolicyRuleToItem,
  mapPolicyDecisionToItem,
  mapPolicyProofToItem,
  mapPolicyEventToItem,
} from '../../integrations/policy-pack-export-adapter.js';
import { createExportRuntimeContext } from '../../domain/export-runtime-context.js';
import type { PolicyPack } from '../../../domain-policy-pack-runtime/domain/policy-pack.js';
import type { PolicyPackVersion } from '../../../domain-policy-pack-runtime/domain/policy-pack-version.js';
import type { PolicyPackRule } from '../../../domain-policy-pack-runtime/domain/policy-pack-rule.js';
import type { PolicyPackDecision } from '../../../domain-policy-pack-runtime/domain/policy-pack-decision.js';
import type { PolicyPackProof } from '../../../domain-policy-pack-runtime/domain/policy-pack-proof.js';
import type { PolicyPackEvent } from '../../../domain-policy-pack-runtime/domain/policy-pack-event.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makePack(overrides: Partial<PolicyPack> = {}): PolicyPack {
  return {
    id: 'policy-pack-1',
    name: 'Payments Policy Pack',
    description: 'Governs high-risk payment approvals.',
    kind: 'domain',
    domain: 'payments',
    status: 'active',
    currentVersionId: 'policy-pack-version-1',
    versions: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeVersion(overrides: Partial<PolicyPackVersion> = {}): PolicyPackVersion {
  return {
    id: 'policy-pack-version-1',
    policyPackId: 'policy-pack-1',
    version: '1.0.0',
    status: 'active',
    scope: {},
    rules: [],
    sources: [],
    effectiveFrom: NOW,
    demoOnly: false,
    legalCompleteness: 'customer_provided_policy',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRule(overrides: Partial<PolicyPackRule> = {}): PolicyPackRule {
  return {
    id: 'policy-rule-1',
    policyPackVersionId: 'policy-pack-version-1',
    name: 'High risk payment requires approval',
    description: 'Requires human approval for payments above threshold.',
    status: 'active',
    priority: 1,
    condition: { type: 'predicate', field: 'riskLevel', operator: 'equals', value: 'high' },
    effect: { type: 'require_approval', reasonCode: 'HIGH_RISK_PAYMENT', reason: 'Payment risk level requires approval.' },
    obligations: [],
    evidenceRequirements: [],
    approvalRequirements: [],
    severity: 'error',
    sourceIds: [],
    ...overrides,
  };
}

function makeDecision(overrides: Partial<PolicyPackDecision> = {}): PolicyPackDecision {
  return {
    id: 'policy-decision-1',
    inputId: 'policy-input-1',
    type: 'denied',
    allowed: false,
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'send_payment',
    resourceScope: 'account:acct-1',
    riskLevel: 'high',
    effectiveRiskLevel: 'high',
    applicablePackVersionIds: ['policy-pack-version-1'],
    matchedRuleIds: ['policy-rule-1'],
    obligations: [],
    evidenceRequirements: [],
    approvalRequirements: [],
    reasonCode: 'POLICY_DENIED',
    reason: 'Prohibited by bank account change policy.',
    decidedAt: NOW,
    ...overrides,
  };
}

function makeProof(overrides: Partial<PolicyPackProof> = {}): PolicyPackProof {
  return {
    id: 'policy-proof-1',
    evaluationId: 'evaluation-1',
    decisionId: 'policy-decision-1',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'send_payment',
    resourceScope: 'account:acct-1',
    policyPackVersionIds: ['policy-pack-version-1'],
    matchedRuleIds: ['policy-rule-1'],
    inputHash: 'input-hash-1',
    ruleResultsHash: 'rule-results-hash-1',
    decisionHash: 'decision-hash-1',
    proofHash: 'proof-hash-1',
    createdAt: NOW,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<PolicyPackEvent> = {}): PolicyPackEvent {
  return {
    id: 'policy-event-1',
    type: 'policy_decision_created',
    timestamp: NOW,
    payload: {},
    eventHash: 'event-hash-1',
    ...overrides,
  };
}

describe('policy-pack-export-adapter', () => {
  it('1. mapPolicyPackToItem maps a PolicyPack to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const pack = makePack();
    const item = mapPolicyPackToItem(ctx, pack);

    assert.equal(item.type, 'policy_pack');
    assert.equal(item.sourceModule, 'domain_policy_pack_runtime');
    assert.equal(item.sourceId, pack.id);
    assert.equal(item.payload.name, pack.name);
  });

  it('2. mapPolicyPackVersionToItem preserves demoOnly=true and legalCompleteness="not_legal_advice" verbatim, never upgrading them', () => {
    const ctx = createExportRuntimeContext(NOW);
    const version = makeVersion({ demoOnly: true, legalCompleteness: 'not_legal_advice' });
    const item = mapPolicyPackVersionToItem(ctx, version);

    assert.equal(item.type, 'policy_pack_version');
    assert.equal(item.sourceModule, 'domain_policy_pack_runtime');
    assert.equal(item.sourceId, version.id);
    assert.equal(item.payload.demoOnly, true);
    assert.equal(item.payload.legalCompleteness, 'not_legal_advice');
  });

  it('3. mapPolicyRuleToItem maps a PolicyPackRule to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const rule = makeRule();
    const item = mapPolicyRuleToItem(ctx, rule);

    assert.equal(item.type, 'policy_rule');
    assert.equal(item.sourceModule, 'domain_policy_pack_runtime');
    assert.equal(item.sourceId, rule.id);
    assert.equal(item.payload.name, rule.name);
  });

  it('4. mapPolicyDecisionToItem preserves type="denied" and reasonCode verbatim, never re-evaluating policy rules to "allowed"', () => {
    const ctx = createExportRuntimeContext(NOW);
    const decision = makeDecision({ type: 'denied', allowed: false, reasonCode: 'BANK_ACCOUNT_CHANGE_DENIED' });
    const item = mapPolicyDecisionToItem(ctx, decision);

    assert.equal(item.type, 'policy_decision');
    assert.equal(item.sourceModule, 'domain_policy_pack_runtime');
    assert.equal(item.sourceId, decision.id);
    assert.equal(item.payload.type, 'denied');
    assert.equal(item.payload.reasonCode, 'BANK_ACCOUNT_CHANGE_DENIED');
  });

  it('5. mapPolicyProofToItem preserves matchedRuleIds verbatim', () => {
    const ctx = createExportRuntimeContext(NOW);
    const proof = makeProof({ matchedRuleIds: ['policy-rule-1', 'policy-rule-2'] });
    const item = mapPolicyProofToItem(ctx, proof);

    assert.equal(item.type, 'policy_proof');
    assert.equal(item.sourceModule, 'domain_policy_pack_runtime');
    assert.equal(item.sourceId, proof.id);
    assert.deepEqual(item.payload.matchedRuleIds, ['policy-rule-1', 'policy-rule-2']);
  });

  it('6. mapPolicyEventToItem maps a PolicyPackEvent to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const event = makeEvent();
    const item = mapPolicyEventToItem(ctx, event);

    assert.equal(item.type, 'policy_event');
    assert.equal(item.sourceModule, 'domain_policy_pack_runtime');
    assert.equal(item.sourceId, event.id);
    assert.equal(item.payload.type, event.type);
  });
});
