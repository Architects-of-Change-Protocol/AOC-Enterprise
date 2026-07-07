import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture } from '../fixtures/evidence-demo.fixture.js';
import {
  buildEvidenceDemoScenarioMetadata,
  buildEvidenceProofChainReference,
  buildEvidenceDemoExportSnippet,
} from '../integrations/enterprise-demo-evidence-adapter.js';

describe('EnterpriseDemoEvidenceAdapter', () => {
  it('1. produces demo metadata', () => {
    const { policyDecisionProof } = buildEvidenceDemoFixture();
    const metadata = buildEvidenceDemoScenarioMetadata(policyDecisionProof);
    assert.equal(metadata.proofId, policyDecisionProof.id);
    assert.equal(metadata.evidenceArtifactCount, policyDecisionProof.evidenceArtifactIds.length);
    assert.equal(metadata.proofHash, policyDecisionProof.proofHash);
  });

  it('2. produces evidence proof references', () => {
    const { policyDecisionProof } = buildEvidenceDemoFixture();
    const reference = buildEvidenceProofChainReference(policyDecisionProof);
    assert.equal(reference.proofId, policyDecisionProof.id);
    assert.equal(reference.proofHash, policyDecisionProof.proofHash);
  });

  it('3. produces export snippet', () => {
    const { policyDecisionProof } = buildEvidenceDemoFixture();
    const snippet = buildEvidenceDemoExportSnippet(policyDecisionProof);
    assert.ok(snippet.scenarioNote.includes(policyDecisionProof.id));
    JSON.parse(snippet.json);
  });

  it('4. does not fake scenario outcomes (metadata is derived only from the real proof)', () => {
    const { policyDecisionProof, enforcementDecisionProof } = buildEvidenceDemoFixture();
    const metadataA = buildEvidenceDemoScenarioMetadata(policyDecisionProof);
    const metadataB = buildEvidenceDemoScenarioMetadata(enforcementDecisionProof);
    assert.notEqual(metadataA.proofHash, metadataB.proofHash);
    assert.equal(metadataA.targetType, 'policy_decision');
    assert.equal(metadataB.targetType, 'enforcement_decision');
  });
});
