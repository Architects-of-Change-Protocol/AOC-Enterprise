import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApprovalEvidenceDemoFixture,
  APPROVAL_REQUEST_ID,
  APPROVER_ACTOR_ID,
} from '../fixtures/approval-evidence-demo.fixture.js';

const APPROVAL_DECISION_ID = 'approval-decision-datasys-payment-002';
const APPROVAL_PROOF_ID = 'approval-proof-datasys-payment-001';

describe('ApprovalEvidenceIntegration', () => {
  it('1. links evidence to approval_request', () => {
    const { runtime, integration, approvalMemoEvidence } = buildApprovalEvidenceDemoFixture();
    const links = integration.linkReviewedEvidence({
      approvalDecisionId: APPROVAL_DECISION_ID,
      approverActorId: APPROVER_ACTOR_ID,
      evidenceArtifactIds: [approvalMemoEvidence.id],
    });
    assert.equal(links.length, 1);
    const requirements = runtime.store.listRequirementsByApprovalRequest(APPROVAL_REQUEST_ID);
    assert.equal(requirements.length, 1);
  });

  it('2. links evidence to approval_decision', () => {
    const { integration, approvalMemoEvidence } = buildApprovalEvidenceDemoFixture();
    const [link] = integration.linkReviewedEvidence({
      approvalDecisionId: APPROVAL_DECISION_ID,
      approverActorId: APPROVER_ACTOR_ID,
      evidenceArtifactIds: [approvalMemoEvidence.id],
    });
    assert.equal(link?.targetType, 'approval_decision');
    assert.equal(link?.targetId, APPROVAL_DECISION_ID);
    assert.equal(link?.type, 'reviewed_for');
  });

  it('3. creates citation for approval_proof', () => {
    const { integration, approvalMemoEvidence, approvalMemoSource } = buildApprovalEvidenceDemoFixture();
    const citation = integration.createCitationForApprovalTarget({
      sourceDocumentId: approvalMemoSource.id,
      evidenceArtifactId: approvalMemoEvidence.id,
      targetType: 'approval_proof',
      targetId: APPROVAL_PROOF_ID,
      reasonCode: 'CITED',
      reason: 'approval memo cited for the approval proof',
      createdByActorId: APPROVER_ACTOR_ID,
    });
    assert.equal(citation.targetType, 'approval_proof');
  });

  it('4. creates evidence proof', () => {
    const { integration, approvalMemoEvidence } = buildApprovalEvidenceDemoFixture();
    const proof = integration.createProofForApprovalDecision({
      trustDomainId: 'trust-domain-datasys-agent-republic',
      approvalDecisionId: APPROVAL_DECISION_ID,
      evidenceArtifactIds: [approvalMemoEvidence.id],
    });
    assert.equal(proof.targetType, 'approval_decision');
    assert.equal(proof.targetId, APPROVAL_DECISION_ID);
  });

  it('5. does not fake approver review (linking evidence never itself records an EvidenceReview)', () => {
    const { runtime, integration, approvalMemoEvidence } = buildApprovalEvidenceDemoFixture();
    integration.linkReviewedEvidence({
      approvalDecisionId: APPROVAL_DECISION_ID,
      approverActorId: APPROVER_ACTOR_ID,
      evidenceArtifactIds: [approvalMemoEvidence.id],
    });
    assert.equal(runtime.reviews.listByArtifact(approvalMemoEvidence.id).length, 0);
  });
});
