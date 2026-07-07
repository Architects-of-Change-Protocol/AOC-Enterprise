import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import { createExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import { resolveReferences } from '../services/export-package-reference-resolver.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeItem(
  id: string,
  type: ExportPackageItemType,
  sourceModule: ExportPackageItemSourceModule,
  sourceId: string,
  payload: Record<string, unknown> = {},
): ExportPackageItem {
  return {
    id,
    type,
    sourceModule,
    sourceId,
    title: `Item ${id}`,
    summary: `Summary for ${id}`,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: NOW,
  };
}

describe('resolveReferences', () => {
  it('1. creates a verifies reference from a policy_proof to the policy_decision it verifies', () => {
    const ctx = createExportRuntimeContext(NOW);
    const decision = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'policy-decision-1');
    const proof = makeItem('item-2', 'policy_proof', 'domain_policy_pack_runtime', 'policy-proof-1', { decisionId: 'policy-decision-1' });
    const result = resolveReferences(ctx, [decision, proof]);
    assert.equal(result.references.length, 1);
    assert.equal(result.references[0]?.type, 'verifies');
    assert.equal(result.references[0]?.fromItemId, 'item-2');
    assert.equal(result.references[0]?.toItemId, 'item-1');
    assert.equal(result.references[0]?.reasonCode, 'POLICY_PROOF_VERIFIES_DECISION');
  });

  it('2. creates a requires reference from an enforcement_decision to the policy_proof it requires', () => {
    const ctx = createExportRuntimeContext(NOW);
    const proof = makeItem('item-1', 'policy_proof', 'domain_policy_pack_runtime', 'policy-proof-1');
    const decision = makeItem('item-2', 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', { policyProofId: 'policy-proof-1' });
    const result = resolveReferences(ctx, [proof, decision]);
    assert.equal(result.references.length, 1);
    assert.equal(result.references[0]?.type, 'requires');
    assert.equal(result.references[0]?.fromItemId, 'item-2');
    assert.equal(result.references[0]?.toItemId, 'item-1');
    assert.equal(result.references[0]?.reasonCode, 'ENFORCEMENT_REQUIRES_POLICY_PROOF');
  });

  it('3. creates a supports reference from an evidence_proof to the item it targets', () => {
    const ctx = createExportRuntimeContext(NOW);
    const target = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'policy-decision-1');
    const evidenceProof = makeItem('item-2', 'evidence_proof', 'evidence_source_runtime', 'evidence-proof-1', { targetId: 'policy-decision-1' });
    const result = resolveReferences(ctx, [target, evidenceProof]);
    assert.equal(result.references.length, 1);
    assert.equal(result.references[0]?.type, 'supports');
    assert.equal(result.references[0]?.fromItemId, 'item-2');
    assert.equal(result.references[0]?.toItemId, 'item-1');
    assert.equal(result.references[0]?.reasonCode, 'EVIDENCE_PROOF_SUPPORTS_TARGET');
  });

  it('4. creates a verifies reference from an approval_proof to the approval_decision it verifies', () => {
    const ctx = createExportRuntimeContext(NOW);
    const decision = makeItem('item-1', 'approval_decision', 'approval_runtime', 'approval-decision-1');
    const proof = makeItem('item-2', 'approval_proof', 'approval_runtime', 'approval-proof-1', { approvalDecisionId: 'approval-decision-1' });
    const result = resolveReferences(ctx, [decision, proof]);
    assert.equal(result.references.length, 1);
    assert.equal(result.references[0]?.type, 'verifies');
    assert.equal(result.references[0]?.fromItemId, 'item-2');
    assert.equal(result.references[0]?.toItemId, 'item-1');
    assert.equal(result.references[0]?.reasonCode, 'APPROVAL_PROOF_VERIFIES_DECISION');
  });

  it('5. creates a requires reference from an enforcement_decision to the authority_proof it requires', () => {
    const ctx = createExportRuntimeContext(NOW);
    const authorityProof = makeItem('item-1', 'authority_proof', 'authority_graph', 'authority-proof-1');
    const decision = makeItem('item-2', 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', { authorityProofId: 'authority-proof-1' });
    const result = resolveReferences(ctx, [authorityProof, decision]);
    assert.equal(result.references.length, 1);
    assert.equal(result.references[0]?.type, 'requires');
    assert.equal(result.references[0]?.fromItemId, 'item-2');
    assert.equal(result.references[0]?.toItemId, 'item-1');
    assert.equal(result.references[0]?.reasonCode, 'ENFORCEMENT_REQUIRES_AUTHORITY_PROOF');
  });

  it('6. creates an includes reference from an enforcement_proof to the execution_result it includes', () => {
    const ctx = createExportRuntimeContext(NOW);
    const executionResult = makeItem('item-1', 'execution_result', 'action_enforcement', 'execution-result-1');
    const enforcementProof = makeItem('item-2', 'enforcement_proof', 'action_enforcement', 'enforcement-proof-1', { executionResultId: 'execution-result-1' });
    const result = resolveReferences(ctx, [executionResult, enforcementProof]);
    assert.equal(result.references.length, 1);
    assert.equal(result.references[0]?.type, 'includes');
    assert.equal(result.references[0]?.fromItemId, 'item-2');
    assert.equal(result.references[0]?.toItemId, 'item-1');
    assert.equal(result.references[0]?.reasonCode, 'ENFORCEMENT_PROOF_INCLUDES_EXECUTION_RESULT');
  });

  it('7. reports an unmatched referenced sourceId in the missing array instead of creating a reference', () => {
    const ctx = createExportRuntimeContext(NOW);
    const evidenceProof = makeItem('item-1', 'evidence_proof', 'evidence_source_runtime', 'evidence-proof-1', { targetId: 'nonexistent-source' });
    const result = resolveReferences(ctx, [evidenceProof]);
    assert.equal(result.references.length, 0);
    assert.equal(result.missing.length, 1);
    assert.deepEqual(result.missing[0], {
      fromItemId: 'item-1',
      field: 'targetId',
      targetSourceId: 'nonexistent-source',
      reasonCode: 'EVIDENCE_PROOF_SUPPORTS_TARGET',
    });
  });

  it('8. resolveReferences is deterministic across fresh contexts with the same items', () => {
    const decision = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'policy-decision-1');
    const proof = makeItem('item-2', 'policy_proof', 'domain_policy_pack_runtime', 'policy-proof-1', { decisionId: 'policy-decision-1' });
    const items = [decision, proof];

    const resultA = resolveReferences(createExportRuntimeContext(NOW), items);
    const resultB = resolveReferences(createExportRuntimeContext(NOW), items);

    assert.deepEqual(resultA.references, resultB.references);
    assert.deepEqual(resultA.missing, resultB.missing);
  });
});
