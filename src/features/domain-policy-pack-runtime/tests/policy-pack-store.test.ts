import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyPack } from '../domain/policy-pack.js';
import type { PolicyPackVersion } from '../domain/policy-pack-version.js';
import type { PolicyPackDecision } from '../domain/policy-pack-decision.js';
import type { PolicyPackProof } from '../domain/policy-pack-proof.js';
import type { PolicyPackEvent } from '../domain/policy-pack-event.js';
import { PolicyPackStore } from '../services/policy-pack-store.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildPack(overrides: Partial<PolicyPack> = {}): PolicyPack {
  return {
    id: 'pack-1',
    name: 'Test Pack',
    description: 'A test pack.',
    kind: 'demo',
    domain: 'payments',
    status: 'draft',
    currentVersionId: '',
    versions: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildVersion(overrides: Partial<PolicyPackVersion> = {}): PolicyPackVersion {
  return {
    id: 'pack-1-v1',
    policyPackId: 'pack-1',
    version: '1.0.0',
    status: 'draft',
    scope: {},
    rules: [],
    sources: [],
    effectiveFrom: NOW,
    demoOnly: true,
    legalCompleteness: 'not_legal_advice',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildDecision(overrides: Partial<PolicyPackDecision> = {}): PolicyPackDecision {
  return {
    id: 'decision-1',
    inputId: 'input-1',
    type: 'allowed',
    allowed: true,
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'do_thing',
    resourceScope: 'scope-1',
    riskLevel: 'low',
    effectiveRiskLevel: 'low',
    applicablePackVersionIds: [],
    matchedRuleIds: [],
    obligations: [],
    evidenceRequirements: [],
    approvalRequirements: [],
    reasonCode: 'OK',
    reason: 'ok',
    decidedAt: NOW,
    ...overrides,
  };
}

function buildProof(overrides: Partial<PolicyPackProof> = {}): PolicyPackProof {
  return {
    id: 'proof-1',
    evaluationId: 'evaluation-1',
    decisionId: 'decision-1',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'do_thing',
    resourceScope: 'scope-1',
    policyPackVersionIds: [],
    matchedRuleIds: [],
    inputHash: 'input-hash',
    ruleResultsHash: 'rule-results-hash',
    decisionHash: 'decision-hash',
    proofHash: 'proof-hash',
    createdAt: NOW,
    ...overrides,
  };
}

function buildEvent(overrides: Partial<PolicyPackEvent> = {}): PolicyPackEvent {
  return {
    id: 'event-1',
    type: 'policy_pack_registered',
    timestamp: NOW,
    payload: {},
    eventHash: 'event-hash',
    ...overrides,
  };
}

describe('PolicyPackStore', () => {
  it('1. stores and retrieves PolicyPack', () => {
    const store = new PolicyPackStore();
    store.savePack(buildPack());
    assert.deepEqual(store.getPack('pack-1'), buildPack());
  });

  it('2. stores and retrieves PolicyPackVersion', () => {
    const store = new PolicyPackStore();
    store.saveVersion(buildVersion());
    assert.deepEqual(store.getVersion('pack-1-v1'), buildVersion());
  });

  it('3. stores and retrieves PolicyPackDecision', () => {
    const store = new PolicyPackStore();
    store.saveDecision(buildDecision());
    assert.deepEqual(store.getDecision('decision-1'), buildDecision());
    assert.deepEqual(store.getDecisionByInput('input-1'), buildDecision());
  });

  it('4. stores and retrieves PolicyPackProof', () => {
    const store = new PolicyPackStore();
    store.saveProof(buildProof());
    assert.deepEqual(store.getProof('proof-1'), buildProof());
    assert.deepEqual(store.getProofByDecision('decision-1'), buildProof());
    assert.deepEqual(store.getProofByEvaluation('evaluation-1'), buildProof());
    assert.deepEqual(store.getLatestProof(), buildProof());
  });

  it('5. stores and retrieves PolicyPackEvent', () => {
    const store = new PolicyPackStore();
    store.saveEvent(buildEvent());
    assert.deepEqual(store.getEvents(), [buildEvent()]);
    assert.deepEqual(store.getLatestEvent(), buildEvent());
  });

  it('6. lists active versions', () => {
    const store = new PolicyPackStore();
    store.saveVersion(buildVersion({ id: 'v-draft', status: 'draft' }));
    store.saveVersion(buildVersion({ id: 'v-active', status: 'active' }));
    const active = store.listActiveVersions();
    assert.equal(active.length, 1);
    assert.equal(active[0]!.id, 'v-active');
  });

  it('7. lists versions by domain', () => {
    const store = new PolicyPackStore();
    store.savePack(buildPack({ id: 'pack-payments', domain: 'payments' }));
    store.savePack(buildPack({ id: 'pack-procurement', domain: 'procurement' }));
    store.saveVersion(buildVersion({ id: 'v-payments', policyPackId: 'pack-payments', status: 'active' }));
    store.saveVersion(buildVersion({ id: 'v-procurement', policyPackId: 'pack-procurement', status: 'active' }));
    const paymentsVersions = store.listVersionsByDomain('payments');
    assert.equal(paymentsVersions.length, 1);
    assert.equal(paymentsVersions[0]!.id, 'v-payments');
  });

  it('8. lists versions by jurisdiction/country', () => {
    const store = new PolicyPackStore();
    store.saveVersion(buildVersion({ id: 'v-jur', status: 'active', scope: { jurisdictions: ['demo-jurisdiction-a'] } }));
    store.saveVersion(buildVersion({ id: 'v-country', status: 'active', scope: { countries: ['CR'] } }));
    assert.equal(store.listVersionsByJurisdiction('demo-jurisdiction-a').length, 1);
    assert.equal(store.listVersionsByCountry('CR').length, 1);
    assert.equal(store.listVersionsByJurisdiction('unknown').length, 0);
  });

  it('9. queries evaluations by actor/action/trustDomain', () => {
    const store = new PolicyPackStore();
    const evaluation = {
      id: 'evaluation-1',
      input: {
        id: 'input-1',
        trustDomainId: 'trust-domain-1',
        actorId: 'actor-1',
        action: 'do_thing',
        resourceScope: 'scope-1',
        riskLevel: 'low' as const,
        requestedAt: NOW,
      },
      decision: buildDecision(),
      applicabilityResults: [],
      ruleResults: [],
      events: [],
    };
    store.saveEvaluation(evaluation);
    assert.equal(store.listEvaluations({ actorId: 'actor-1' }).length, 1);
    assert.equal(store.listEvaluations({ action: 'do_thing' }).length, 1);
    assert.equal(store.listEvaluations({ trustDomainId: 'trust-domain-1' }).length, 1);
    assert.equal(store.listEvaluations({ actorId: 'someone-else' }).length, 0);
  });

  it('10. preserves deterministic ordering', () => {
    const store = new PolicyPackStore();
    store.savePack(buildPack({ id: 'pack-b' }));
    store.savePack(buildPack({ id: 'pack-a' }));
    const ids = store.listPacks().map((pack) => pack.id);
    assert.deepEqual(ids, ['pack-a', 'pack-b']);
  });

  it('11. updates pack status', () => {
    const store = new PolicyPackStore();
    store.savePack(buildPack());
    const updated = store.updatePackStatus('pack-1', 'active', '2026-01-02T00:00:00.000Z');
    assert.equal(updated?.status, 'active');
    assert.equal(updated?.updatedAt, '2026-01-02T00:00:00.000Z');
    assert.equal(store.updatePackStatus('missing', 'active', NOW), undefined);
  });

  it('12. updates version status', () => {
    const store = new PolicyPackStore();
    store.saveVersion(buildVersion());
    const updated = store.updateVersionStatus('pack-1-v1', 'active', '2026-01-02T00:00:00.000Z');
    assert.equal(updated?.status, 'active');
    assert.equal(store.updateVersionStatus('missing', 'active', NOW), undefined);
  });
});
