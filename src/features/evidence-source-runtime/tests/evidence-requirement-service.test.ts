import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceStore } from '../services/evidence-store.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { EvidenceRequirementService } from '../services/evidence-requirement-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const store = new EvidenceStore();
  const ledger = new EvidenceLedger(ctx, store);
  const service = new EvidenceRequirementService(ctx, store, ledger);
  return { ctx, store, ledger, service };
}

describe('EvidenceRequirementService', () => {
  it('1. creates manual requirement', () => {
    const { service } = setup();
    const requirement = service.create({
      type: 'invoice',
      source: 'manual',
      trustDomainId: 'trust-domain-1',
      description: 'Attach invoice.',
      required: true,
    });
    assert.equal(requirement.source, 'manual');
    assert.equal(requirement.status, 'open');
  });

  it('2. creates requirement from policy pack requirement', () => {
    const { service } = setup();
    const requirement = service.fromPolicyPackRequirement({
      trustDomainId: 'trust-domain-1',
      policyDecisionId: 'policy-decision-1',
      policyPackVersionId: 'policy-pack-v1',
      requirement: { id: 'policy-req-1', type: 'purchase_order', description: 'Attach PO.', required: true, sourceRuleId: 'rule-1' },
    });
    assert.equal(requirement.source, 'policy_pack');
    assert.equal(requirement.sourceRequirementId, 'policy-req-1');
    assert.equal(requirement.sourceRuleId, 'rule-1');
    assert.equal(requirement.policyDecisionId, 'policy-decision-1');
    assert.equal(requirement.policyPackVersionId, 'policy-pack-v1');
  });

  it('3. creates requirement from approval requirement', () => {
    const { service } = setup();
    const requirement = service.fromApprovalRequirement({
      trustDomainId: 'trust-domain-1',
      approvalRequestId: 'approval-request-1',
      requirement: { id: 'approval-req-1', type: 'approval_memo', description: 'Attach memo.', required: true },
    });
    assert.equal(requirement.source, 'approval');
    assert.equal(requirement.approvalRequestId, 'approval-request-1');
  });

  it('4. creates requirement from recognition requirement', () => {
    const { service } = setup();
    const requirement = service.fromRecognitionRequirement({
      trustDomainId: 'trust-domain-1',
      recognitionDecisionId: 'recognition-decision-1',
      requirement: { id: 'recognition-req-1', type: 'identity_proof', description: 'Attach identity proof.', required: true },
    });
    assert.equal(requirement.source, 'recognition');
    assert.equal(requirement.recognitionDecisionId, 'recognition-decision-1');
  });

  it('5. creates requirement from enforcement evidence_required decision', () => {
    const { service } = setup();
    const requirement = service.fromEnforcementRequirement({
      trustDomainId: 'trust-domain-1',
      enforcementDecisionId: 'enforcement-decision-1',
      requirement: { id: 'enforcement-req-1', type: 'invoice', description: 'Attach invoice.', required: true },
    });
    assert.equal(requirement.source, 'action_enforcement');
    assert.equal(requirement.enforcementDecisionId, 'enforcement-decision-1');
  });

  it('6. marks satisfied', () => {
    const { service } = setup();
    const requirement = service.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd', required: true });
    const updated = service.markSatisfied(requirement.id);
    assert.equal(updated.status, 'satisfied');
    assert.equal(updated.satisfiedAt, NOW);
  });

  it('7. marks partially satisfied', () => {
    const { service } = setup();
    const requirement = service.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd', required: true });
    const updated = service.markPartiallySatisfied(requirement.id);
    assert.equal(updated.status, 'partially_satisfied');
  });

  it('8. marks rejected', () => {
    const { service } = setup();
    const requirement = service.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd', required: true });
    const updated = service.markRejected(requirement.id, 'BAD', 'evidence rejected');
    assert.equal(updated.status, 'rejected');
  });

  it('9. marks waived', () => {
    const { service } = setup();
    const requirement = service.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd', required: true });
    const updated = service.markWaived(requirement.id, 'WAIVED_BY_OPS', 'ops explicitly waived this requirement');
    assert.equal(updated.status, 'waived');
  });

  it('10. marks expired', () => {
    const { service } = setup();
    const requirement = service.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd', required: true });
    const updated = service.markExpired(requirement.id);
    assert.equal(updated.status, 'expired');
  });

  it('11. records events', () => {
    const { service, ledger } = setup();
    const requirement = service.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd', required: true });
    service.markSatisfied(requirement.id);
    assert.deepEqual(
      ledger.getEvents().map((e) => e.type),
      ['evidence_requirement_created', 'evidence_requirement_satisfied'],
    );
  });

  it('12. does not infer legal sufficiency', () => {
    const { service } = setup();
    const requirement = service.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd', required: true });
    // The requirement type never carries a legal-sufficiency field or conclusion -- only completeness state.
    assert.ok(!('legalCompleteness' in requirement));
    assert.ok(!('legallySufficient' in requirement));
  });
});
