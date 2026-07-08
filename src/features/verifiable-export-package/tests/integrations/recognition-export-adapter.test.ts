import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapRecognitionDecisionToItem, mapRecognitionProofToItem } from '../../integrations/recognition-export-adapter.js';
import { createExportRuntimeContext } from '../../domain/export-runtime-context.js';
import type { RecognitionDecision } from '../../../recognition-runtime/domain/recognition-decision.js';
import type { RecognitionProof } from '../../../recognition-runtime/domain/proof.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeDecision(overrides: Partial<RecognitionDecision> = {}): RecognitionDecision {
  return {
    id: 'recognition-decision-1',
    requestId: 'request-1',
    type: 'allow',
    recognized: true,
    reasonCode: 'RECOGNIZED',
    reason: 'Actor presented a valid passport and capability token.',
    actorId: 'actor-1',
    trustDomainId: 'trust-domain-1',
    evaluatedAt: NOW,
    policyResults: [],
    auditEventId: 'audit-event-1',
    ...overrides,
  };
}

function makeProof(overrides: Partial<RecognitionProof> = {}): RecognitionProof {
  return {
    algorithm: 'sha256-deterministic',
    signedBy: 'recognition-runtime',
    signedAt: NOW,
    digest: 'digest-1',
    ...overrides,
  };
}

describe('recognition-export-adapter', () => {
  it('1. mapRecognitionDecisionToItem maps a RecognitionDecision to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const decision = makeDecision();
    const item = mapRecognitionDecisionToItem(ctx, decision);

    assert.equal(item.type, 'recognition_decision');
    assert.equal(item.sourceModule, 'recognition_runtime');
    assert.equal(item.sourceId, decision.id);
    assert.equal(item.payload.actorId, decision.actorId);
    assert.equal(item.payload.reasonCode, decision.reasonCode);
    assert.equal(item.payload.reason, decision.reason);
    assert.equal(item.payload.action, undefined);
  });

  it('2. mapRecognitionProofToItem maps a RecognitionProof to an ExportPackageItem using proof.digest as sourceId', () => {
    const ctx = createExportRuntimeContext(NOW);
    const proof = makeProof({ digest: 'digest-abc' });
    const item = mapRecognitionProofToItem(ctx, proof, 'recognition-decision-1');

    assert.equal(item.type, 'recognition_proof');
    assert.equal(item.sourceModule, 'recognition_runtime');
    assert.equal(item.sourceId, 'digest-abc');
    assert.equal(item.payload.algorithm, proof.algorithm);
    assert.equal(item.payload.signedBy, proof.signedBy);
    assert.equal(item.payload.signedAt, proof.signedAt);
    assert.equal(item.payload.digest, proof.digest);
    assert.equal(item.payload.recognitionDecisionId, 'recognition-decision-1');
  });

  it('3. mapRecognitionDecisionToItem does not re-evaluate recognition: payload/sourceId are identical across fresh contexts for the same decision', () => {
    const decision = makeDecision();
    const itemA = mapRecognitionDecisionToItem(createExportRuntimeContext(NOW), decision);
    const itemB = mapRecognitionDecisionToItem(createExportRuntimeContext(NOW), decision);

    assert.deepEqual(itemA.payload, itemB.payload);
    assert.equal(itemA.payloadHash, itemB.payloadHash);
    assert.equal(itemA.sourceId, itemB.sourceId);
    assert.equal(itemA.type, itemB.type);
  });

  it('4. mapRecognitionDecisionToItem preserves a deny/revoked decision verbatim, never flipping it to allowed', () => {
    const ctx = createExportRuntimeContext(NOW);
    const decision = makeDecision({ type: 'revoked', recognized: false, reasonCode: 'REVOKED_ACTOR', reason: 'Actor recognition was revoked.' });
    const item = mapRecognitionDecisionToItem(ctx, decision);

    assert.equal(item.payload.type, 'revoked');
    assert.equal(item.payload.recognized, false);
    assert.equal(item.payload.reasonCode, 'REVOKED_ACTOR');
  });
});
