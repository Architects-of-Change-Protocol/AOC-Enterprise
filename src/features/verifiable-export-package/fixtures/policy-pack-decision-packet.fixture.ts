import {
  buildPolicyPackEnforcementFixture,
  buildApprovePaymentRequiresFinanceReviewInput,
  type PolicyPackEnforcementFixture,
} from '../../action-enforcement/fixtures/policy-pack-enforcement.fixture.js';
import type { EnforcementOutcome } from '../../action-enforcement/domain/enforcement-outcome.js';
import type { PolicyPackDecision } from '../../domain-policy-pack-runtime/domain/policy-pack-decision.js';
import type { PolicyPackProof } from '../../domain-policy-pack-runtime/domain/policy-pack-proof.js';
import { createEvidenceRuntimeContext } from '../../evidence-source-runtime/domain/evidence-runtime-context.js';
import { createEvidenceRuntime, type EvidenceRuntime } from '../../evidence-source-runtime/services/evidence-runtime.js';
import type { EvidenceProof } from '../../evidence-source-runtime/domain/evidence-proof.js';
import { createExportRuntimeContext, type ExportRuntimeContext } from '../domain/export-runtime-context.js';
import { ExportPackageRuntime, createExportPackageRuntime } from '../services/export-package-runtime.js';
import { mapPolicyDecisionToItem, mapPolicyProofToItem } from '../integrations/policy-pack-export-adapter.js';
import { mapEnforcementDecisionToItem } from '../integrations/action-enforcement-export-adapter.js';
import { mapEvidenceProofToItem } from '../integrations/evidence-export-adapter.js';

export const NOW = '2026-01-06T00:00:00.000Z';
export const EVIDENCE_NOW = '2026-01-06T00:00:00.000Z';

export interface PolicyPackDecisionPacketFixture {
  readonly enforcementFixture: PolicyPackEnforcementFixture;
  readonly evidenceRuntime: EvidenceRuntime;
  readonly outcome: EnforcementOutcome;
  readonly policyDecision: PolicyPackDecision;
  readonly policyProof: PolicyPackProof;
  readonly evidenceProof: EvidenceProof;
  readonly ctx: ExportRuntimeContext;
  readonly runtime: ExportPackageRuntime;
  readonly packageId: string;
}

/**
 * Composes a real Domain Policy Pack Runtime decision/proof (via Action
 * Enforcement's policy-pack-configured guard, running the real
 * payments-basic finance-review rule) with a real Evidence / Source /
 * Citation Runtime proof, into one policy decision packet. Nothing here
 * re-evaluates the policy or fabricates a decision -- every included fact
 * comes from a real runtime call.
 */
export async function buildPolicyPackDecisionPacketFixture(): Promise<PolicyPackDecisionPacketFixture> {
  const enforcementFixture = buildPolicyPackEnforcementFixture();
  const outcome = await enforcementFixture.policyPackAocGuard.enforce(buildApprovePaymentRequiresFinanceReviewInput(), () => 'payment approved');

  const policyDecisionId = outcome.decision.policyDecisionId;
  const policyProofId = outcome.decision.policyProofId;
  if (policyDecisionId === undefined || policyProofId === undefined) {
    throw new Error('Expected the payments-basic policy pack to produce a policy decision and proof for approve_payment.');
  }
  const policyDecision = enforcementFixture.policyPackRuntime.getPolicyPackDecision(policyDecisionId);
  const policyProof = enforcementFixture.policyPackRuntime.getPolicyPackProof(policyProofId);

  const evidenceCtx = createEvidenceRuntimeContext(EVIDENCE_NOW);
  const evidenceRuntime = createEvidenceRuntime(evidenceCtx);
  const evidenceProof = evidenceRuntime.createEvidenceProof({
    trustDomainId: outcome.request.trustDomainId,
    targetType: 'policy_decision',
    targetId: policyDecision.id,
  });

  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);

  const { pkg } = runtime.createPolicyDecisionPacket({
    title: `Policy decision packet: ${outcome.request.action}`,
    description: 'Complete verifiable decision packet for a policy-pack-blocked payment approval.',
    trustDomainId: outcome.request.trustDomainId,
    targetType: 'policy_decision',
    targetId: policyDecision.id,
    sections: [
      { type: 'summary', required: true, items: [] },
      { type: 'policy', required: true, items: [mapPolicyDecisionToItem(ctx, policyDecision), mapPolicyProofToItem(ctx, policyProof)] },
      { type: 'enforcement', required: false, items: [mapEnforcementDecisionToItem(ctx, outcome.decision)] },
      { type: 'evidence', required: false, items: [mapEvidenceProofToItem(ctx, evidenceProof)] },
    ],
  });

  runtime.sealPackage(pkg.id);
  runtime.verifyPackage(pkg.id);

  return { enforcementFixture, evidenceRuntime, outcome, policyDecision, policyProof, evidenceProof, ctx, runtime, packageId: pkg.id };
}
