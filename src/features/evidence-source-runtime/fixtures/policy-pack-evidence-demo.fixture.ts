import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { createEvidenceRuntime, type EvidenceRuntime } from '../services/evidence-runtime.js';
import type { EvidenceArtifact } from '../domain/evidence-artifact.js';
import {
  createPolicyPackEvidenceIntegration,
  type PolicyPackEvidenceIntegration,
  type PolicyPackEvidenceRequirementInput,
} from '../integrations/policy-pack-evidence-integration.js';

export const NOW = '2026-01-02T00:00:00.000Z';
export const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';
export const ACTOR_ID = 'actor-pmfreak-closure-agent';
export const PREPARE_INVOICE_SUPPORT_ACTION = 'prepare_invoice_support';
export const POLICY_DECISION_ID = 'policy-decision-procurement-basic-001';
export const POLICY_PACK_VERSION_ID = 'policy-pack-procurement-basic-v1';

/** Mirrors the real requirement from src/features/domain-policy-pack-runtime/packs/procurement-basic.policy-pack.ts (rule `procurement-basic-rule-invoice-support-evidence`). */
export const PROCUREMENT_EVIDENCE_REQUIREMENT = {
  id: 'procurement-basic-evidence-purchase-order',
  type: 'purchase_order',
  description: 'A purchase order or invoice evidencing the transaction must be attached.',
  required: true,
  sourceRuleId: 'procurement-basic-rule-invoice-support-evidence',
} as const;

export interface PolicyPackEvidenceDemoFixture {
  readonly runtime: EvidenceRuntime;
  readonly integration: PolicyPackEvidenceIntegration;
  readonly purchaseOrderEvidence: EvidenceArtifact;
  readonly requirementInput: PolicyPackEvidenceRequirementInput;
}

/**
 * Composes a sample Domain Policy Pack Runtime evidence requirement (the
 * procurement-basic pack's purchase-order requirement) with the Evidence /
 * Source / Citation Runtime, via the policy-pack-evidence-integration
 * structural adapter.
 */
export function buildPolicyPackEvidenceDemoFixture(): PolicyPackEvidenceDemoFixture {
  const ctx = createEvidenceRuntimeContext(NOW);
  const runtime = createEvidenceRuntime(ctx);
  const integration = createPolicyPackEvidenceIntegration(runtime);

  const purchaseOrderEvidence = runtime.submitEvidenceArtifact({
    id: 'evidence-artifact-procurement-purchase-order-001',
    type: 'purchase_order',
    title: 'Purchase order evidence for procurement-basic demo',
    trustDomainId: TRUST_DOMAIN_ID,
    submittedByActorId: ACTOR_ID,
  });
  runtime.evidenceArtifacts.accept(purchaseOrderEvidence.id, ACTOR_ID);

  const requirementInput: PolicyPackEvidenceRequirementInput = {
    trustDomainId: TRUST_DOMAIN_ID,
    policyDecisionId: POLICY_DECISION_ID,
    policyPackVersionId: POLICY_PACK_VERSION_ID,
    actorId: ACTOR_ID,
    action: PREPARE_INVOICE_SUPPORT_ACTION,
    requirements: [PROCUREMENT_EVIDENCE_REQUIREMENT],
  };

  return { runtime, integration, purchaseOrderEvidence, requirementInput };
}
