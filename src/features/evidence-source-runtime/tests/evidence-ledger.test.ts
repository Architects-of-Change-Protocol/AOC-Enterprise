import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceStore } from '../services/evidence-store.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { SourceDocumentRegistry } from '../services/source-document-registry.js';
import { EvidenceArtifactRegistry } from '../services/evidence-artifact-registry.js';
import { EvidenceRequirementService } from '../services/evidence-requirement-service.js';
import { CitationService } from '../services/citation-service.js';
import { EvidenceProofService } from '../services/evidence-proof-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const store = new EvidenceStore();
  const ledger = new EvidenceLedger(ctx, store);
  const sourceDocuments = new SourceDocumentRegistry(ctx, store, ledger);
  const artifacts = new EvidenceArtifactRegistry(ctx, store, ledger);
  const requirements = new EvidenceRequirementService(ctx, store, ledger);
  const citations = new CitationService(ctx, store, ledger);
  const proofs = new EvidenceProofService(ctx, store, ledger);
  return { ctx, store, ledger, sourceDocuments, artifacts, requirements, citations, proofs };
}

describe('EvidenceLedger', () => {
  it('1. records source_document_registered', () => {
    const { sourceDocuments, ledger } = setup();
    sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    assert.ok(ledger.getEvents().some((e) => e.type === 'source_document_registered'));
  });

  it('2. records evidence_artifact_submitted', () => {
    const { artifacts, ledger } = setup();
    artifacts.submit({ id: 'ea-1', type: 'invoice', title: 'Invoice evidence', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    assert.ok(ledger.getEvents().some((e) => e.type === 'evidence_artifact_submitted'));
  });

  it('3. records evidence_requirement_created', () => {
    const { requirements, ledger } = setup();
    requirements.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd', required: true });
    assert.ok(ledger.getEvents().some((e) => e.type === 'evidence_requirement_created'));
  });

  it('4. records evidence_requirement_satisfied', () => {
    const { requirements, ledger } = setup();
    const requirement = requirements.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd', required: true });
    requirements.markSatisfied(requirement.id);
    assert.ok(ledger.getEvents().some((e) => e.type === 'evidence_requirement_satisfied'));
  });

  it('5. records citation_created', () => {
    const { sourceDocuments, citations, ledger } = setup();
    sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    citations.createCitation({ sourceDocumentId: 'sd-1', targetType: 'policy_decision', targetId: 'p1', reasonCode: 'R', reason: 'reason' });
    assert.ok(ledger.getEvents().some((e) => e.type === 'citation_created'));
  });

  it('6. records evidence_proof_created', () => {
    const { proofs, ledger } = setup();
    proofs.createProof({ trustDomainId: 'd' });
    assert.ok(ledger.getEvents().some((e) => e.type === 'evidence_proof_created'));
  });

  it('7. maintains previousHash chain', () => {
    const { sourceDocuments, artifacts, ledger } = setup();
    sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    artifacts.submit({ id: 'ea-1', type: 'invoice', title: 'Invoice evidence', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    const events = ledger.getEvents();
    assert.equal(events[0]?.previousHash, undefined);
    assert.equal(events[1]?.previousHash, events[0]?.eventHash);
  });

  it('8. deterministic eventHash', () => {
    const a = setup();
    a.sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    const b = setup();
    b.sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    assert.equal(a.ledger.getEvents()[0]?.eventHash, b.ledger.getEvents()[0]?.eventHash);
  });

  it('9. queries by target', () => {
    const { citations, sourceDocuments, ledger } = setup();
    sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    citations.createCitation({ sourceDocumentId: 'sd-1', targetType: 'policy_decision', targetId: 'p1', reasonCode: 'R', reason: 'reason' });
    const trail = ledger.getTrailByTarget('policy_decision', 'p1');
    assert.equal(trail.length, 1);
  });

  it('10. queries by trustDomain', () => {
    const { artifacts, ledger } = setup();
    artifacts.submit({ id: 'ea-1', type: 'invoice', title: 'Invoice evidence', trustDomainId: 'domain-a', submittedByActorId: 'actor-1' });
    artifacts.submit({ id: 'ea-2', type: 'invoice', title: 'Invoice evidence', trustDomainId: 'domain-b', submittedByActorId: 'actor-1' });
    assert.equal(ledger.getTrailByTrustDomain('domain-a').length, 1);
  });

  it('11. verifies event chain', () => {
    const { sourceDocuments, artifacts, requirements, ledger } = setup();
    sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    artifacts.submit({ id: 'ea-1', type: 'invoice', title: 'Invoice evidence', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    requirements.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd', required: true });
    assert.equal(ledger.verifyChain(), true);
  });
});
