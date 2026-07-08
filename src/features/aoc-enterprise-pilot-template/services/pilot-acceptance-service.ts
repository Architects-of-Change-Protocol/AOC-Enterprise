import type { PilotAcceptanceCriterion } from '../domain/pilot-acceptance-criteria.js';
import type { PilotScenarioBindingResult } from './pilot-scenario-binding-service.js';
import type { PilotExportPackageBindingResult } from './pilot-export-package-binding-service.js';

export type PilotAcceptanceResultStatus = 'passed' | 'failed' | 'warning';

export interface PilotAcceptanceCriterionResult {
  readonly criterionId: string;
  readonly status: PilotAcceptanceResultStatus;
  readonly reason: string;
}

export interface PilotAcceptanceEvaluationInput {
  readonly criteria: readonly PilotAcceptanceCriterion[];
  readonly scenarioBindings: readonly PilotScenarioBindingResult[];
  readonly exportPackageBindings: readonly PilotExportPackageBindingResult[];
}

export interface PilotAcceptanceEvaluation {
  readonly results: readonly PilotAcceptanceCriterionResult[];
  readonly passedCriteriaIds: readonly string[];
  readonly failedCriteriaIds: readonly string[];
  readonly warningCriteriaIds: readonly string[];
}

/**
 * Evaluates `PilotAcceptanceCriterion`s against real scenario/export-package
 * binding results. `operator_review` and `customer_signoff` are never
 * auto-passed -- they stay a `warning` (pending) unless the criterion's own
 * `metadata.manuallyCompleted` is explicitly `true`, recording that a human
 * actually completed the review/signoff out of band.
 */
export class PilotAcceptanceService {
  evaluate(input: PilotAcceptanceEvaluationInput): PilotAcceptanceEvaluation {
    const results = input.criteria.map((criterion) => this.evaluateOne(criterion, input));
    return {
      results,
      passedCriteriaIds: results.filter((result) => result.status === 'passed').map((result) => result.criterionId),
      failedCriteriaIds: results.filter((result) => result.status === 'failed').map((result) => result.criterionId),
      warningCriteriaIds: results.filter((result) => result.status === 'warning').map((result) => result.criterionId),
    };
  }

  private evaluateOne(criterion: PilotAcceptanceCriterion, input: PilotAcceptanceEvaluationInput): PilotAcceptanceCriterionResult {
    const manuallyCompleted = criterion.metadata?.['manuallyCompleted'] === true;

    if (criterion.verificationMethod === 'automated_test') {
      const hasBindings = input.scenarioBindings.length > 0;
      const allBound = hasBindings && input.scenarioBindings.every((binding) => binding.bound);
      return {
        criterionId: criterion.id,
        status: allBound ? 'passed' : criterion.required ? 'failed' : 'warning',
        reason: allBound
          ? 'All bound Enterprise Demo scenarios produced the runtime outcome this criterion requires.'
          : 'One or more Enterprise Demo scenario bindings are missing or do not match their expected outcome.',
      };
    }

    if (criterion.verificationMethod === 'demo_walkthrough') {
      const hasBindings = input.scenarioBindings.length > 0;
      const allBound = hasBindings && input.scenarioBindings.every((binding) => binding.bound);
      if (allBound) {
        return { criterionId: criterion.id, status: 'passed', reason: 'Every bound Enterprise Demo scenario ran and matched its expected outcome during the walkthrough.' };
      }
      return manuallyCompleted
        ? { criterionId: criterion.id, status: 'passed', reason: 'Marked complete via explicit operator metadata (metadata.manuallyCompleted).' }
        : { criterionId: criterion.id, status: 'warning', reason: 'Demo walkthrough not yet confirmed by a real scenario run or explicit operator sign-off.' };
    }

    if (criterion.verificationMethod === 'export_package_verification') {
      if (input.exportPackageBindings.length === 0) {
        return {
          criterionId: criterion.id,
          status: criterion.required ? 'failed' : 'warning',
          reason: 'No export package bindings were supplied to verify against.',
        };
      }
      const anyFailed = input.exportPackageBindings.some((binding) => binding.status === 'failed_verification');
      const allBound = input.exportPackageBindings.every((binding) => binding.bound);
      if (anyFailed) {
        return { criterionId: criterion.id, status: 'failed', reason: 'At least one bound export package failed verification.' };
      }
      return {
        criterionId: criterion.id,
        status: allBound ? 'passed' : 'warning',
        reason: allBound ? 'All bound export packages verified successfully.' : 'One or more export packages are not yet bound or verified.',
      };
    }

    // operator_review, customer_signoff: never auto-pass without explicit human confirmation.
    return manuallyCompleted
      ? { criterionId: criterion.id, status: 'passed', reason: `Marked complete via explicit metadata (${criterion.verificationMethod}).` }
      : {
          criterionId: criterion.id,
          status: 'warning',
          reason: `"${criterion.verificationMethod}" has not been completed; it must be confirmed by a human and is never auto-passed.`,
        };
  }
}

export function createPilotAcceptanceService(): PilotAcceptanceService {
  return new PilotAcceptanceService();
}
