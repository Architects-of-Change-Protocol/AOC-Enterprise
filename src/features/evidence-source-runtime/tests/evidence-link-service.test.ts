import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceStore } from '../services/evidence-store.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { EvidenceArtifactRegistry } from '../services/evidence-artifact-registry.js';
import { EvidenceLinkService } from '../services/evidence-link-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const store = new EvidenceStore();
  const ledger = new EvidenceLedger(ctx, store);
  const artifacts = new EvidenceArtifactRegistry(ctx, store, ledger);
  const links = new EvidenceLinkService(ctx, store, ledger);
  return { ctx, store, ledger, artifacts, links };
}

function submitArtifact(artifacts: ReturnType<typeof setup>['artifacts'], id = 'evidence-artifact-1') {
  return artifacts.submit({ id, type: 'invoice', title: 'Invoice evidence', trustDomainId: 'd', submittedByActorId: 'actor-1' });
}

describe('EvidenceLinkService', () => {
  it('1. creates supports link', () => {
    const { artifacts, links } = setup();
    const artifact = submitArtifact(artifacts);
    const link = links.createLink({ type: 'supports', evidenceArtifactId: artifact.id, targetType: 'recognition_decision', targetId: 'recognition-decision-1' });
    assert.equal(link.type, 'supports');
  });

  it('2. creates satisfies link', () => {
    const { artifacts, links } = setup();
    const artifact = submitArtifact(artifacts);
    const link = links.createLink({ type: 'satisfies', evidenceArtifactId: artifact.id, targetType: 'policy_decision', targetId: 'policy-decision-1', requirementId: 'req-1' });
    assert.equal(link.type, 'satisfies');
    assert.equal(link.requirementId, 'req-1');
  });

  it('3. creates reviewed_for link', () => {
    const { artifacts, links } = setup();
    const artifact = submitArtifact(artifacts);
    const link = links.createLink({ type: 'reviewed_for', evidenceArtifactId: artifact.id, targetType: 'approval_decision', targetId: 'approval-decision-1' });
    assert.equal(link.type, 'reviewed_for');
  });

  it('4. creates referenced_by link', () => {
    const { artifacts, links } = setup();
    const artifact = submitArtifact(artifacts);
    const link = links.createLink({ type: 'referenced_by', evidenceArtifactId: artifact.id, targetType: 'demo_scenario', targetId: 'demo-1' });
    assert.equal(link.type, 'referenced_by');
  });

  it('5. creates supersedes link', () => {
    const { artifacts, links } = setup();
    const artifact = submitArtifact(artifacts);
    const link = links.createLink({ type: 'supersedes', evidenceArtifactId: artifact.id, targetType: 'policy_decision', targetId: 'policy-decision-2' });
    assert.equal(link.type, 'supersedes');
  });

  it('6. validates artifact exists', () => {
    const { links } = setup();
    assert.throws(() => links.createLink({ type: 'supports', evidenceArtifactId: 'missing', targetType: 'policy_decision', targetId: 'p1' }));
  });

  it('7. validates target exists structurally', () => {
    const { artifacts, links } = setup();
    const artifact = submitArtifact(artifacts);
    assert.throws(() => links.createLink({ type: 'supports', evidenceArtifactId: artifact.id, targetType: 'policy_decision', targetId: '' }));
  });

  it('8. records event', () => {
    const { artifacts, links, ledger } = setup();
    const artifact = submitArtifact(artifacts);
    links.createLink({ type: 'supports', evidenceArtifactId: artifact.id, targetType: 'policy_decision', targetId: 'p1' });
    const events = ledger.getEvents().filter((e) => e.type === 'evidence_link_created');
    assert.equal(events.length, 1);
  });

  it('9. deterministic ordering', () => {
    const { artifacts, links } = setup();
    const artifact = submitArtifact(artifacts);
    links.createLink({ type: 'supports', evidenceArtifactId: artifact.id, targetType: 'policy_decision', targetId: 'p1' });
    links.createLink({ type: 'referenced_by', evidenceArtifactId: artifact.id, targetType: 'policy_decision', targetId: 'p1' });
    const byArtifact = links.listByArtifact(artifact.id);
    assert.deepEqual(
      byArtifact.map((l) => l.id),
      [...byArtifact.map((l) => l.id)].sort(),
    );
  });
});
