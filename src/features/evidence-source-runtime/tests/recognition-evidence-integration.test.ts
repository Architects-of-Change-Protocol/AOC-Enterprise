import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { createEvidenceRuntime } from '../services/evidence-runtime.js';
import { createRecognitionEvidenceIntegration } from '../integrations/recognition-evidence-integration.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';
const RECOGNITION_DECISION_ID = 'recognition-decision-1';
const ACTOR_ID = 'actor-pmfreak-closure-agent';

function setup() {
  const ctx = createEvidenceRuntimeContext(NOW);
  const runtime = createEvidenceRuntime(ctx);
  const integration = createRecognitionEvidenceIntegration(runtime);
  return { ctx, runtime, integration };
}

describe('RecognitionEvidenceIntegration', () => {
  it('1. creates requirement from recognition evidence decision', () => {
    const { integration } = setup();
    const requirements = integration.createRequirementsFromRecognitionDecision({
      trustDomainId: TRUST_DOMAIN_ID,
      recognitionDecisionId: RECOGNITION_DECISION_ID,
      actorId: ACTOR_ID,
      requiredEvidence: ['Attach a signed identity proof.'],
    });
    assert.equal(requirements.length, 1);
    assert.equal(requirements[0]?.source, 'recognition');
    assert.equal(requirements[0]?.recognitionDecisionId, RECOGNITION_DECISION_ID);

    const again = integration.createRequirementsFromRecognitionDecision({
      trustDomainId: TRUST_DOMAIN_ID,
      recognitionDecisionId: RECOGNITION_DECISION_ID,
      requiredEvidence: ['Attach a signed identity proof.'],
    });
    assert.equal(again[0]?.id, requirements[0]?.id);
  });

  it('2. links evidence to recognition_decision', () => {
    const { runtime, integration } = setup();
    const artifact = runtime.submitEvidenceArtifact({ id: 'ea-1', type: 'identity_proof', title: 'Identity proof', trustDomainId: TRUST_DOMAIN_ID, submittedByActorId: ACTOR_ID });
    const [link] = integration.linkEvidenceToRecognitionDecision({ recognitionDecisionId: RECOGNITION_DECISION_ID, evidenceArtifactIds: [artifact.id] });
    assert.equal(link?.targetType, 'recognition_decision');
    assert.equal(link?.type, 'supports');
  });

  it('3. creates citation', () => {
    const { runtime, integration } = setup();
    const artifact = runtime.submitEvidenceArtifact({ id: 'ea-1', type: 'identity_proof', title: 'Identity proof', trustDomainId: TRUST_DOMAIN_ID, submittedByActorId: ACTOR_ID });
    const citation = integration.createCitationForRecognitionDecision({
      evidenceArtifactId: artifact.id,
      recognitionDecisionId: RECOGNITION_DECISION_ID,
      reasonCode: 'CITED',
      reason: 'identity proof cited',
    });
    assert.equal(citation.targetType, 'recognition_decision');
  });

  it('4. does not override Recognition decision (integration exposes no recognition decision API)', () => {
    const { integration } = setup();
    assert.equal('evaluateRecognition' in integration, false);
  });

  it('creates evidence proof only once evidence is accepted', () => {
    const { runtime, integration } = setup();
    const artifact = runtime.submitEvidenceArtifact({ id: 'ea-1', type: 'identity_proof', title: 'Identity proof', trustDomainId: TRUST_DOMAIN_ID, submittedByActorId: ACTOR_ID });
    assert.throws(() =>
      integration.createProofForRecognitionDecision({ trustDomainId: TRUST_DOMAIN_ID, recognitionDecisionId: RECOGNITION_DECISION_ID, evidenceArtifactIds: [artifact.id] }),
    );
    runtime.evidenceArtifacts.accept(artifact.id, 'actor-reviewer');
    const proof = integration.createProofForRecognitionDecision({ trustDomainId: TRUST_DOMAIN_ID, recognitionDecisionId: RECOGNITION_DECISION_ID, evidenceArtifactIds: [artifact.id] });
    assert.equal(proof.targetType, 'recognition_decision');
  });
});
