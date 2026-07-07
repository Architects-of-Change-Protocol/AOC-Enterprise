import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceStore } from '../services/evidence-store.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { SourceDocumentRegistry } from '../services/source-document-registry.js';
import { EvidenceArtifactRegistry } from '../services/evidence-artifact-registry.js';
import { EvidenceRequirementService } from '../services/evidence-requirement-service.js';
import { EvidenceProofService } from '../services/evidence-proof-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const store = new EvidenceStore();
  const ledger = new EvidenceLedger(ctx, store);
  const sourceDocuments = new SourceDocumentRegistry(ctx, store, ledger);
  const artifacts = new EvidenceArtifactRegistry(ctx, store, ledger);
  const requirements = new EvidenceRequirementService(ctx, store, ledger);
  const proofs = new EvidenceProofService(ctx, store, ledger);
  return { ctx, store, ledger, sourceDocuments, artifacts, requirements, proofs };
}

function buildWorld() {
  const world = setup();
  const sourceDocument = world.sourceDocuments.register({
    id: 'source-document-1',
    type: 'invoice',
    title: 'Invoice',
    authority: 'customer_provided',
    demoOnly: true,
    legalCompleteness: 'customer_provided',
  });
  const artifact = world.artifacts.submit({ id: 'evidence-artifact-1', type: 'invoice', title: 'Invoice evidence', sourceDocumentId: sourceDocument.id, trustDomainId: 'trust-domain-1', submittedByActorId: 'actor-1' });
  const requirement = world.requirements.create({ type: 'invoice', source: 'manual', trustDomainId: 'trust-domain-1', description: 'Attach invoice.', required: true });
  return { ...world, sourceDocument, artifact, requirement };
}

describe('EvidenceProofService', () => {
  it('1. creates proof', () => {
    const world = buildWorld();
    const proof = world.proofs.createProof({
      trustDomainId: 'trust-domain-1',
      sourceDocumentIds: [world.sourceDocument.id],
      evidenceArtifactIds: [world.artifact.id],
      requirementIds: [world.requirement.id],
    });
    assert.ok(proof.proofHash.length > 0);
  });

  it('2. proof hash deterministic', () => {
    const world = buildWorld();
    const proof = world.proofs.createProof({ trustDomainId: 'trust-domain-1', evidenceArtifactIds: [world.artifact.id] });
    assert.equal(/^[0-9a-f]{64}$/.test(proof.proofHash), true);
  });

  it('3. same input produces same proof hash', () => {
    const a = buildWorld();
    const proofA = a.proofs.createProof({ trustDomainId: 'trust-domain-1', evidenceArtifactIds: [a.artifact.id], requirementIds: [a.requirement.id] });

    const b = buildWorld();
    const proofB = b.proofs.createProof({ trustDomainId: 'trust-domain-1', evidenceArtifactIds: [b.artifact.id], requirementIds: [b.requirement.id] });

    assert.equal(proofA.proofHash, proofB.proofHash);
  });

  it('4. changing source document changes proof hash', () => {
    const world = buildWorld();
    const before = world.proofs.createProof({ trustDomainId: 'trust-domain-1', sourceDocumentIds: [world.sourceDocument.id] });
    world.sourceDocuments.update(world.sourceDocument.id, { title: 'Updated invoice title' });
    const after = world.proofs.createProof({ trustDomainId: 'trust-domain-1', sourceDocumentIds: [world.sourceDocument.id] });
    assert.notEqual(before.sourceHash, after.sourceHash);
    assert.notEqual(before.proofHash, after.proofHash);
  });

  it('5. changing evidence artifact changes proof hash', () => {
    const world = buildWorld();
    const before = world.proofs.createProof({ trustDomainId: 'trust-domain-1', evidenceArtifactIds: [world.artifact.id] });
    world.artifacts.accept(world.artifact.id, 'actor-reviewer');
    const after = world.proofs.createProof({ trustDomainId: 'trust-domain-1', evidenceArtifactIds: [world.artifact.id] });
    assert.notEqual(before.evidenceHash, after.evidenceHash);
    assert.notEqual(before.proofHash, after.proofHash);
  });

  it('6. changing requirement changes proof hash', () => {
    const world = buildWorld();
    const before = world.proofs.createProof({ trustDomainId: 'trust-domain-1', requirementIds: [world.requirement.id] });
    world.requirements.markSatisfied(world.requirement.id);
    const after = world.proofs.createProof({ trustDomainId: 'trust-domain-1', requirementIds: [world.requirement.id] });
    assert.notEqual(before.requirementHash, after.requirementHash);
    assert.notEqual(before.proofHash, after.proofHash);
  });

  it('7. changing satisfaction changes proof hash', () => {
    const world = buildWorld();
    world.store.saveSatisfaction({
      id: 'evidence-satisfaction-1',
      requirementId: world.requirement.id,
      evidenceArtifactIds: [world.artifact.id],
      status: 'satisfied',
      satisfiedAt: NOW,
      reasonCode: 'OK',
      reason: 'attached',
    });
    const before = world.proofs.createProof({ trustDomainId: 'trust-domain-1', satisfactionIds: ['evidence-satisfaction-1'] });
    world.store.saveSatisfaction({
      id: 'evidence-satisfaction-1',
      requirementId: world.requirement.id,
      evidenceArtifactIds: [world.artifact.id],
      status: 'superseded',
      satisfiedAt: NOW,
      reasonCode: 'OK',
      reason: 'superseded',
    });
    const after = world.proofs.createProof({ trustDomainId: 'trust-domain-1', satisfactionIds: ['evidence-satisfaction-1'] });
    assert.notEqual(before.satisfactionHash, after.satisfactionHash);
  });

  it('8. changing citation changes proof hash', () => {
    const world = buildWorld();
    world.store.saveCitation({
      id: 'citation-1',
      evidenceArtifactId: world.artifact.id,
      targetType: 'policy_decision',
      targetId: 'policy-decision-1',
      citationText: 'v1',
      reasonCode: 'OK',
      reason: 'v1',
      createdAt: NOW,
    });
    const before = world.proofs.createProof({ trustDomainId: 'trust-domain-1', citationIds: ['citation-1'] });
    world.store.saveCitation({
      id: 'citation-1',
      evidenceArtifactId: world.artifact.id,
      targetType: 'policy_decision',
      targetId: 'policy-decision-1',
      citationText: 'v2',
      reasonCode: 'OK',
      reason: 'v2',
      createdAt: NOW,
    });
    const after = world.proofs.createProof({ trustDomainId: 'trust-domain-1', citationIds: ['citation-1'] });
    assert.notEqual(before.citationHash, after.citationHash);
  });

  it('9. changing link changes proof hash', () => {
    const world = buildWorld();
    world.store.saveEvidenceLink({
      id: 'evidence-link-1',
      type: 'supports',
      evidenceArtifactId: world.artifact.id,
      targetType: 'policy_decision',
      targetId: 'policy-decision-1',
      createdAt: NOW,
    });
    const before = world.proofs.createProof({ trustDomainId: 'trust-domain-1', evidenceLinkIds: ['evidence-link-1'] });
    world.store.saveEvidenceLink({
      id: 'evidence-link-1',
      type: 'satisfies',
      evidenceArtifactId: world.artifact.id,
      targetType: 'policy_decision',
      targetId: 'policy-decision-1',
      createdAt: NOW,
    });
    const after = world.proofs.createProof({ trustDomainId: 'trust-domain-1', evidenceLinkIds: ['evidence-link-1'] });
    assert.notEqual(before.linkHash, after.linkHash);
  });

  it('10. maintains previousHash chain', () => {
    const world = buildWorld();
    const first = world.proofs.createProof({ trustDomainId: 'trust-domain-1' });
    const second = world.proofs.createProof({ trustDomainId: 'trust-domain-1' });
    assert.equal(first.previousHash, undefined);
    assert.equal(second.previousHash, first.proofHash);
  });

  it('11. verifies proof', () => {
    const world = buildWorld();
    const proof = world.proofs.createProof({ trustDomainId: 'trust-domain-1', evidenceArtifactIds: [world.artifact.id] });
    assert.equal(world.proofs.verifyProof(proof), true);
    assert.equal(world.proofs.verifyProof({ ...proof, proofHash: 'tampered' }), false);
  });

  it('12. records event', () => {
    const world = buildWorld();
    world.proofs.createProof({ trustDomainId: 'trust-domain-1' });
    const events = world.ledger.getEvents().filter((e) => e.type === 'evidence_proof_created');
    assert.equal(events.length, 1);
  });
});
