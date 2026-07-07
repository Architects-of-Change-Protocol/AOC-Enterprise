import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceStore } from '../services/evidence-store.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { EvidenceArtifactRegistry } from '../services/evidence-artifact-registry.js';
import { EvidenceRequirementService } from '../services/evidence-requirement-service.js';
import { EvidenceReviewService } from '../services/evidence-review-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const store = new EvidenceStore();
  const ledger = new EvidenceLedger(ctx, store);
  const artifacts = new EvidenceArtifactRegistry(ctx, store, ledger);
  const requirements = new EvidenceRequirementService(ctx, store, ledger);
  const reviews = new EvidenceReviewService(ctx, store, ledger, artifacts, requirements);
  return { ctx, store, ledger, artifacts, requirements, reviews };
}

function submitArtifact(artifacts: ReturnType<typeof setup>['artifacts'], id = 'evidence-artifact-1') {
  return artifacts.submit({ id, type: 'invoice', title: 'Invoice evidence', trustDomainId: 'trust-domain-1', submittedByActorId: 'actor-1' });
}

describe('EvidenceReviewService', () => {
  it('1. records accepted review', () => {
    const { artifacts, reviews } = setup();
    const artifact = submitArtifact(artifacts);
    const review = reviews.recordReview({
      evidenceArtifactId: artifact.id,
      reviewerActorId: 'actor-reviewer',
      decision: 'accepted',
      reasonCode: 'OK',
      reason: 'looks good',
    });
    assert.equal(review.decision, 'accepted');
    assert.equal(artifacts.get(artifact.id)?.status, 'accepted');
  });

  it('2. records rejected review', () => {
    const { artifacts, reviews } = setup();
    const artifact = submitArtifact(artifacts);
    reviews.recordReview({
      evidenceArtifactId: artifact.id,
      reviewerActorId: 'actor-reviewer',
      decision: 'rejected',
      reasonCode: 'BAD',
      reason: 'not acceptable',
    });
    assert.equal(artifacts.get(artifact.id)?.status, 'rejected');
  });

  it('3. records needs_more_evidence review', () => {
    const { artifacts, reviews } = setup();
    const artifact = submitArtifact(artifacts);
    reviews.recordReview({
      evidenceArtifactId: artifact.id,
      reviewerActorId: 'actor-reviewer',
      decision: 'needs_more_evidence',
      reasonCode: 'INCOMPLETE',
      reason: 'need supporting page',
    });
    assert.equal(artifacts.get(artifact.id)?.status, 'needs_review');
  });

  it('4. records waived review', () => {
    const { requirements, reviews } = setup();
    const requirement = requirements.create({ type: 'invoice', source: 'manual', trustDomainId: 'd', description: 'd', required: true });
    reviews.recordReview({
      requirementId: requirement.id,
      reviewerActorId: 'actor-reviewer',
      decision: 'waived',
      reasonCode: 'WAIVED_BY_OPS',
      reason: 'ops waived this requirement',
    });
    assert.equal(requirements.get(requirement.id)?.status, 'waived');
  });

  it('5. updates artifact status when applicable', () => {
    const { artifacts, reviews } = setup();
    const artifact = submitArtifact(artifacts);
    reviews.recordReview({
      evidenceArtifactId: artifact.id,
      reviewerActorId: 'actor-reviewer',
      decision: 'not_applicable',
      reasonCode: 'NA',
      reason: 'not applicable to this decision',
    });
    assert.equal(artifacts.get(artifact.id)?.status, 'submitted');
  });

  it('6. records event', () => {
    const { artifacts, reviews, ledger } = setup();
    const artifact = submitArtifact(artifacts);
    reviews.recordReview({
      evidenceArtifactId: artifact.id,
      reviewerActorId: 'actor-reviewer',
      decision: 'accepted',
      reasonCode: 'OK',
      reason: 'looks good',
    });
    const events = ledger.getEvents().filter((e) => e.type === 'evidence_review_recorded');
    assert.equal(events.length, 1);
  });

  it('7. does not claim legal sufficiency without metadata', () => {
    const { artifacts, reviews } = setup();
    const artifact = submitArtifact(artifacts);
    const review = reviews.recordReview({
      evidenceArtifactId: artifact.id,
      reviewerActorId: 'actor-reviewer',
      decision: 'accepted',
      reasonCode: 'OK',
      reason: 'looks good',
    });
    assert.equal(review.metadata, undefined);

    const counselReview = reviews.recordReview({
      evidenceArtifactId: artifact.id,
      reviewerActorId: 'actor-counsel',
      decision: 'accepted',
      reasonCode: 'OK',
      reason: 'reviewed by outside counsel',
      metadata: { reviewedByCounsel: true },
    });
    assert.equal(counselReview.metadata?.reviewedByCounsel, true);
  });
});
