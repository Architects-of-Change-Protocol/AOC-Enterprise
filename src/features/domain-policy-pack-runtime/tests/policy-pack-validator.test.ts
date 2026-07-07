import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyPackRule } from '../domain/policy-pack-rule.js';
import type { PolicyPackVersion } from '../domain/policy-pack-version.js';
import { PolicyPackValidationError } from '../runtime/policy-pack-runtime-errors.js';
import { PolicyPackValidator } from '../services/policy-pack-validator.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildRule(overrides: Partial<PolicyPackRule> = {}): PolicyPackRule {
  return {
    id: 'rule-1',
    policyPackVersionId: 'version-1',
    name: 'Test rule',
    description: 'A test rule.',
    status: 'active',
    priority: 100,
    condition: { type: 'predicate', field: 'action', operator: 'equals', value: 'do_thing' },
    effect: { type: 'allow', reasonCode: 'TEST_ALLOW', reason: 'Allowed for test.' },
    obligations: [],
    evidenceRequirements: [],
    approvalRequirements: [],
    severity: 'info',
    sourceIds: [],
    ...overrides,
  };
}

function buildVersion(overrides: Partial<PolicyPackVersion> = {}): PolicyPackVersion {
  return {
    id: 'version-1',
    policyPackId: 'pack-1',
    version: '1.0.0',
    status: 'draft',
    scope: {},
    rules: [buildRule()],
    sources: [],
    effectiveFrom: NOW,
    demoOnly: true,
    legalCompleteness: 'not_legal_advice',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('PolicyPackValidator', () => {
  it('1. validates well-formed pack', () => {
    const validator = new PolicyPackValidator();
    const result = validator.validateVersion(buildVersion());
    assert.equal(result.valid, true);
    assert.deepEqual(result.issues, []);
  });

  it('2. rejects pack without active/current version', () => {
    const validator = new PolicyPackValidator();
    const pack: Parameters<PolicyPackValidator['validatePack']>[0] = {
      id: 'pack-1',
      name: 'Test',
      description: 'Test',
      kind: 'demo' as const,
      domain: 'payments' as const,
      status: 'active' as const,
      currentVersionId: 'version-1',
      versions: [buildVersion({ status: 'draft' })],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const result = validator.validatePack(pack);
    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.code, 'NO_ACTIVE_CURRENT_VERSION');
  });

  it('3. rejects active version without rules', () => {
    const validator = new PolicyPackValidator();
    assert.throws(() => validator.validateActivatable(buildVersion({ rules: [] })));
  });

  it('4. rejects duplicate rule IDs', () => {
    const validator = new PolicyPackValidator();
    const version = buildVersion({ rules: [buildRule(), buildRule()] });
    assert.throws(() => validator.validateVersion(version));
  });

  it('5. rejects missing source references', () => {
    const validator = new PolicyPackValidator();
    const version = buildVersion({ rules: [buildRule({ sourceIds: ['missing-source'] })] });
    assert.throws(() => validator.validateVersion(version));
  });

  it('6. rejects invalid condition', () => {
    const validator = new PolicyPackValidator();
    const version = buildVersion({
      rules: [buildRule({ condition: { type: 'group', operator: 'all', conditions: [] } })],
    });
    assert.throws(() => validator.validateVersion(version));
  });

  it('7. rejects invalid effect', () => {
    const validator = new PolicyPackValidator();
    const version = buildVersion({
      rules: [buildRule({ effect: { type: 'deny', reasonCode: '', reason: '' } })],
    });
    assert.throws(() => validator.validateVersion(version));
  });

  it('8. requires reasonCode for deny/approval/evidence effects', () => {
    const validator = new PolicyPackValidator();
    const version = buildVersion({
      rules: [buildRule({ effect: { type: 'require_evidence', reasonCode: '', reason: 'missing evidence' } })],
    });
    assert.throws(() => validator.validateVersion(version));
    let threw = false;
    try {
      validator.validateVersion(version);
    } catch (error) {
      threw = true;
      assert.ok(error instanceof PolicyPackValidationError);
      assert.ok((error as Error).message.includes('MISSING_REASON_CODE'));
    }
    assert.equal(threw, true);
  });

  it('9. validates demoOnly/legalCompleteness metadata', () => {
    const validator = new PolicyPackValidator();
    const version = buildVersion({ demoOnly: true, legalCompleteness: 'verified_by_counsel' });
    assert.throws(() => validator.validateVersion(version));
  });
});
