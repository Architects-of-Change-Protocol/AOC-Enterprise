import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture } from '../../fixtures/evidence-demo.fixture.js';

const COMPLIANCE_APPROVAL_DECISION_ID = 'approval-decision-data-export-compliance-001';

/**
 * Story: a sensitive data export requires data classification evidence
 * before compliance can approve it.
 */
describe('Scenario: data classification evidence supports export review', () => {
  it('registers data classification evidence, satisfies the requirement, and lets compliance approval cite it, with a proof binding it all together', () => {
    const { runtime, dataClassificationSource, dataClassificationEvidence, dataClassificationRequirement } = buildEvidenceDemoFixture();

    assert.equal(runtime.sourceDocuments.get(dataClassificationSource.id)?.status, 'active');
    assert.equal(runtime.evidenceArtifacts.get(dataClassificationEvidence.id)?.status, 'accepted');
    assert.equal(dataClassificationRequirement.status, 'open');

    const satisfaction = runtime.satisfyEvidenceRequirement({
      requirementId: dataClassificationRequirement.id,
      evidenceArtifactIds: [dataClassificationEvidence.id],
      reasonCode: 'DATA_CLASSIFICATION_ATTACHED',
      reason: 'Data classification record DC-4001 attached and accepted.',
    });
    assert.equal(satisfaction.status, 'satisfied');
    assert.equal(runtime.requirements.get(dataClassificationRequirement.id)?.status, 'satisfied');

    const citation = runtime.createCitation({
      evidenceArtifactId: dataClassificationEvidence.id,
      sourceDocumentId: dataClassificationSource.id,
      targetType: 'approval_decision',
      targetId: COMPLIANCE_APPROVAL_DECISION_ID,
      reasonCode: 'DATA_CLASSIFICATION_CITED',
      reason: 'Data classification evidence cited in support of the compliance export approval.',
    });
    assert.equal(citation.targetType, 'approval_decision');

    const proof = runtime.createEvidenceProof({
      trustDomainId: runtime.requirements.get(dataClassificationRequirement.id)!.trustDomainId,
      targetType: 'approval_decision',
      targetId: COMPLIANCE_APPROVAL_DECISION_ID,
      evidenceArtifactIds: [dataClassificationEvidence.id],
      requirementIds: [dataClassificationRequirement.id],
      satisfactionIds: [satisfaction.id],
      citationIds: [citation.id],
    });
    assert.ok(proof.proofHash.length > 0);
  });
});
