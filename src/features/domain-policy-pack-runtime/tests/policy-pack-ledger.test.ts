import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPolicyPackRuntimeContext } from '../runtime/policy-pack-runtime-context.js';
import { PolicyPackStore } from '../services/policy-pack-store.js';
import { PolicyPackLedger } from '../services/policy-pack-ledger.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp() {
  const ctx = createPolicyPackRuntimeContext(NOW);
  const store = new PolicyPackStore();
  return { ledger: new PolicyPackLedger(ctx, store), store };
}

describe('PolicyPackLedger', () => {
  it('1. records policy_pack_registered', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'policy_pack_registered', policyPackId: 'pack-1', payload: {} });
    assert.equal(event.type, 'policy_pack_registered');
  });

  it('2. records policy_pack_version_activated', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'policy_pack_version_activated', policyPackVersionId: 'pack-1-v1', payload: {} });
    assert.equal(event.type, 'policy_pack_version_activated');
  });

  it('3. records policy_evaluation_started', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'policy_evaluation_started', evaluationId: 'evaluation-1', payload: {} });
    assert.equal(event.type, 'policy_evaluation_started');
  });

  it('4. records policy_rule_matched', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'policy_rule_matched', policyPackVersionId: 'pack-1-v1', payload: { ruleId: 'rule-1' } });
    assert.equal(event.type, 'policy_rule_matched');
  });

  it('5. records policy_decision_created', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'policy_decision_created', decisionId: 'decision-1', payload: {} });
    assert.equal(event.type, 'policy_decision_created');
  });

  it('6. records policy_proof_created', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'policy_proof_created', proofId: 'proof-1', payload: {} });
    assert.equal(event.type, 'policy_proof_created');
  });

  it('7. deterministic event hash', () => {
    const a = setUp().ledger.recordEvent({ type: 'policy_pack_registered', policyPackId: 'pack-1', payload: { name: 'x' } });
    const b = setUp().ledger.recordEvent({ type: 'policy_pack_registered', policyPackId: 'pack-1', payload: { name: 'x' } });
    assert.equal(a.eventHash, b.eventHash);
  });

  it('8. maintains previousHash chain', () => {
    const { ledger } = setUp();
    const first = ledger.recordEvent({ type: 'policy_pack_registered', policyPackId: 'pack-1', payload: {} });
    const second = ledger.recordEvent({ type: 'policy_pack_version_activated', policyPackVersionId: 'pack-1-v1', payload: {} });
    assert.equal(first.previousHash, undefined);
    assert.equal(second.previousHash, first.eventHash);
  });

  it('9. queries by evaluation', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'policy_evaluation_started', evaluationId: 'evaluation-1', payload: {} });
    ledger.recordEvent({ type: 'policy_evaluation_started', evaluationId: 'evaluation-2', payload: {} });
    assert.equal(ledger.getTrailByEvaluation('evaluation-1').length, 1);
  });

  it('10. queries by decision', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'policy_decision_created', decisionId: 'decision-1', payload: {} });
    assert.equal(ledger.getTrailByDecision('decision-1').length, 1);
  });

  it('11. queries by proof', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'policy_proof_created', proofId: 'proof-1', payload: {} });
    assert.equal(ledger.getTrailByProof('proof-1').length, 1);
  });

  it('12. queries by trustDomain', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'policy_evaluation_started', trustDomainId: 'trust-domain-1', payload: {} });
    ledger.recordEvent({ type: 'policy_evaluation_started', trustDomainId: 'trust-domain-2', payload: {} });
    assert.equal(ledger.getTrailByTrustDomain('trust-domain-1').length, 1);
  });
});
