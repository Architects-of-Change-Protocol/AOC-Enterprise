import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceStore } from '../services/evidence-store.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { SourceDocumentRegistry } from '../services/source-document-registry.js';
import { EvidenceArtifactRegistry } from '../services/evidence-artifact-registry.js';
import { CitationService } from '../services/citation-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const store = new EvidenceStore();
  const ledger = new EvidenceLedger(ctx, store);
  const sourceDocuments = new SourceDocumentRegistry(ctx, store, ledger);
  const artifacts = new EvidenceArtifactRegistry(ctx, store, ledger);
  const citations = new CitationService(ctx, store, ledger);
  return { ctx, store, ledger, sourceDocuments, artifacts, citations };
}

function registerSourceDocument(sourceDocuments: ReturnType<typeof setup>['sourceDocuments'], id = 'source-document-1') {
  return sourceDocuments.register({ id, type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
}

describe('CitationService', () => {
  it('1. creates citation anchor', () => {
    const { sourceDocuments, citations } = setup();
    registerSourceDocument(sourceDocuments);
    const anchor = citations.createAnchor({ id: 'citation-anchor-1', sourceDocumentId: 'source-document-1', type: 'section', label: 'Section 2' });
    assert.equal(anchor.sourceDocumentId, 'source-document-1');
  });

  it('2. creates citation from source document to policy decision', () => {
    const { sourceDocuments, citations } = setup();
    registerSourceDocument(sourceDocuments);
    const citation = citations.createCitation({
      sourceDocumentId: 'source-document-1',
      targetType: 'policy_decision',
      targetId: 'policy-decision-1',
      reasonCode: 'CITED',
      reason: 'supports invoice requirement',
    });
    assert.equal(citation.targetType, 'policy_decision');
    assert.equal(citation.sourceDocumentId, 'source-document-1');
  });

  it('3. creates citation from evidence artifact to approval decision', () => {
    const { artifacts, citations } = setup();
    const artifact = artifacts.submit({ id: 'evidence-artifact-1', type: 'approval_memo', title: 'Memo', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    const citation = citations.createCitation({
      evidenceArtifactId: artifact.id,
      targetType: 'approval_decision',
      targetId: 'approval-decision-1',
      reasonCode: 'CITED',
      reason: 'supports approval decision',
    });
    assert.equal(citation.evidenceArtifactId, artifact.id);
  });

  it('4. creates citation from evidence artifact to enforcement proof', () => {
    const { artifacts, citations } = setup();
    const artifact = artifacts.submit({ id: 'evidence-artifact-2', type: 'event_record', title: 'Event record', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    const citation = citations.createCitation({
      evidenceArtifactId: artifact.id,
      targetType: 'enforcement_proof',
      targetId: 'enforcement-proof-1',
      reasonCode: 'CITED',
      reason: 'supports enforcement proof',
    });
    assert.equal(citation.targetType, 'enforcement_proof');
  });

  it('5. creates deterministic citation text', () => {
    const { sourceDocuments: sdA, citations: citationsA } = setup();
    registerSourceDocument(sdA);
    const a = citationsA.createCitation({ sourceDocumentId: 'source-document-1', targetType: 'policy_decision', targetId: 'p1', reasonCode: 'R', reason: 'same reason' });

    const { sourceDocuments: sdB, citations: citationsB } = setup();
    registerSourceDocument(sdB);
    const b = citationsB.createCitation({ sourceDocumentId: 'source-document-1', targetType: 'policy_decision', targetId: 'p1', reasonCode: 'R', reason: 'same reason' });

    assert.equal(a.citationText, b.citationText);
    assert.ok(a.citationText.includes('source document source-document-1'));
    assert.ok(a.citationText.includes('policy_decision p1'));
  });

  it('6. records event', () => {
    const { sourceDocuments, citations, ledger } = setup();
    registerSourceDocument(sourceDocuments);
    citations.createCitation({ sourceDocumentId: 'source-document-1', targetType: 'policy_decision', targetId: 'p1', reasonCode: 'R', reason: 'reason' });
    const events = ledger.getEvents().filter((e) => e.type === 'citation_created');
    assert.equal(events.length, 1);
  });

  it('7. does not require binary parsing (anchors are caller-declared)', () => {
    const { sourceDocuments, citations } = setup();
    registerSourceDocument(sourceDocuments);
    const anchor = citations.createAnchor({ id: 'citation-anchor-2', sourceDocumentId: 'source-document-1', type: 'manual', label: 'as described by the submitter' });
    assert.equal(anchor.type, 'manual');
    assert.equal(anchor.locator, undefined);
  });
});
