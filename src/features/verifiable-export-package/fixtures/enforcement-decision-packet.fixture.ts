import {
  buildPolicyPackEnforcementFixture,
  type PolicyPackEnforcementFixture,
} from '../../action-enforcement/fixtures/policy-pack-enforcement.fixture.js';
import { buildDraftClosureEmailGuardInput } from '../../action-enforcement/fixtures/allowed-action.fixture.js';
import type { EnforcementOutcome } from '../../action-enforcement/domain/enforcement-outcome.js';
import { createExportRuntimeContext, type ExportRuntimeContext } from '../domain/export-runtime-context.js';
import { ExportPackageRuntime, createExportPackageRuntime } from '../services/export-package-runtime.js';
import { buildSummaryTextItem } from '../services/export-package-section-builder.js';
import {
  mapEnforcementDecisionToItem,
  mapEnforcementProofToItem,
  mapExecutionResultToItem,
  mapEnforcementEventToItem,
} from '../integrations/action-enforcement-export-adapter.js';

export const NOW = '2026-01-07T00:00:00.000Z';

export interface EnforcementDecisionPacketFixture {
  readonly enforcementFixture: PolicyPackEnforcementFixture;
  readonly outcome: EnforcementOutcome;
  readonly ctx: ExportRuntimeContext;
  readonly runtime: ExportPackageRuntime;
  readonly packageId: string;
}

/**
 * Composes a real Action Enforcement allow-and-execute outcome (recognition
 * and authority both real, no policy pack blocking) with its enforcement
 * proof, execution result, and event trail, into one enforcement decision
 * packet. Never re-runs the executor and never changes the recorded
 * execution status.
 */
export async function buildEnforcementDecisionPacketFixture(): Promise<EnforcementDecisionPacketFixture> {
  const enforcementFixture = buildPolicyPackEnforcementFixture();
  const outcome = await enforcementFixture.aocGuard.enforce(buildDraftClosureEmailGuardInput(), () => 'closure email drafted');

  if (outcome.proof === undefined) {
    throw new Error('Expected an enforcement proof for an allowed, executed action.');
  }

  const events = enforcementFixture.enforcementRuntime.getEnforcementTrail(outcome.request.id);

  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);

  const { pkg } = runtime.createEnforcementDecisionPacket({
    title: `Enforcement decision packet: ${outcome.request.action}`,
    description: 'Complete verifiable decision packet for an allowed, executed enforcement decision.',
    trustDomainId: outcome.request.trustDomainId,
    targetType: 'enforcement_decision',
    targetId: outcome.decision.id,
    sections: [
      { type: 'summary', required: true, items: [buildSummaryTextItem(ctx, `${outcome.request.action} was allowed and executed: ${outcome.decision.reason}`)] },
      { type: 'enforcement', required: true, items: [mapEnforcementDecisionToItem(ctx, outcome.decision), mapEnforcementProofToItem(ctx, outcome.proof)] },
      { type: 'execution', required: false, items: [mapExecutionResultToItem(ctx, outcome.result)] },
      { type: 'events', required: false, items: events.map((event) => mapEnforcementEventToItem(ctx, event)) },
    ],
  });

  runtime.sealPackage(pkg.id);
  runtime.verifyPackage(pkg.id);

  return { enforcementFixture, outcome, ctx, runtime, packageId: pkg.id };
}
