import type { ProofChainRow, ProofReferenceRow } from '../domain/control-plane-proof-reference.js';
import type { AocGovernanceSource } from '../domain/control-plane-navigation.js';
import type { EnforcementProofRow } from '../domain/control-plane-view-model.js';
import type { PolicyProofRow } from '../domain/policy-pack-view-model.js';

function compareProofReferences(a: ProofReferenceRow, b: ProofReferenceRow): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Projects PolicyProofRows -- proofs Domain Policy Pack Runtime itself already created -- into the same ProofReferenceRow shape every other governance source uses. */
export function policyProofReferences(proofs: readonly PolicyProofRow[]): ProofReferenceRow[] {
  return proofs
    .map((proof) => ({
      id: proof.id,
      source: 'policy' as AocGovernanceSource,
      proofHash: proof.proofHash,
      ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
      decisionId: proof.decisionId,
      actorId: proof.actorId,
      action: proof.action,
      resourceScope: proof.resourceScope,
      createdAt: proof.createdAt,
    }))
    .sort(compareProofReferences);
}

/**
 * Builds one ProofChainRow per EnforcementProof that carries a
 * `policyProofId` -- i.e. every enforcement decision whose preflight
 * actually consulted a policy pack. The chain is `complete` only when the
 * referenced PolicyProofRow was actually found in the policy pack read
 * model; an EnforcementProof pointing at a policy proof id the runtime never
 * produced yields an `incomplete` chain rather than a silently-dropped link.
 */
export function buildPolicyProofChains(enforcementProofs: readonly EnforcementProofRow[], policyProofsById: ReadonlyMap<string, PolicyProofRow>): ProofChainRow[] {
  const chains: ProofChainRow[] = [];
  for (const enforcementProof of enforcementProofs) {
    if (enforcementProof.policyProofId === undefined) continue;

    const policyProof = policyProofsById.get(enforcementProof.policyProofId);
    const proofIds = [enforcementProof.id, enforcementProof.policyProofId];
    const sources: AocGovernanceSource[] = ['enforcement', 'policy'];

    chains.push({
      id: `policy-proof-chain-${enforcementProof.enforcementRequestId}`,
      title: `Policy-aware enforcement proof ${enforcementProof.enforcementRequestId}`,
      proofIds,
      sources,
      complete: policyProof !== undefined,
    });
  }
  return chains.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
