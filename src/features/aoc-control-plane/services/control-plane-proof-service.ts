import type { ProofChainRow, ProofReferenceRow } from '../domain/control-plane-proof-reference.js';
import type {
  ApprovalViewModel,
  AuthorityViewModel,
  EnforcementViewModel,
  ProofsViewModel,
  RecognitionViewModel,
} from '../domain/control-plane-view-model.js';
import type { AocGovernanceSource } from '../domain/control-plane-navigation.js';

export interface HandshakeProofSource {
  readonly id: string;
  readonly handshakeRequestId: string;
  readonly proofHash: string;
  readonly previousHash?: string;
  readonly createdAt: string;
}

export interface ControlPlaneProofInput {
  readonly recognition: RecognitionViewModel;
  readonly authority: AuthorityViewModel;
  readonly approvals: ApprovalViewModel;
  readonly enforcement: EnforcementViewModel;
  readonly handshakeProofs: readonly HandshakeProofSource[];
}

function compareProofReferences(a: ProofReferenceRow, b: ProofReferenceRow): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function recognitionProofReferences(recognition: RecognitionViewModel): ProofReferenceRow[] {
  const fromPassports: ProofReferenceRow[] = recognition.passports
    .filter((p): p is typeof p & { passportHash: string } => p.passportHash !== undefined)
    .map((p) => ({ id: `proof-passport-${p.id}`, source: 'recognition', proofHash: p.passportHash, actorId: p.actorId, createdAt: p.issuedAt }));
  const fromTokens: ProofReferenceRow[] = recognition.capabilityTokens
    .filter((t): t is typeof t & { tokenHash: string } => t.tokenHash !== undefined)
    .map((t) => ({ id: `proof-capability-token-${t.id}`, source: 'recognition', proofHash: t.tokenHash, actorId: t.subjectActorId, createdAt: t.issuedAt }));
  const fromDecisions: ProofReferenceRow[] = recognition.decisions.map((decision) => {
    const auditEvent = recognition.auditEvents.find((event) => event.id === decision.auditEventId);
    return {
      id: `proof-recognition-decision-${decision.id}`,
      source: 'recognition' as AocGovernanceSource,
      proofHash: auditEvent?.eventHash ?? decision.auditEventId,
      ...(auditEvent?.previousHash !== undefined ? { previousHash: auditEvent.previousHash } : {}),
      decisionId: decision.id,
      requestId: decision.requestId,
      actorId: decision.actorId,
      createdAt: decision.evaluatedAt,
    };
  });
  return [...fromPassports, ...fromTokens, ...fromDecisions].sort(compareProofReferences);
}

function authorityProofReferences(authority: AuthorityViewModel): ProofReferenceRow[] {
  return authority.proofs
    .map((proof) => ({
      id: proof.id,
      source: 'authority' as AocGovernanceSource,
      proofHash: proof.proofHash,
      ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
      decisionId: proof.authorityDecisionId,
      requestId: proof.requestId,
      actorId: proof.actorId,
      createdAt: proof.createdAt,
    }))
    .sort(compareProofReferences);
}

function approvalProofReferences(approvals: ApprovalViewModel): ProofReferenceRow[] {
  return approvals.proofs
    .map((proof) => ({
      id: proof.id,
      source: 'approval' as AocGovernanceSource,
      proofHash: proof.proofHash,
      ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
      decisionId: proof.approvalDecisionId,
      requestId: proof.approvalRequestId,
      createdAt: proof.createdAt,
    }))
    .sort(compareProofReferences);
}

function handshakeProofReferences(handshakeProofs: readonly HandshakeProofSource[]): ProofReferenceRow[] {
  return handshakeProofs
    .map((proof) => ({
      id: proof.id,
      source: 'handshake' as AocGovernanceSource,
      proofHash: proof.proofHash,
      ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
      requestId: proof.handshakeRequestId,
      createdAt: proof.createdAt,
    }))
    .sort(compareProofReferences);
}

function enforcementProofReferences(enforcement: EnforcementViewModel): ProofReferenceRow[] {
  return enforcement.proofs
    .map((proof) => ({
      id: proof.id,
      source: 'enforcement' as AocGovernanceSource,
      proofHash: proof.proofHash,
      ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
      decisionId: proof.enforcementDecisionId,
      requestId: proof.enforcementRequestId,
      createdAt: proof.createdAt,
    }))
    .sort(compareProofReferences);
}

/**
 * Builds one ProofChainRow per enforcement proof, walking enforcement ->
 * recognition -> authority / approval / handshake via the id fields the
 * enforcement proof already carries. A chain is "complete" only when every
 * upstream proof id the enforcement decision referenced was actually found.
 */
function buildProofChains(enforcement: EnforcementViewModel, allProofsById: ReadonlyMap<string, ProofReferenceRow>): ProofChainRow[] {
  return enforcement.proofs.map((enforcementProof) => {
    const proofIds: string[] = [enforcementProof.id];
    const sources: AocGovernanceSource[] = ['enforcement'];
    let complete = true;

    if (enforcementProof.recognitionDecisionId !== undefined) {
      const found = [...allProofsById.values()].find((p) => p.source === 'recognition' && p.decisionId === enforcementProof.recognitionDecisionId);
      if (found) {
        proofIds.push(found.id);
        sources.push('recognition');
      } else {
        complete = false;
      }
    }
    if (enforcementProof.authorityProofId !== undefined) {
      if (allProofsById.has(enforcementProof.authorityProofId)) {
        proofIds.push(enforcementProof.authorityProofId);
        sources.push('authority');
      } else {
        complete = false;
      }
    }
    if (enforcementProof.approvalProofId !== undefined) {
      if (allProofsById.has(enforcementProof.approvalProofId)) {
        proofIds.push(enforcementProof.approvalProofId);
        sources.push('approval');
      } else {
        complete = false;
      }
    }
    if (enforcementProof.handshakeProofId !== undefined) {
      if (allProofsById.has(enforcementProof.handshakeProofId)) {
        proofIds.push(enforcementProof.handshakeProofId);
        sources.push('handshake');
      } else {
        complete = false;
      }
    }

    return {
      id: `proof-chain-${enforcementProof.enforcementRequestId}`,
      title: `Enforcement request ${enforcementProof.enforcementRequestId}`,
      proofIds,
      sources,
      complete,
    };
  });
}

export function buildProofsViewModel(input: ControlPlaneProofInput): ProofsViewModel {
  const recognitionProofs = recognitionProofReferences(input.recognition);
  const authorityProofs = authorityProofReferences(input.authority);
  const approvalProofs = approvalProofReferences(input.approvals);
  const handshakeProofs = handshakeProofReferences(input.handshakeProofs);
  const enforcementProofs = enforcementProofReferences(input.enforcement);

  const allProofsById = new Map<string, ProofReferenceRow>();
  for (const proof of [...recognitionProofs, ...authorityProofs, ...approvalProofs, ...handshakeProofs, ...enforcementProofs]) {
    allProofsById.set(proof.id, proof);
  }

  return {
    recognitionProofs,
    authorityProofs,
    approvalProofs,
    handshakeProofs,
    enforcementProofs,
    proofChains: buildProofChains(input.enforcement, allProofsById),
  };
}
