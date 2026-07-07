import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceStore } from '../services/evidence-store.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { SourceDocumentRegistry, type RegisterSourceDocumentInput } from '../services/source-document-registry.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildInput(overrides: Partial<RegisterSourceDocumentInput> = {}): RegisterSourceDocumentInput {
  return {
    id: 'source-document-1',
    type: 'invoice',
    title: 'Invoice INV-1',
    authority: 'customer_provided',
    demoOnly: true,
    legalCompleteness: 'customer_provided',
    ...overrides,
  };
}

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const store = new EvidenceStore();
  const ledger = new EvidenceLedger(ctx, store);
  const registry = new SourceDocumentRegistry(ctx, store, ledger);
  return { ctx, store, ledger, registry };
}

describe('SourceDocumentRegistry', () => {
  it('1. registers source document', () => {
    const { registry } = setup();
    const document = registry.register(buildInput());
    assert.equal(document.id, 'source-document-1');
    assert.equal(document.status, 'active');
    assert.equal(document.createdAt, NOW);
  });

  it('2. computes metadataHash deterministically', () => {
    const { registry: registryA } = setup();
    const { registry: registryB } = setup();
    const a = registryA.register(buildInput());
    const b = registryB.register(buildInput());
    assert.equal(a.metadataHash, b.metadataHash);

    const { registry: registryC } = setup();
    const c = registryC.register(buildInput({ title: 'Different title' }));
    assert.notEqual(a.metadataHash, c.metadataHash);
  });

  it('3. rejects duplicate ID', () => {
    const { registry } = setup();
    registry.register(buildInput());
    assert.throws(() => registry.register(buildInput()));
  });

  it('4. updates source document', () => {
    const { registry } = setup();
    const original = registry.register(buildInput());
    const updated = registry.update('source-document-1', { title: 'Updated title' });
    assert.equal(updated.title, 'Updated title');
    assert.notEqual(updated.metadataHash, original.metadataHash);
  });

  it('5. revokes source document', () => {
    const { registry } = setup();
    registry.register(buildInput());
    const revoked = registry.revoke('source-document-1', 'SUPERSEDED_BY_CUSTOMER', 'customer withdrew the document');
    assert.equal(revoked.status, 'revoked');
  });

  it('6. supersedes source document', () => {
    const { registry } = setup();
    registry.register(buildInput());
    const superseded = registry.supersede('source-document-1', 'source-document-2');
    assert.equal(superseded.status, 'superseded');
  });

  it('7. marks expired', () => {
    const { registry } = setup();
    registry.register(buildInput());
    const expired = registry.markExpired('source-document-1');
    assert.equal(expired.status, 'expired');
  });

  it('8. preserves demoOnly', () => {
    const { registry } = setup();
    const document = registry.register(buildInput({ demoOnly: false }));
    assert.equal(document.demoOnly, false);
  });

  it('9. preserves legalCompleteness', () => {
    const { registry } = setup();
    const document = registry.register(buildInput({ legalCompleteness: 'verified_by_counsel' }));
    assert.equal(document.legalCompleteness, 'verified_by_counsel');
  });

  it('10. records events', () => {
    const { registry, ledger } = setup();
    registry.register(buildInput());
    registry.update('source-document-1', { title: 'New title' });
    registry.revoke('source-document-1', 'REASON', 'because');
    const events = ledger.getEvents();
    assert.deepEqual(
      events.map((e) => e.type),
      ['source_document_registered', 'source_document_updated', 'source_document_revoked'],
    );
  });

  it('throws SourceDocumentNotFoundError for unknown id', () => {
    const { registry } = setup();
    assert.throws(() => registry.revoke('missing', 'R', 'r'));
  });
});
