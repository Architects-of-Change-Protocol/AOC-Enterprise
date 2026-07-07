import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceStore } from '../services/evidence-store.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { SourceDocumentRegistry } from '../services/source-document-registry.js';
import { EvidenceArtifactRegistry } from '../services/evidence-artifact-registry.js';
import { EvidenceRequirementService } from '../services/evidence-requirement-service.js';
import { EvidenceLinkService } from '../services/evidence-link-service.js';
import { EvidenceProofService } from '../services/evidence-proof-service.js';
import { EvidenceSatisfactionService } from '../services/evidence-satisfaction-service.js';
import { CitationService } from '../services/citation-service.js';
import { EvidenceExportService } from '../services/evidence-export-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const store = new EvidenceStore();
  const ledger = new EvidenceLedger(ctx, store);
  const sourceDocuments = new SourceDocumentRegistry(ctx, store, ledger);
  const artifacts = new EvidenceArtifactRegistry(ctx, store, ledger);
  const requirements = new EvidenceRequirementService(ctx, store, ledger);
  const links = new EvidenceLinkService(ctx, store, ledger);
  const proofs = new EvidenceProofService(ctx, store, ledger);
  const satisfactions = new EvidenceSatisfactionService(ctx, store, ledger, requirements, links, proofs);
  const citations = new CitationService(ctx, store, ledger);
  const exportService = new EvidenceExportService(ctx, store);
  return { ctx, store, ledger, sourceDocuments, artifacts, requirements, links, proofs, satisfactions, citations, exportService };
}

function buildWorld() {
  const world = setup();
  const sourceDocument = world.sourceDocuments.register({
    id: 'source-document-1',
    type: 'invoice',
    title: 'Invoice',
    authority: 'customer_provided',
    trustDomainId: 'trust-domain-1',
    demoOnly: true,
    legalCompleteness: 'customer_provided',
  });
  const artifact = world.artifacts.submit({ id: 'evidence-artifact-1', type: 'invoice', title: 'Invoice evidence', sourceDocumentId: sourceDocument.id, trustDomainId: 'trust-domain-1', submittedByActorId: 'actor-1' });
  world.artifacts.accept(artifact.id, 'actor-reviewer');
  const requirement = world.requirements.create({ type: 'invoice', source: 'manual', trustDomainId: 'trust-domain-1', description: 'Attach invoice.', required: true });
  const satisfaction = world.satisfactions.satisfy({ requirementId: requirement.id, evidenceArtifactIds: [artifact.id], reasonCode: 'OK', reason: 'attached' });
  const citation = world.citations.createCitation({ sourceDocumentId: sourceDocument.id, evidenceArtifactId: artifact.id, targetType: 'policy_decision', targetId: 'policy-decision-1', reasonCode: 'R', reason: 'cited' });
  const proof = world.proofs.createProof({
    trustDomainId: 'trust-domain-1',
    sourceDocumentIds: [sourceDocument.id],
    evidenceArtifactIds: [artifact.id],
    requirementIds: [requirement.id],
    satisfactionIds: [satisfaction.id],
    citationIds: [citation.id],
  });
  return { ...world, sourceDocument, artifact, requirement, satisfaction, citation, proof };
}

describe('EvidenceExportService', () => {
  it('1. exports JSON summary', () => {
    const world = buildWorld();
    const artifact = world.exportService.exportJsonSummary({ trustDomainId: 'trust-domain-1' });
    assert.equal(artifact.type, 'json_summary');
    JSON.parse(artifact.content);
  });

  it('2. exports markdown citation trail', () => {
    const world = buildWorld();
    const artifact = world.exportService.exportCitationTrailMarkdown('policy_decision', 'policy-decision-1');
    assert.equal(artifact.type, 'citation_trail');
    assert.ok(artifact.content.includes(world.citation.id));
  });

  it('3. exports markdown evidence trace', () => {
    const world = buildWorld();
    const artifact = world.exportService.exportEvidenceTraceMarkdown(world.requirement.id);
    assert.equal(artifact.type, 'evidence_trace');
    assert.ok(artifact.content.includes(world.satisfaction.id));
  });

  it('4. exports audit bundle fragment', () => {
    const world = buildWorld();
    const artifact = world.exportService.exportAuditBundleFragment(world.proof.id);
    assert.equal(artifact.type, 'audit_bundle_fragment');
    const parsed = JSON.parse(artifact.content) as { proof: { id: string } };
    assert.equal(parsed.proof.id, world.proof.id);
  });

  it('5. includes source documents', () => {
    const world = buildWorld();
    const artifact = world.exportService.exportJsonSummary({ trustDomainId: 'trust-domain-1' });
    const parsed = JSON.parse(artifact.content) as { sourceDocuments: Array<{ id: string }> };
    assert.ok(parsed.sourceDocuments.some((d) => d.id === world.sourceDocument.id));
  });

  it('6. includes artifacts', () => {
    const world = buildWorld();
    const artifact = world.exportService.exportJsonSummary({ trustDomainId: 'trust-domain-1' });
    const parsed = JSON.parse(artifact.content) as { evidenceArtifacts: Array<{ id: string }> };
    assert.ok(parsed.evidenceArtifacts.some((a) => a.id === world.artifact.id));
  });

  it('7. includes requirements', () => {
    const world = buildWorld();
    const artifact = world.exportService.exportJsonSummary({ trustDomainId: 'trust-domain-1' });
    const parsed = JSON.parse(artifact.content) as { requirements: Array<{ id: string }> };
    assert.ok(parsed.requirements.some((r) => r.id === world.requirement.id));
  });

  it('8. includes satisfactions', () => {
    const world = buildWorld();
    const artifact = world.exportService.exportJsonSummary({ trustDomainId: 'trust-domain-1' });
    const parsed = JSON.parse(artifact.content) as { satisfactions: Array<{ id: string }> };
    assert.ok(parsed.satisfactions.some((s) => s.id === world.satisfaction.id));
  });

  it('9. includes citations', () => {
    const world = buildWorld();
    const artifact = world.exportService.exportJsonSummary({ trustDomainId: 'trust-domain-1' });
    const parsed = JSON.parse(artifact.content) as { citations: Array<{ id: string }> };
    assert.ok(parsed.citations.some((c) => c.id === world.citation.id));
  });

  it('10. includes proofs', () => {
    const world = buildWorld();
    const artifact = world.exportService.exportJsonSummary({ trustDomainId: 'trust-domain-1' });
    const parsed = JSON.parse(artifact.content) as { proofs: Array<{ id: string }> };
    assert.ok(parsed.proofs.some((p) => p.id === world.proof.id));
  });

  it('11. deterministic output', () => {
    const a = buildWorld();
    const b = buildWorld();
    const artifactA = a.exportService.exportJsonSummary({ trustDomainId: 'trust-domain-1' });
    const artifactB = b.exportService.exportJsonSummary({ trustDomainId: 'trust-domain-1' });
    assert.equal(artifactA.content, artifactB.content);
  });

  it('12. no filesystem write (content is returned as a string)', () => {
    const world = buildWorld();
    const artifact = world.exportService.exportJsonSummary({ trustDomainId: 'trust-domain-1' });
    assert.equal(typeof artifact.content, 'string');
  });
});
