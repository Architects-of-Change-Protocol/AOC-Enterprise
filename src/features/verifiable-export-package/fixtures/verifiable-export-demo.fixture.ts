import type { EnforcementDecision } from '../../action-enforcement/domain/enforcement-decision.js';
import type { EnforcementProof } from '../../action-enforcement/domain/enforcement-proof.js';
import type { ExecutionResult } from '../../action-enforcement/domain/execution-result.js';
import { createExportRuntimeContext, type ExportRuntimeContext } from '../domain/export-runtime-context.js';
import { ExportPackageRuntime, createExportPackageRuntime } from '../services/export-package-runtime.js';
import { buildSummaryTextItem } from '../services/export-package-section-builder.js';
import { mapEnforcementDecisionToItem, mapEnforcementProofToItem, mapExecutionResultToItem } from '../integrations/action-enforcement-export-adapter.js';

export const NOW = '2026-01-05T00:00:00.000Z';
export const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';
export const ENFORCEMENT_REQUEST_ID = 'enforcement-request-demo-001';
export const ENFORCEMENT_DECISION_ID = 'enforcement-decision-demo-001';
export const ENFORCEMENT_PROOF_ID = 'enforcement-proof-demo-001';
export const EXECUTION_RESULT_ID = 'execution-result-demo-001';

export const SAMPLE_ENFORCEMENT_DECISION: EnforcementDecision = {
  id: ENFORCEMENT_DECISION_ID,
  enforcementRequestId: ENFORCEMENT_REQUEST_ID,
  type: 'execute_allowed',
  allowedToExecute: true,
  reasonCode: 'RECOGNIZED_AND_AUTHORIZED',
  reason: 'The actor is recognized and authorized to perform this action.',
  idempotencyKey: 'demo-idempotency-key-001',
  decidedAt: NOW,
  policyResults: [],
};

export const SAMPLE_ENFORCEMENT_PROOF: EnforcementProof = {
  id: ENFORCEMENT_PROOF_ID,
  enforcementRequestId: ENFORCEMENT_REQUEST_ID,
  enforcementDecisionId: ENFORCEMENT_DECISION_ID,
  executionResultId: EXECUTION_RESULT_ID,
  trustDomainId: TRUST_DOMAIN_ID,
  actorId: 'actor-pmfreak-closure-agent',
  action: 'read_project_summary',
  resourceScope: 'project:HMP-14665',
  allowedToExecute: true,
  executed: true,
  sideEffectIds: [],
  proofHash: 'demo-enforcement-proof-hash',
  createdAt: NOW,
};

export const SAMPLE_EXECUTION_RESULT: ExecutionResult = {
  id: EXECUTION_RESULT_ID,
  enforcementRequestId: ENFORCEMENT_REQUEST_ID,
  enforcementDecisionId: ENFORCEMENT_DECISION_ID,
  status: 'executed',
  executed: true,
  startedAt: NOW,
  completedAt: NOW,
};

export interface VerifiableExportDemoFixture {
  readonly ctx: ExportRuntimeContext;
  readonly runtime: ExportPackageRuntime;
  readonly packageId: string;
}

/**
 * Builds a deterministic ExportPackageRuntime seeded with one sealed and
 * verified `decision_packet` package, built from literal objects that
 * conform exactly to the real Action Enforcement domain contracts (never a
 * loosened or partial shape). Useful as a ready-made sample for unit tests
 * that don't need to compose with another feature's own runtime.
 */
export function buildVerifiableExportDemoFixture(): VerifiableExportDemoFixture {
  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);

  const enforcementDecisionItem = mapEnforcementDecisionToItem(ctx, SAMPLE_ENFORCEMENT_DECISION);
  const enforcementProofItem = mapEnforcementProofToItem(ctx, SAMPLE_ENFORCEMENT_PROOF);
  const executionResultItem = mapExecutionResultToItem(ctx, SAMPLE_EXECUTION_RESULT);

  const { pkg } = runtime.createDecisionPacket({
    title: 'Decision packet: read_project_summary',
    description: 'Complete verifiable decision packet for a low-risk, executed read action.',
    trustDomainId: TRUST_DOMAIN_ID,
    targetType: 'enforcement_decision',
    targetId: ENFORCEMENT_DECISION_ID,
    sections: [
      {
        type: 'summary',
        required: true,
        items: [buildSummaryTextItem(ctx, 'read_project_summary was recognized, authorized, allowed to execute, and executed.')],
      },
      { type: 'enforcement', required: true, items: [enforcementDecisionItem, enforcementProofItem] },
      { type: 'execution', required: false, items: [executionResultItem] },
    ],
  });

  runtime.sealPackage(pkg.id);
  runtime.verifyPackage(pkg.id);

  return { ctx, runtime, packageId: pkg.id };
}
