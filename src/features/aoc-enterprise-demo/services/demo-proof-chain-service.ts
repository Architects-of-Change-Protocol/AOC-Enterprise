import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoProofChain, DemoProofChainSource } from '../domain/demo-proof-chain.js';
import type { EnterpriseDemoWorld } from '../fixtures/enterprise-demo-world.fixture.js';
import type { ScenarioExecutionResult } from '../scenarios/scenario-runtime-types.js';

const ALL_SOURCES: readonly DemoProofChainSource[] = ['recognition', 'authority', 'approval', 'handshake', 'enforcement'];

/**
 * Builds the DemoProofChain for a scenario run by walking the final real
 * EnforcementProof's own reference ids (recognitionDecisionId,
 * authorityProofId, approvalProofId, handshakeProofId) and resolving each one
 * against its owning runtime's real store. A source only appears in the
 * chain if the enforcement decision actually depended on it; a source is
 * only "missing" if the decision referenced it but the runtime could not
 * resolve it.
 */
export class DemoProofChainService {
  buildProofChain(scenario: DemoScenario, world: EnterpriseDemoWorld, result: ScenarioExecutionResult): DemoProofChain {
    const scenarioId = scenario.id;
    const finalOutcome = result.enforcementOutcomes[result.enforcementOutcomes.length - 1];

    if (finalOutcome === undefined || finalOutcome.proof === undefined) {
      return {
        id: `proof-chain-${scenarioId}`,
        scenarioId,
        complete: false,
        proofIds: [],
        proofHashes: [],
        sources: [],
        missingSources: ['enforcement'],
      };
    }

    const proof = finalOutcome.proof;
    const proofIds: string[] = [proof.id];
    const proofHashes: string[] = [proof.proofHash];
    const sources: DemoProofChainSource[] = ['enforcement'];
    const missingSources: DemoProofChainSource[] = [];
    const trustDomainId = world.trustDomainId;

    if (finalOutcome.decision.recognitionDecisionId !== undefined) {
      const auditEvent = world.fixture.recognitionRuntime
        .getAuditTrail({ trustDomainId })
        .find((event) => event.eventType === 'recognition_decision' && event.decisionId === finalOutcome.decision.recognitionDecisionId);
      if (auditEvent !== undefined) {
        proofIds.push(`proof-recognition-decision-${finalOutcome.decision.recognitionDecisionId}`);
        proofHashes.push(auditEvent.eventHash);
        sources.push('recognition');
      } else {
        missingSources.push('recognition');
      }
    }

    if (finalOutcome.decision.authorityProofId !== undefined) {
      const authorityProof = world.fixture.authorityRuntime.proofService.getAllProofs().find((p) => p.id === finalOutcome.decision.authorityProofId);
      if (authorityProof !== undefined) {
        proofIds.push(authorityProof.id);
        proofHashes.push(authorityProof.proofHash);
        sources.push('authority');
      } else {
        missingSources.push('authority');
      }
    }

    if (finalOutcome.decision.approvalProofId !== undefined) {
      const approvalRequestId = finalOutcome.decision.approvalRequestId;
      const approvalProof =
        approvalRequestId !== undefined
          ? world.fixture.approvalRuntime.store.getProofsByRequestId(approvalRequestId).find((p) => p.id === finalOutcome.decision.approvalProofId)
          : undefined;
      if (approvalProof !== undefined) {
        proofIds.push(approvalProof.id);
        proofHashes.push(approvalProof.proofHash);
        sources.push('approval');
      } else {
        missingSources.push('approval');
      }
    }

    if (finalOutcome.decision.handshakeProofId !== undefined) {
      const handshakeProof = world.fixture.handshakeRuntime.store.getHandshakeProof(finalOutcome.decision.handshakeProofId);
      if (handshakeProof !== undefined) {
        proofIds.push(handshakeProof.id);
        proofHashes.push(handshakeProof.proofHash);
        sources.push('handshake');
      } else {
        missingSources.push('handshake');
      }
    }

    return {
      id: `proof-chain-${scenarioId}`,
      scenarioId,
      complete: missingSources.length === 0,
      proofIds,
      proofHashes,
      sources,
      missingSources,
    };
  }
}

export function createDemoProofChainService(): DemoProofChainService {
  return new DemoProofChainService();
}

export { ALL_SOURCES as ALL_DEMO_PROOF_CHAIN_SOURCES };
