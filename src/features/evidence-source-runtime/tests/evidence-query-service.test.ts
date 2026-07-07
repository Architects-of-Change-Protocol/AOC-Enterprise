import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceStore } from '../services/evidence-store.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { SourceDocumentRegistry } from '../services/source-document-registry.js';
import { EvidenceArtifactRegistry } from '../services/evidence-artifact-registry.js';
import { EvidenceRequirementService } from '../services/evidence-requirement-service.js';
import { CitationService } from '../services/citation-service.js';
import { EvidenceQueryService } from '../services/evidence-query-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const store = new EvidenceStore();
  const ledger = new EvidenceLedger(ctx, store);
  const sourceDocuments = new SourceDocumentRegistry(ctx, store, ledger);
  const artifacts = new EvidenceArtifactRegistry(ctx, store, ledger);
  const requirements = new EvidenceRequirementService(ctx, store, ledger);
  const citations = new CitationService(ctx, store, ledger);
  const query = new EvidenceQueryService(store);
  return { ctx, store, ledger, sourceDocuments, artifacts, requirements, citations, query };
}

describe('EvidenceQueryService', () => {
  it('1. filters by trustDomainId', () => {
    const { artifacts, query } = setup();
    artifacts.submit({ id: 'ea-1', type: 'invoice', title: 'A', trustDomainId: 'domain-a', submittedByActorId: 'actor-1' });
    artifacts.submit({ id: 'ea-2', type: 'invoice', title: 'B', trustDomainId: 'domain-b', submittedByActorId: 'actor-1' });
    assert.deepEqual(
      query.queryEvidenceArtifacts({ trustDomainId: 'domain-a' }).map((a) => a.id),
      ['ea-1'],
    );
  });

  it('2. filters by targetType', () => {
    const { sourceDocuments, citations, query } = setup();
    sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    citations.createCitation({ sourceDocumentId: 'sd-1', targetType: 'policy_decision', targetId: 'p1', reasonCode: 'R', reason: 'r' });
    citations.createCitation({ sourceDocumentId: 'sd-1', targetType: 'approval_decision', targetId: 'p1', reasonCode: 'R', reason: 'r' });
    assert.equal(query.queryCitations({ targetType: 'policy_decision' }).length, 1);
  });

  it('3. filters by targetId', () => {
    const { sourceDocuments, citations, query } = setup();
    sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    citations.createCitation({ sourceDocumentId: 'sd-1', targetType: 'policy_decision', targetId: 'p1', reasonCode: 'R', reason: 'r' });
    citations.createCitation({ sourceDocumentId: 'sd-1', targetType: 'policy_decision', targetId: 'p2', reasonCode: 'R', reason: 'r' });
    assert.equal(query.queryCitations({ targetId: 'p1' }).length, 1);
  });

  it('4. filters by source document type', () => {
    const { sourceDocuments, query } = setup();
    sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    sourceDocuments.register({ id: 'sd-2', type: 'contract', title: 'Contract', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    assert.deepEqual(
      query.querySourceDocuments({ sourceDocumentType: 'contract' }).map((d) => d.id),
      ['sd-2'],
    );
  });

  it('5. filters by artifact type', () => {
    const { artifacts, query } = setup();
    artifacts.submit({ id: 'ea-1', type: 'invoice', title: 'A', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    artifacts.submit({ id: 'ea-2', type: 'purchase_order', title: 'B', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    assert.deepEqual(
      query.queryEvidenceArtifacts({ evidenceArtifactType: 'purchase_order' }).map((a) => a.id),
      ['ea-2'],
    );
  });

  it('6. filters by status', () => {
    const { artifacts, query } = setup();
    artifacts.submit({ id: 'ea-1', type: 'invoice', title: 'A', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    artifacts.submit({ id: 'ea-2', type: 'invoice', title: 'B', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    artifacts.accept('ea-2', 'actor-reviewer');
    assert.deepEqual(
      query.queryEvidenceArtifacts({ evidenceArtifactStatus: 'accepted' }).map((a) => a.id),
      ['ea-2'],
    );
  });

  it('7. filters by requirement source', () => {
    const { requirements, query } = setup();
    requirements.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd1', required: true });
    requirements.create({ type: 'invoice', source: 'policy_pack', trustDomainId: 'd', description: 'd2', required: true });
    assert.equal(query.queryRequirements({ requirementSource: 'policy_pack' }).length, 1);
  });

  it('8. filters satisfied requirements', () => {
    const { requirements, query } = setup();
    const a = requirements.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd1', required: true });
    requirements.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd2', required: true });
    requirements.markSatisfied(a.id);
    assert.deepEqual(
      query.queryRequirements({ satisfied: true }).map((r) => r.id),
      [a.id],
    );
  });

  it('9. filters unsatisfied requirements', () => {
    const { requirements, query } = setup();
    const a = requirements.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd1', required: true });
    const b = requirements.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd2', required: true });
    requirements.markSatisfied(a.id);
    assert.deepEqual(
      query.queryRequirements({ satisfied: false }).map((r) => r.id),
      [b.id],
    );
  });

  it('10. filters demoOnly', () => {
    const { sourceDocuments, query } = setup();
    sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    sourceDocuments.register({ id: 'sd-2', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: false, legalCompleteness: 'customer_provided' });
    assert.deepEqual(
      query.querySourceDocuments({ demoOnly: false }).map((d) => d.id),
      ['sd-2'],
    );
  });

  it('11. filters legalCompleteness', () => {
    const { sourceDocuments, query } = setup();
    sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    sourceDocuments.register({ id: 'sd-2', type: 'invoice', title: 'Invoice', authority: 'counsel_reviewed', demoOnly: true, legalCompleteness: 'verified_by_counsel' });
    assert.deepEqual(
      query.querySourceDocuments({ legalCompleteness: 'verified_by_counsel' }).map((d) => d.id),
      ['sd-2'],
    );
  });

  it('12. text search finds title', () => {
    const { artifacts, query } = setup();
    artifacts.submit({ id: 'ea-1', type: 'invoice', title: 'Special Invoice Alpha', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    artifacts.submit({ id: 'ea-2', type: 'invoice', title: 'Ordinary Invoice', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    assert.deepEqual(
      query.queryEvidenceArtifacts({ text: 'alpha' }).map((a) => a.id),
      ['ea-1'],
    );
  });

  it('13. text search finds sourceReference', () => {
    const { sourceDocuments, query } = setup();
    sourceDocuments.register({
      id: 'sd-1',
      type: 'invoice',
      title: 'Invoice',
      authority: 'customer_provided',
      sourceReference: 'invoice:INV-UNIQUE-9001',
      demoOnly: true,
      legalCompleteness: 'customer_provided',
    });
    assert.equal(query.querySourceDocuments({ text: 'INV-UNIQUE-9001' }).length, 1);
  });

  it('14. text search finds hash', () => {
    const { sourceDocuments, query } = setup();
    const document = sourceDocuments.register({ id: 'sd-1', type: 'invoice', title: 'Invoice', authority: 'customer_provided', demoOnly: true, legalCompleteness: 'customer_provided' });
    assert.equal(query.querySourceDocuments({ text: document.metadataHash }).length, 1);
  });

  it('15. deterministic sorting', () => {
    const { artifacts, query } = setup();
    artifacts.submit({ id: 'ea-z', type: 'invoice', title: 'Z', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    artifacts.submit({ id: 'ea-a', type: 'invoice', title: 'A', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    assert.deepEqual(
      query.queryEvidenceArtifacts({}).map((a) => a.id),
      ['ea-a', 'ea-z'],
    );
  });
});
