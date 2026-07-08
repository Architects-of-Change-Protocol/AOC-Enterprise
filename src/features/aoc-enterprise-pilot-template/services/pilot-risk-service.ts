import type { PilotTemplate } from '../domain/pilot-template.js';
import type { PilotRisk } from '../domain/pilot-risk.js';
import type { PilotExportPackageBindingResult } from './pilot-export-package-binding-service.js';

export interface PilotRiskEvaluationOptions {
  readonly exportPackageBindings?: readonly PilotExportPackageBindingResult[];
}

export interface PilotRiskEvaluation {
  readonly risks: readonly PilotRisk[];
  readonly missingMitigationRiskIds: readonly string[];
  readonly escalatedRiskReasonCodes: readonly string[];
}

function byId(a: PilotRisk, b: PilotRisk): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Lists and validates a pilot template's declared risks, and escalates a
 * fixed set of structural risk conditions this feature must never let slide
 * silently (missing legal disclaimer, demo-only confusion, missing export
 * package coverage, missing evidence coverage).
 */
export class PilotRiskService {
  evaluate(template: PilotTemplate, options: PilotRiskEvaluationOptions = {}): PilotRiskEvaluation {
    const risks = [...template.risks].sort(byId);
    const missingMitigationRiskIds = risks.filter((risk) => risk.mitigation.trim().length === 0).map((risk) => risk.id);

    const escalatedRiskReasonCodes: string[] = [];

    if (template.legalDisclaimer.trim().length === 0) {
      escalatedRiskReasonCodes.push('MISSING_LEGAL_DISCLAIMER');
    }

    if (template.scope.legalCompleteness === 'demo_policy_model' || template.scope.legalCompleteness === 'not_legal_advice') {
      const nonGoalsMentionLegal = template.nonGoals.some((goal) => /legal|complian/i.test(goal));
      if (!nonGoalsMentionLegal) {
        escalatedRiskReasonCodes.push('DEMO_ONLY_CONFUSION_RISK');
      }
    }

    const exportBindings = options.exportPackageBindings ?? [];
    if (template.exportPackages.length > 0 && (exportBindings.length === 0 || exportBindings.some((binding) => !binding.bound))) {
      escalatedRiskReasonCodes.push('MISSING_EXPORT_PACKAGE_RISK');
    }

    if (template.evidenceModel.evidenceScenarios.length > 0 && template.evidenceModel.evidenceProofIds.length === 0) {
      escalatedRiskReasonCodes.push('MISSING_EVIDENCE_RISK');
    }

    return { risks, missingMitigationRiskIds, escalatedRiskReasonCodes };
  }
}

export function createPilotRiskService(): PilotRiskService {
  return new PilotRiskService();
}
