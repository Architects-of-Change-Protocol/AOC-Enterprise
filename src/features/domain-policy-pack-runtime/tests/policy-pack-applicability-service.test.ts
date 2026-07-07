import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyPackVersion } from '../domain/policy-pack-version.js';
import type { PolicyPackScope } from '../domain/policy-pack-scope.js';
import type { PolicyEvaluationInput } from '../domain/policy-pack-evaluation.js';
import { PolicyPackStore } from '../services/policy-pack-store.js';
import { PolicyPackApplicabilityService } from '../services/policy-pack-applicability-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildVersion(scope: PolicyPackScope, overrides: Partial<PolicyPackVersion> = {}): PolicyPackVersion {
  return {
    id: overrides.id ?? 'version-1',
    policyPackId: 'pack-1',
    version: '1.0.0',
    status: 'active',
    scope,
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

function buildInput(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  return {
    id: 'input-1',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'approve_payment',
    resourceScope: 'scope-1',
    riskLevel: 'low',
    requestedAt: NOW,
    ...overrides,
  };
}

function setUp(version: PolicyPackVersion) {
  const store = new PolicyPackStore();
  store.saveVersion(version);
  return new PolicyPackApplicabilityService(store);
}

describe('PolicyPackApplicabilityService', () => {
  it('1. applies by trustDomain', () => {
    const service = setUp(buildVersion({ trustDomainIds: ['trust-domain-1'] }));
    const [result] = service.resolveApplicability(buildInput());
    assert.equal(result!.applicable, true);
  });

  it('2. applies by domain', () => {
    const service = setUp(buildVersion({ domains: ['payments'] }));
    const [result] = service.resolveApplicability(buildInput({ domain: 'payments' }));
    assert.equal(result!.applicable, true);
  });

  it('3. applies by jurisdiction', () => {
    const service = setUp(buildVersion({ jurisdictions: ['demo-jurisdiction-a'] }));
    const [result] = service.resolveApplicability(buildInput({ jurisdiction: 'demo-jurisdiction-a' }));
    assert.equal(result!.applicable, true);
  });

  it('4. applies by country', () => {
    const service = setUp(buildVersion({ countries: ['CR'] }));
    const [result] = service.resolveApplicability(buildInput({ country: 'CR' }));
    assert.equal(result!.applicable, true);
  });

  it('5. applies by action', () => {
    const service = setUp(buildVersion({ actions: ['approve_payment'] }));
    const [result] = service.resolveApplicability(buildInput());
    assert.equal(result!.applicable, true);
  });

  it('6. applies by capability', () => {
    const service = setUp(buildVersion({ capabilities: ['finance_approval'] }));
    const [result] = service.resolveApplicability(buildInput({ capability: 'finance_approval' }));
    assert.equal(result!.applicable, true);
  });

  it('7. applies by resourceScope', () => {
    const service = setUp(buildVersion({ resourceScopes: ['scope-1'] }));
    const [result] = service.resolveApplicability(buildInput());
    assert.equal(result!.applicable, true);
  });

  it('8. applies by dataDomain', () => {
    const service = setUp(buildVersion({ dataDomains: ['pii'] }));
    const [result] = service.resolveApplicability(buildInput({ dataDomains: ['pii'] }));
    assert.equal(result!.applicable, true);
  });

  it('9. filters expired version', () => {
    const service = setUp(buildVersion({}, { effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveUntil: '2021-01-01T00:00:00.000Z' }));
    const [result] = service.resolveApplicability(buildInput());
    assert.equal(result!.applicable, false);
    assert.equal(result!.type, 'expired');
  });

  it('10. filters revoked version', () => {
    const service = setUp(buildVersion({}, { status: 'revoked' }));
    const [result] = service.resolveApplicability(buildInput());
    assert.equal(result!.applicable, false);
    assert.equal(result!.type, 'revoked');
  });

  it('11. returns not_applicable for scope mismatch', () => {
    const service = setUp(buildVersion({ domains: ['procurement'] }));
    const [result] = service.resolveApplicability(buildInput({ domain: 'payments' }));
    assert.equal(result!.applicable, false);
    assert.equal(result!.type, 'scope_mismatch');
  });

  it('12. deterministic ordering', () => {
    const store = new PolicyPackStore();
    store.saveVersion(buildVersion({}, { id: 'version-b' }));
    store.saveVersion(buildVersion({}, { id: 'version-a' }));
    const service = new PolicyPackApplicabilityService(store);
    const results = service.resolveApplicability(buildInput());
    assert.deepEqual(
      results.map((result) => result.policyPackVersionId),
      ['version-a', 'version-b'],
    );
  });

  it('reports inactive (draft) versions distinctly', () => {
    const service = setUp(buildVersion({}, { status: 'draft' }));
    const [result] = service.resolveApplicability(buildInput());
    assert.equal(result!.applicable, false);
    assert.equal(result!.type, 'inactive');
  });
});
