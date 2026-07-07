import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceStore } from '../services/evidence-store.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { SourceDocumentRegistry } from '../services/source-document-registry.js';
import { EvidenceArtifactRegistry, type SubmitEvidenceArtifactInput } from '../services/evidence-artifact-registry.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildInput(overrides: Partial<SubmitEvidenceArtifactInput> = {}): SubmitEvidenceArtifactInput {
  return {
    id: 'evidence-artifact-1',
    type: 'invoice',
    title: 'Invoice evidence',
    trustDomainId: 'trust-domain-1',
    submittedByActorId: 'actor-1',
    ...overrides,
  };
}

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const store = new EvidenceStore();
  const ledger = new EvidenceLedger(ctx, store);
  const sourceDocuments = new SourceDocumentRegistry(ctx, store, ledger);
  const registry = new EvidenceArtifactRegistry(ctx, store, ledger);
  return { ctx, store, ledger, sourceDocuments, registry };
}

describe('EvidenceArtifactRegistry', () => {
  it('1. submits evidence artifact', () => {
    const { registry } = setup();
    const artifact = registry.submit(buildInput());
    assert.equal(artifact.id, 'evidence-artifact-1');
    assert.equal(artifact.status, 'submitted');
    assert.equal(artifact.submittedAt, NOW);
  });

  it('2. computes metadataHash deterministically', () => {
    const { registry: registryA } = setup();
    const { registry: registryB } = setup();
    const a = registryA.submit(buildInput());
    const b = registryB.submit(buildInput());
    assert.equal(a.metadataHash, b.metadataHash);

    const { registry: registryC } = setup();
    const c = registryC.submit(buildInput({ title: 'Different' }));
    assert.notEqual(a.metadataHash, c.metadataHash);
  });

  it('3. rejects duplicate ID', () => {
    const { registry } = setup();
    registry.submit(buildInput());
    assert.throws(() => registry.submit(buildInput()));
  });

  it('4. accepts artifact', () => {
    const { registry } = setup();
    registry.submit(buildInput());
    const accepted = registry.accept('evidence-artifact-1', 'actor-reviewer');
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.reviewedByActorId, 'actor-reviewer');
  });

  it('5. rejects artifact', () => {
    const { registry } = setup();
    registry.submit(buildInput());
    const rejected = registry.reject('evidence-artifact-1', 'actor-reviewer', 'DUPLICATE', 'already submitted');
    assert.equal(rejected.status, 'rejected');
  });

  it('6. revokes artifact', () => {
    const { registry } = setup();
    registry.submit(buildInput());
    const revoked = registry.revoke('evidence-artifact-1');
    assert.equal(revoked.status, 'revoked');
  });

  it('7. supersedes artifact', () => {
    const { registry } = setup();
    registry.submit(buildInput());
    const superseded = registry.supersede('evidence-artifact-1', 'evidence-artifact-2');
    assert.equal(superseded.status, 'superseded');
  });

  it('8. marks expired', () => {
    const { registry } = setup();
    registry.submit(buildInput());
    const expired = registry.markExpired('evidence-artifact-1');
    assert.equal(expired.status, 'expired');
  });

  it('9. links to source document', () => {
    const { registry, sourceDocuments } = setup();
    sourceDocuments.register({
      id: 'source-document-1',
      type: 'invoice',
      title: 'Invoice',
      authority: 'customer_provided',
      demoOnly: true,
      legalCompleteness: 'customer_provided',
    });
    const artifact = registry.submit(buildInput({ sourceDocumentId: 'source-document-1' }));
    assert.equal(artifact.sourceDocumentId, 'source-document-1');

    assert.throws(() => registry.submit(buildInput({ id: 'evidence-artifact-2', sourceDocumentId: 'missing-source' })));
  });

  it('10. records events', () => {
    const { registry, ledger } = setup();
    registry.submit(buildInput());
    registry.accept('evidence-artifact-1', 'actor-reviewer');
    const events = ledger.getEvents();
    assert.deepEqual(
      events.map((e) => e.type),
      ['evidence_artifact_submitted', 'evidence_artifact_accepted'],
    );
  });

  it('throws EvidenceArtifactNotFoundError for unknown id', () => {
    const { registry } = setup();
    assert.throws(() => registry.accept('missing', 'actor'));
  });
});
