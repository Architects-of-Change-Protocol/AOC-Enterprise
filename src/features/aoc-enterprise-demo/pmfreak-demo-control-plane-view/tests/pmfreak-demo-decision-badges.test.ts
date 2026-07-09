import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPMFreakDemoDecisionBadge } from '../pmfreak-demo-decision-badges.js';

describe('createPMFreakDemoDecisionBadge', () => {
  it('1. creates a success badge for allow', () => {
    const badge = createPMFreakDemoDecisionBadge('allow');

    assert.equal(badge.severity, 'success');
    assert.ok(badge.label.length > 0);
    assert.ok(badge.description.length > 0);
  });

  it('2. creates a danger badge for deny', () => {
    const badge = createPMFreakDemoDecisionBadge('deny');

    assert.equal(badge.severity, 'danger');
    assert.ok(badge.label.length > 0);
    assert.ok(badge.description.length > 0);
  });

  it('3. creates a warning badge for require_evidence that mentions missing evidence, never invoice/acceptance claims', () => {
    const badge = createPMFreakDemoDecisionBadge('require_evidence');

    assert.equal(badge.severity, 'warning');
    assert.ok(badge.description.toLowerCase().includes('evidence'));
    assert.ok(badge.description.toLowerCase().includes('missing'));
    assert.ok(!badge.description.toLowerCase().includes('invoice'));
    assert.ok(!badge.description.toLowerCase().includes('customer acceptance'));
  });

  it('4. creates a warning badge for require_billing_review that mentions review, never a legal-block claim', () => {
    const badge = createPMFreakDemoDecisionBadge('require_billing_review');

    assert.equal(badge.severity, 'warning');
    assert.ok(badge.description.toLowerCase().includes('review'));
    assert.ok(!badge.description.toLowerCase().includes('legally'));
    assert.ok(!badge.description.toLowerCase().includes('legal block'));
  });

  it('every decision maps to a safe, non-empty badge', () => {
    const decisions = [
      'allow',
      'hold',
      'deny',
      'require_evidence',
      'require_pm_approval',
      'require_customer_validation',
      'require_contract_review',
      'require_billing_review',
      'require_legal_review',
      'require_security_review',
      'require_executive_approval',
    ] as const;

    for (const decision of decisions) {
      const badge = createPMFreakDemoDecisionBadge(decision);
      assert.equal(badge.decision, decision);
      assert.ok(['success', 'info', 'warning', 'danger'].includes(badge.severity));
      assert.ok(badge.label.length > 0);
      assert.ok(badge.description.length > 0);
    }
  });
});
