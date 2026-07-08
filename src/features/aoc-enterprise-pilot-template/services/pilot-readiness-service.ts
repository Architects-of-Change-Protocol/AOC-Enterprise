import type { PilotTemplate } from '../domain/pilot-template.js';
import type { PilotReadinessIssue, PilotReadinessReport, PilotReadinessStatus } from '../domain/pilot-kit.js';
import type { PilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { validatePilotTemplate } from './pilot-template-registry.js';
import type { PilotScenarioBindingResult } from './pilot-scenario-binding-service.js';
import type { PilotExportPackageBindingResult } from './pilot-export-package-binding-service.js';
import type { PilotControlPlaneWalkthroughValidationResult } from './pilot-control-plane-walkthrough-service.js';
import type { PilotAcceptanceEvaluation } from './pilot-acceptance-service.js';
import type { PilotRiskEvaluation } from './pilot-risk-service.js';

export interface PilotReadinessCheckInput {
  readonly template: PilotTemplate;
  readonly scenarioBindings: readonly PilotScenarioBindingResult[];
  readonly exportPackageBindings: readonly PilotExportPackageBindingResult[];
  readonly controlPlaneWalkthroughResult?: PilotControlPlaneWalkthroughValidationResult;
  readonly acceptanceEvaluation?: PilotAcceptanceEvaluation;
  readonly riskEvaluation?: PilotRiskEvaluation;
}

/**
 * Produces the single `PilotReadinessReport` for a pilot template build.
 * `ready` requires every automated/structural check to pass; only
 * outstanding `warning`-severity issues (pending manual/customer-signoff
 * criteria, risks flagged for attention) may still leave the pilot
 * `ready_with_warnings`; any `error`/`critical` issue -- a missing scenario
 * binding, a missing/failed export package, an incomplete template -- forces
 * `not_ready`.
 */
export class PilotReadinessService {
  constructor(private readonly ctx: PilotRuntimeContext) {}

  check(input: PilotReadinessCheckInput): PilotReadinessReport {
    const { template } = input;
    const issues: PilotReadinessIssue[] = [];

    const templateValidation = validatePilotTemplate(template);
    for (const error of templateValidation.errors) {
      issues.push({
        id: this.ctx.ids.nextId('pilot-readiness-issue'),
        severity: 'critical',
        reasonCode: 'TEMPLATE_INCOMPLETE',
        reason: error,
        relatedTemplateId: template.id,
      });
    }

    const readyScenarioIds = input.scenarioBindings.filter((binding) => binding.bound).map((binding) => binding.pilotScenarioId);
    const missingScenarioIds = input.scenarioBindings.filter((binding) => !binding.bound).map((binding) => binding.pilotScenarioId);
    for (const binding of input.scenarioBindings) {
      if (!binding.bound) {
        issues.push({
          id: this.ctx.ids.nextId('pilot-readiness-issue'),
          severity: 'error',
          reasonCode: binding.status === 'missing_binding' ? 'SCENARIO_BINDING_MISSING' : 'SCENARIO_OUTCOME_MISMATCH',
          reason: binding.reason,
          relatedTemplateId: template.id,
          relatedScenarioId: binding.pilotScenarioId,
        });
      }
    }
    if (template.scenarios.length > 0 && input.scenarioBindings.length === 0) {
      issues.push({
        id: this.ctx.ids.nextId('pilot-readiness-issue'),
        severity: 'error',
        reasonCode: 'NO_SCENARIO_BINDINGS',
        reason: 'Template declares scenarios but no scenario bindings were supplied.',
        relatedTemplateId: template.id,
      });
    }

    const verifiedExportPackageIds: string[] = [];
    const failedExportPackageIds: string[] = [];
    for (const binding of input.exportPackageBindings) {
      if (binding.bound && binding.exportPackageId !== undefined) {
        verifiedExportPackageIds.push(binding.exportPackageId);
      }
      if (!binding.bound) {
        if (binding.exportPackageId !== undefined) {
          failedExportPackageIds.push(binding.exportPackageId);
        }
        issues.push({
          id: this.ctx.ids.nextId('pilot-readiness-issue'),
          severity: 'error',
          reasonCode: 'EXPORT_PACKAGE_NOT_VERIFIED',
          reason: binding.reason,
          relatedTemplateId: template.id,
          relatedExportPackageId: binding.pilotExportPackageDefinitionId,
        });
      }
    }
    if (template.exportPackages.length > 0 && input.exportPackageBindings.length === 0) {
      issues.push({
        id: this.ctx.ids.nextId('pilot-readiness-issue'),
        severity: 'error',
        reasonCode: 'NO_EXPORT_PACKAGE_BINDINGS',
        reason: 'Template declares export packages but no export package bindings were supplied.',
        relatedTemplateId: template.id,
      });
    }

    if (input.controlPlaneWalkthroughResult !== undefined) {
      if (!input.controlPlaneWalkthroughResult.valid) {
        issues.push({
          id: this.ctx.ids.nextId('pilot-readiness-issue'),
          severity: 'error',
          reasonCode: 'CONTROL_PLANE_WALKTHROUGH_INCOMPLETE',
          reason: 'Control Plane walkthrough failed structural validation.',
          relatedTemplateId: template.id,
        });
      }
      for (const walkthroughIssue of input.controlPlaneWalkthroughResult.issues) {
        issues.push({
          id: this.ctx.ids.nextId('pilot-readiness-issue'),
          severity: walkthroughIssue.severity === 'error' ? 'error' : 'warning',
          reasonCode: 'CONTROL_PLANE_SECTION_ISSUE',
          reason: walkthroughIssue.reason,
          relatedTemplateId: template.id,
        });
      }
    }

    const passedCriteriaIds = input.acceptanceEvaluation?.passedCriteriaIds ?? [];
    const failedCriteriaIds = input.acceptanceEvaluation?.failedCriteriaIds ?? [];
    const warningCriteriaIds = input.acceptanceEvaluation?.warningCriteriaIds ?? [];
    for (const criterionId of failedCriteriaIds) {
      issues.push({
        id: this.ctx.ids.nextId('pilot-readiness-issue'),
        severity: 'error',
        reasonCode: 'ACCEPTANCE_CRITERION_FAILED',
        reason: `Acceptance criterion "${criterionId}" failed.`,
        relatedTemplateId: template.id,
        relatedAcceptanceCriterionId: criterionId,
      });
    }
    for (const criterionId of warningCriteriaIds) {
      issues.push({
        id: this.ctx.ids.nextId('pilot-readiness-issue'),
        severity: 'warning',
        reasonCode: 'ACCEPTANCE_CRITERION_PENDING',
        reason: `Acceptance criterion "${criterionId}" is pending manual confirmation.`,
        relatedTemplateId: template.id,
        relatedAcceptanceCriterionId: criterionId,
      });
    }

    if (input.riskEvaluation !== undefined) {
      for (const riskId of input.riskEvaluation.missingMitigationRiskIds) {
        issues.push({
          id: this.ctx.ids.nextId('pilot-readiness-issue'),
          severity: 'warning',
          reasonCode: 'RISK_MISSING_MITIGATION',
          reason: `Risk "${riskId}" has no mitigation.`,
          relatedTemplateId: template.id,
        });
      }
      for (const reasonCode of input.riskEvaluation.escalatedRiskReasonCodes) {
        issues.push({
          id: this.ctx.ids.nextId('pilot-readiness-issue'),
          severity: 'warning',
          reasonCode,
          reason: `Escalated pilot risk: ${reasonCode}.`,
          relatedTemplateId: template.id,
        });
      }
    }

    const hasCritical = issues.some((issue) => issue.severity === 'critical');
    const hasError = issues.some((issue) => issue.severity === 'error');
    const hasWarning = issues.some((issue) => issue.severity === 'warning');
    const status: PilotReadinessStatus = hasCritical || hasError ? 'not_ready' : hasWarning ? 'ready_with_warnings' : 'ready';

    return {
      id: this.ctx.ids.nextId('pilot-readiness'),
      templateId: template.id,
      status,
      checkedAt: this.ctx.clock.now(),
      passedCriteriaIds,
      failedCriteriaIds,
      warningCriteriaIds,
      issues,
      readyScenarioIds,
      missingScenarioIds,
      verifiedExportPackageIds,
      failedExportPackageIds,
    };
  }
}

export function createPilotReadinessService(ctx: PilotRuntimeContext): PilotReadinessService {
  return new PilotReadinessService(ctx);
}
