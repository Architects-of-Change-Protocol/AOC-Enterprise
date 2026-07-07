import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture } from '../../fixtures/evidence-demo.fixture.js';

/**
 * Story: an evidence artifact references a source document that has since
 * expired.
 */
describe('Scenario: stale source document warning', () => {
  it('flags the source document as stale without itself claiming legal sufficiency either way', () => {
    const { runtime, staleInvoiceSource } = buildEvidenceDemoFixture();

    assert.equal(runtime.sourceDocuments.get(staleInvoiceSource.id)?.status, 'expired');

    const artifact = runtime.submitEvidenceArtifact({
      id: 'evidence-artifact-invoice-from-stale-source-001',
      type: 'invoice',
      title: 'Invoice evidence referencing an expired source document',
      sourceDocumentId: staleInvoiceSource.id,
      trustDomainId: 'trust-domain-datasys-agent-republic',
      submittedByActorId: 'actor-pmfreak-closure-agent',
    });
    runtime.evidenceArtifacts.accept(artifact.id, 'actor-victor-valverde');

    const requirement = runtime.createEvidenceRequirement({
      type: 'invoice',
      source: 'manual',
      trustDomainId: 'trust-domain-datasys-agent-republic',
      description: 'An invoice requirement satisfied by evidence from a now-expired source document.',
      required: true,
    });

    const satisfaction = runtime.satisfyEvidenceRequirement({
      requirementId: requirement.id,
      evidenceArtifactIds: [artifact.id],
      reasonCode: 'INVOICE_ATTACHED',
      reason: 'Invoice evidence attached; underlying source document is expired.',
    });
    assert.equal(satisfaction.status, 'satisfied');

    const validation = runtime.validateEvidenceForTarget({ requirementIds: [requirement.id] });
    assert.deepEqual(validation.staleSourceDocumentIds, [staleInvoiceSource.id]);
    // Staleness is a warning surfaced for human/policy judgment -- it never
    // by itself flips `valid`, and this runtime never claims the underlying
    // document is (or is not) legally sufficient.
    assert.equal(validation.valid, true);
    assert.equal(runtime.sourceDocuments.get(staleInvoiceSource.id)?.legalCompleteness, 'customer_provided');
  });
});
