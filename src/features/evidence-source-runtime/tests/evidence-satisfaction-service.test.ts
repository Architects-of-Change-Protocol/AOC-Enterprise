import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceStore } from '../services/evidence-store.js';
import { EvidenceLedger } from '../services/evidence-ledger.js';
import { EvidenceArtifactRegistry } from '../services/evidence-artifact-registry.js';
import { EvidenceRequirementService } from '../services/evidence-requirement-service.js';
import { EvidenceLinkService } from '../services/evidence-link-service.js';
import { EvidenceProofService } from '../services/evidence-proof-service.js';
import { EvidenceSatisfactionService } from '../services/evidence-satisfaction-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const store = new EvidenceStore();
  const ledger = new EvidenceLedger(ctx, store);
  const artifacts = new EvidenceArtifactRegistry(ctx, store, ledger);
  const requirements = new EvidenceRequirementService(ctx, store, ledger);
  const links = new EvidenceLinkService(ctx, store, ledger);
  const proofs = new EvidenceProofService(ctx, store, ledger);
  const satisfactions = new EvidenceSatisfactionService(ctx, store, ledger, requirements, links, proofs);
  return { ctx, store, ledger, artifacts, requirements, links, proofs, satisfactions };
}

function submitArtifact(artifacts: EvidenceArtifactRegistryLike, id = 'evidence-artifact-1') {
  return artifacts.submit({ id, type: 'invoice', title: 'Invoice evidence', trustDomainId: 'trust-domain-1', submittedByActorId: 'actor-1' });
}

type EvidenceArtifactRegistryLike = ReturnType<typeof setup>['artifacts'];

function createRequirement(requirements: ReturnType<typeof setup>['requirements'], policyDecisionId = 'policy-decision-1') {
  return requirements.create({
    type: 'invoice',
    source: 'policy_pack',
    policyDecisionId,
    trustDomainId: 'trust-domain-1',
    description: 'Attach invoice.',
    required: true,
  });
}

describe('EvidenceSatisfactionService', () => {
  it('1. satisfies requirement with accepted artifact', () => {
    const { artifacts, requirements, satisfactions } = setup();
    const artifact = submitArtifact(artifacts);
    artifacts.accept(artifact.id, 'actor-reviewer');
    const requirement = createRequirement(requirements);
    const satisfaction = satisfactions.satisfy({
      requirementId: requirement.id,
      evidenceArtifactIds: [artifact.id],
      reasonCode: 'ATTACHED',
      reason: 'invoice attached',
    });
    assert.equal(satisfaction.status, 'satisfied');
  });

  it('2. rejects satisfaction when artifact missing', () => {
    const { requirements, satisfactions } = setup();
    const requirement = createRequirement(requirements);
    assert.throws(() => satisfactions.satisfy({ requirementId: requirement.id, evidenceArtifactIds: ['missing-artifact'], reasonCode: 'X', reason: 'x' }));
  });

  it('3. rejects satisfaction when artifact rejected', () => {
    const { artifacts, requirements, satisfactions } = setup();
    const artifact = submitArtifact(artifacts);
    artifacts.reject(artifact.id, 'actor-reviewer', 'BAD', 'bad evidence');
    const requirement = createRequirement(requirements);
    const satisfaction = satisfactions.satisfy({ requirementId: requirement.id, evidenceArtifactIds: [artifact.id], reasonCode: 'X', reason: 'x' });
    assert.equal(satisfaction.status, 'rejected');
  });

  it('4. rejects satisfaction when artifact revoked', () => {
    const { artifacts, requirements, satisfactions } = setup();
    const artifact = submitArtifact(artifacts);
    artifacts.accept(artifact.id, 'actor-reviewer');
    artifacts.revoke(artifact.id);
    const requirement = createRequirement(requirements);
    const satisfaction = satisfactions.satisfy({ requirementId: requirement.id, evidenceArtifactIds: [artifact.id], reasonCode: 'X', reason: 'x' });
    assert.equal(satisfaction.status, 'rejected');
  });

  it('5. rejects satisfaction when artifact expired', () => {
    const { artifacts, requirements, satisfactions } = setup();
    const artifact = submitArtifact(artifacts);
    artifacts.accept(artifact.id, 'actor-reviewer');
    artifacts.markExpired(artifact.id);
    const requirement = createRequirement(requirements);
    const satisfaction = satisfactions.satisfy({ requirementId: requirement.id, evidenceArtifactIds: [artifact.id], reasonCode: 'X', reason: 'x' });
    assert.equal(satisfaction.status, 'rejected');
  });

  it('6. supports partial satisfaction', () => {
    const { artifacts, requirements, satisfactions } = setup();
    const artifact = submitArtifact(artifacts);
    artifacts.accept(artifact.id, 'actor-reviewer');
    const requirement = createRequirement(requirements);
    const satisfaction = satisfactions.satisfy({
      requirementId: requirement.id,
      evidenceArtifactIds: [artifact.id],
      reasonCode: 'PARTIAL',
      reason: 'only one of several documents received',
      partial: true,
    });
    assert.equal(satisfaction.status, 'partially_satisfied');
  });

  it('7. updates requirement status', () => {
    const { artifacts, requirements, satisfactions } = setup();
    const artifact = submitArtifact(artifacts);
    artifacts.accept(artifact.id, 'actor-reviewer');
    const requirement = createRequirement(requirements);
    satisfactions.satisfy({ requirementId: requirement.id, evidenceArtifactIds: [artifact.id], reasonCode: 'X', reason: 'x' });
    assert.equal(requirements.get(requirement.id)?.status, 'satisfied');
  });

  it('8. creates evidence link', () => {
    const { artifacts, requirements, satisfactions, links } = setup();
    const artifact = submitArtifact(artifacts);
    artifacts.accept(artifact.id, 'actor-reviewer');
    const requirement = createRequirement(requirements);
    satisfactions.satisfy({ requirementId: requirement.id, evidenceArtifactIds: [artifact.id], reasonCode: 'X', reason: 'x' });
    const linksForArtifact = links.listByArtifact(artifact.id);
    assert.equal(linksForArtifact.length, 1);
    assert.equal(linksForArtifact[0]?.type, 'satisfies');
    assert.equal(linksForArtifact[0]?.targetType, 'policy_decision');
  });

  it('9. creates proof when requested', () => {
    const { artifacts, requirements, satisfactions } = setup();
    const artifact = submitArtifact(artifacts);
    artifacts.accept(artifact.id, 'actor-reviewer');
    const requirement = createRequirement(requirements);
    const satisfaction = satisfactions.satisfy({
      requirementId: requirement.id,
      evidenceArtifactIds: [artifact.id],
      reasonCode: 'X',
      reason: 'x',
      createProof: true,
    });
    assert.ok(satisfaction.proofId !== undefined);
  });

  it('10. deterministic output', () => {
    const runOnce = () => {
      const { artifacts, requirements, satisfactions } = setup();
      const artifact = submitArtifact(artifacts);
      artifacts.accept(artifact.id, 'actor-reviewer');
      const requirement = createRequirement(requirements);
      return satisfactions.satisfy({ requirementId: requirement.id, evidenceArtifactIds: [artifact.id], reasonCode: 'X', reason: 'x' });
    };
    const a = runOnce();
    const b = runOnce();
    assert.deepEqual(a, b);
  });

  it('throws EvidenceSatisfactionInvalidError when no evidence artifacts are given', () => {
    const { requirements, satisfactions } = setup();
    const requirement = createRequirement(requirements);
    assert.throws(() => satisfactions.satisfy({ requirementId: requirement.id, evidenceArtifactIds: [], reasonCode: 'X', reason: 'x' }));
  });
});
