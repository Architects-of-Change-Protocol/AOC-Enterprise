import type { PolicyEvaluationInput } from './policy-pack-evaluation.js';
import type { PolicyPackEvaluationResult } from './policy-pack-evaluation.js';

export interface PolicyPackSimulationInput {
  readonly id: string;
  readonly policyPackVersionIds: readonly string[];
  readonly evaluationInputs: readonly PolicyEvaluationInput[];
  readonly simulatedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface PolicyPackSimulationSummary {
  readonly allowed: number;
  readonly denied: number;
  readonly requiresEvidence: number;
  readonly requiresApproval: number;
  readonly warnings: number;
  readonly notApplicable: number;
}

export interface PolicyPackSimulationResult {
  readonly id: string;
  readonly simulationInputId: string;
  readonly results: readonly PolicyPackEvaluationResult[];
  readonly summary: PolicyPackSimulationSummary;
  readonly createdAt: string;
}
