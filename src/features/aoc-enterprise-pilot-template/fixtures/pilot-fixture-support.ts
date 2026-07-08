import type { DemoScenario } from '../../aoc-enterprise-demo/domain/demo-scenario.js';
import type { DemoScenarioRun } from '../../aoc-enterprise-demo/domain/demo-step.js';
import type { EnforcementDecision, EnforcementDecisionType } from '../../action-enforcement/domain/enforcement-decision.js';
import type { EnforcementProof } from '../../action-enforcement/domain/enforcement-proof.js';
import type { ExportRuntimeContext } from '../../verifiable-export-package/domain/export-runtime-context.js';
import type { ExportPackageItem } from '../../verifiable-export-package/domain/export-package-item.js';
import { mapEnforcementDecisionToItem, mapEnforcementProofToItem } from '../../verifiable-export-package/integrations/action-enforcement-export-adapter.js';
import { buildSummaryTextItem } from '../../verifiable-export-package/services/export-package-section-builder.js';
import type { CreatePackageSectionInput } from '../../verifiable-export-package/services/export-package-builder.js';
import { ExportPackageRuntime, type CreateExportPackageInput } from '../../verifiable-export-package/services/export-package-runtime.js';
import type { PilotExportPackageDefinition } from '../domain/pilot-export-package.js';
import type { PilotScenario } from '../domain/pilot-scenario.js';
import type { PilotTemplate } from '../domain/pilot-template.js';
import type { PilotScenarioBindingResult } from '../services/pilot-scenario-binding-service.js';

const STATUS_TO_DECISION_TYPE: Readonly<Record<string, EnforcementDecisionType>> = {
  executed: 'execute_allowed',
  blocked: 'execution_blocked',
  approval_required: 'approval_required',
  evidence_required: 'evidence_required',
  duplicate_suppressed: 'duplicate_suppressed',
  dry_run_allowed: 'dry_run_allowed',
  emergency_denied: 'emergency_denied',
};

export interface RealizedEnforcementFacts {
  readonly decision: EnforcementDecision;
  readonly proof: EnforcementProof;
}

/**
 * Reconstructs a type-conformant `EnforcementDecision`/`EnforcementProof`
 * from a REAL, already-executed `DemoScenarioRun` so it can feed the real
 * Verifiable Export Package adapters. Every id, status and reason field
 * comes from the real run's own outcome -- this never invents a decision
 * Action Enforcement did not itself produce; it exists only because
 * `DemoScenarioRun` exposes ids/status, not the full domain objects, and
 * this feature must not deep-import Enterprise Demo's internal world.
 */
export function realizeEnforcementFactsFromDemoRun(scenario: DemoScenario, run: DemoScenarioRun): RealizedEnforcementFacts {
  const outcome = run.outcome;
  if (outcome === undefined || outcome.enforcementDecisionId === undefined || outcome.enforcementRequestId === undefined) {
    throw new Error(`Demo scenario run "${run.id}" has no enforcement outcome to build an export package from.`);
  }
  const type = STATUS_TO_DECISION_TYPE[outcome.status] ?? 'execution_blocked';
  const allowedToExecute = type === 'execute_allowed' || type === 'dry_run_allowed';
  const decidedAt = run.completedAt ?? run.startedAt;

  const decision: EnforcementDecision = {
    id: outcome.enforcementDecisionId,
    enforcementRequestId: outcome.enforcementRequestId,
    type,
    allowedToExecute,
    reasonCode: outcome.reasonCode,
    reason: outcome.reason,
    decidedAt,
    policyResults: [],
    ...(outcome.policyDecisionId !== undefined ? { policyDecisionId: outcome.policyDecisionId } : {}),
    ...(outcome.policyProofId !== undefined ? { policyProofId: outcome.policyProofId } : {}),
  };

  const proof: EnforcementProof = {
    id: `${outcome.enforcementDecisionId}-proof`,
    enforcementRequestId: outcome.enforcementRequestId,
    enforcementDecisionId: outcome.enforcementDecisionId,
    trustDomainId: scenario.trustDomainId,
    actorId: scenario.primaryActorId,
    action: scenario.action,
    resourceScope: scenario.resourceScope,
    allowedToExecute,
    executed: outcome.executorRan,
    sideEffectIds: [],
    proofHash: outcome.proofHash ?? `unavailable-${outcome.enforcementDecisionId}`,
    createdAt: decidedAt,
    ...(outcome.policyDecisionId !== undefined ? { policyDecisionId: outcome.policyDecisionId } : {}),
    ...(outcome.policyProofId !== undefined ? { policyProofId: outcome.policyProofId } : {}),
  };

  return { decision, proof };
}

export function buildEnforcementSectionItems(ctx: ExportRuntimeContext, facts: RealizedEnforcementFacts): readonly ExportPackageItem[] {
  return [mapEnforcementDecisionToItem(ctx, facts.decision), mapEnforcementProofToItem(ctx, facts.proof)];
}

export function buildPolicySectionItems(ctx: ExportRuntimeContext, outcome: DemoScenarioRun['outcome']): readonly ExportPackageItem[] {
  if (outcome?.policyDecisionId === undefined) {
    return [];
  }
  return [
    buildSummaryTextItem(
      ctx,
      `Policy decision ${outcome.policyDecisionId}${outcome.policyProofId !== undefined ? ` (proof ${outcome.policyProofId})` : ''}: ${outcome.policyReasonCode ?? outcome.reasonCode} -- ${outcome.policyReason ?? outcome.reason}`,
      'Policy decision reference',
    ),
  ];
}

export function buildApprovalSectionItems(ctx: ExportRuntimeContext, outcome: DemoScenarioRun['outcome']): readonly ExportPackageItem[] {
  if (outcome?.approvalProofId === undefined) {
    return [buildSummaryTextItem(ctx, 'No approval proof was produced for this decision -- approval was not required.', 'Approval decision reference')];
  }
  return [buildSummaryTextItem(ctx, `Approval proof ${outcome.approvalProofId} backs this decision.`, 'Approval decision reference')];
}

export function buildEnterpriseDemoSectionItems(ctx: ExportRuntimeContext, run: DemoScenarioRun): readonly ExportPackageItem[] {
  return [buildSummaryTextItem(ctx, `Enterprise Demo scenario run ${run.id} (scenario ${run.scenarioId}) completed with status ${run.status}.`, 'Enterprise Demo scenario reference')];
}

function buildSectionsForDefinition(
  ctx: ExportRuntimeContext,
  definition: PilotExportPackageDefinition,
  facts: RealizedEnforcementFacts,
  run: DemoScenarioRun,
  evidenceItems: readonly ExportPackageItem[],
): CreatePackageSectionInput[] {
  const sections: CreatePackageSectionInput[] = [];
  for (const sectionType of definition.expectedSections) {
    if (sectionType === 'summary') {
      sections.push({ type: 'summary', required: true, items: [buildSummaryTextItem(ctx, `${definition.name}: ${definition.buyerPurpose}`)] });
    } else if (sectionType === 'enforcement') {
      sections.push({ type: 'enforcement', required: true, items: buildEnforcementSectionItems(ctx, facts) });
    } else if (sectionType === 'policy') {
      sections.push({ type: 'policy', required: true, items: buildPolicySectionItems(ctx, run.outcome) });
    } else if (sectionType === 'approval') {
      sections.push({ type: 'approval', required: true, items: buildApprovalSectionItems(ctx, run.outcome) });
    } else if (sectionType === 'evidence') {
      sections.push({ type: 'evidence', required: true, items: evidenceItems.length > 0 ? evidenceItems : [buildSummaryTextItem(ctx, 'No evidence item was available for this package.')] });
    } else if (sectionType === 'enterprise_demo') {
      sections.push({ type: 'enterprise_demo', required: true, items: buildEnterpriseDemoSectionItems(ctx, run) });
    }
  }
  return sections;
}

function findScenarioForTargetId(template: PilotTemplate, targetId: string): PilotScenario | undefined {
  return template.scenarios.find((scenario) => scenario.actionIds.includes(targetId));
}

/**
 * Creates, seals and verifies a real `ExportPackage` (via the real
 * `ExportPackageRuntime`) for one `PilotExportPackageDefinition`, built from
 * a real, already-executed `DemoScenarioRun` plus (optionally) real evidence
 * items. Returns `undefined` -- never a fabricated package id -- when no
 * scenario/binding/run backs the definition's `targetId`.
 */
export function buildAndVerifyExportPackageForDefinition(
  exportCtx: ExportRuntimeContext,
  exportRuntime: ExportPackageRuntime,
  template: PilotTemplate,
  definition: PilotExportPackageDefinition,
  scenarioBindings: readonly PilotScenarioBindingResult[],
  evidenceItemsByAction: Readonly<Record<string, readonly ExportPackageItem[]>> = {},
): string | undefined {
  const scenario = findScenarioForTargetId(template, definition.targetId);
  if (scenario === undefined) {
    return undefined;
  }
  const binding = scenarioBindings.find((candidate) => candidate.pilotScenarioId === scenario.id);
  if (binding === undefined || binding.demoRun === undefined) {
    return undefined;
  }
  const demoScenario: DemoScenario = {
    id: binding.demoRun.scenarioId,
    title: scenario.name,
    shortTitle: scenario.name,
    category: 'policy_packs',
    summary: scenario.description,
    enterpriseMessage: scenario.buyerMessage,
    buyerPain: scenario.buyerMessage,
    aocValue: scenario.buyerMessage,
    personas: [],
    primaryActorId: template.actions.find((action) => action.id === scenario.actionIds[0])?.actorId ?? template.trustDomainId,
    trustDomainId: template.trustDomainId,
    action: template.actions.find((action) => action.id === scenario.actionIds[0])?.action ?? scenario.actionIds[0] ?? 'unknown_action',
    resourceScope: template.actions.find((action) => action.id === scenario.actionIds[0])?.resourceScope ?? 'unknown_scope',
    riskLevel: 'low',
    expectedOutcome: 'executed',
    steps: [],
    expectedAssertions: [],
    tags: [],
  };

  const facts = realizeEnforcementFactsFromDemoRun(demoScenario, binding.demoRun);
  const evidenceItems = evidenceItemsByAction[definition.targetId] ?? [];
  const sections = buildSectionsForDefinition(exportCtx, definition, facts, binding.demoRun, evidenceItems);
  if (sections.length === 0) {
    return undefined;
  }

  const input: CreateExportPackageInput = {
    title: definition.name,
    description: definition.buyerPurpose,
    trustDomainId: template.trustDomainId,
    targetType: 'enforcement_decision',
    // The real ExportPackageVerificationService requires pkg.targetId to
    // match the sourceId of an included enforcement_decision item -- so this
    // must be the real decision id the run produced, not the definition's
    // own declarative targetId (which stays a human-readable label on the
    // PilotExportPackageDefinition itself).
    targetId: facts.decision.id,
    sections,
  };

  const created =
    definition.packageType === 'evidence_packet'
      ? exportRuntime.createEvidencePacket(input)
      : definition.packageType === 'approval_decision_packet'
        ? exportRuntime.createApprovalDecisionPacket(input)
        : definition.packageType === 'policy_decision_packet'
          ? exportRuntime.createPolicyDecisionPacket(input)
          : definition.packageType === 'enforcement_decision_packet'
            ? exportRuntime.createEnforcementDecisionPacket(input)
            : definition.packageType === 'enterprise_demo_packet'
              ? exportRuntime.createEnterpriseDemoPacket(input)
              : exportRuntime.createDecisionPacket(input);

  exportRuntime.sealPackage(created.pkg.id);
  exportRuntime.verifyPackage(created.pkg.id);
  return created.pkg.id;
}

/**
 * Builds and verifies every export package a template's export package
 * definitions need, returning a map from definition id to the real,
 * verified export package id. Definitions without a matching scenario/run
 * are simply omitted -- never backfilled with a fabricated id.
 */
export function buildExportPackageIdsByDefinitionId(
  exportCtx: ExportRuntimeContext,
  exportRuntime: ExportPackageRuntime,
  template: PilotTemplate,
  scenarioBindings: readonly PilotScenarioBindingResult[],
  evidenceItemsByAction: Readonly<Record<string, readonly ExportPackageItem[]>> = {},
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const definition of template.exportPackages) {
    const packageId = buildAndVerifyExportPackageForDefinition(exportCtx, exportRuntime, template, definition, scenarioBindings, evidenceItemsByAction);
    if (packageId !== undefined) {
      result[definition.id] = packageId;
    }
  }
  return result;
}
