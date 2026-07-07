import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { createEvidenceRuntime, type EvidenceRuntime } from '../services/evidence-runtime.js';
import type { EvidenceRequirement } from '../domain/evidence-requirement.js';
import {
  createActionEnforcementEvidenceIntegration,
  type ActionEnforcementEvidenceIntegration,
} from '../integrations/action-enforcement-evidence-integration.js';

export const NOW = '2026-01-04T00:00:00.000Z';
export const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';
export const ACTOR_ID = 'actor-pmfreak-closure-agent';
export const PREPARE_INVOICE_SUPPORT_ACTION = 'prepare_invoice_support';
export const ENFORCEMENT_DECISION_ID = 'enforcement-decision-invoice-support-001';

export interface EnforcementEvidenceDemoFixture {
  readonly runtime: EvidenceRuntime;
  readonly integration: ActionEnforcementEvidenceIntegration;
  readonly requirement: EvidenceRequirement;
}

/**
 * Composes a sample Action Enforcement `evidence_required` outcome
 * (src/features/action-enforcement/policies/evidence-required-policy.ts)
 * with the Evidence / Source / Citation Runtime, via the
 * action-enforcement-evidence-integration structural adapter.
 */
export function buildEnforcementEvidenceDemoFixture(): EnforcementEvidenceDemoFixture {
  const ctx = createEvidenceRuntimeContext(NOW);
  const runtime = createEvidenceRuntime(ctx);
  const integration = createActionEnforcementEvidenceIntegration(runtime);

  const requirement = integration.mapEvidenceRequiredDecision({
    trustDomainId: TRUST_DOMAIN_ID,
    enforcementDecisionId: ENFORCEMENT_DECISION_ID,
    actorId: ACTOR_ID,
    action: PREPARE_INVOICE_SUPPORT_ACTION,
    type: 'invoice',
    description: 'This action requires invoice evidence before it can execute.',
  });

  return { runtime, integration, requirement };
}
