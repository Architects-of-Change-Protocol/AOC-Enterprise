import type { PolicyObligation } from '../domain/policy-pack-obligation.js';
import type { PolicyRuleEvaluationResult } from '../domain/policy-pack-evaluation.js';

export interface PolicyObligationGrouping {
  readonly all: readonly PolicyObligation[];
  readonly required: readonly PolicyObligation[];
  readonly optional: readonly PolicyObligation[];
}

/**
 * Collects and deduplicates PolicyObligations from matched rule results, in
 * deterministic (first-seen) order.
 */
export class PolicyObligationService {
  collect(ruleResults: readonly PolicyRuleEvaluationResult[]): PolicyObligationGrouping {
    const seen = new Set<string>();
    const all: PolicyObligation[] = [];

    for (const result of ruleResults) {
      if (!result.matched) {
        continue;
      }
      for (const obligation of result.obligations) {
        if (seen.has(obligation.id)) {
          continue;
        }
        seen.add(obligation.id);
        all.push(obligation);
      }
    }

    return {
      all,
      required: all.filter((obligation) => obligation.required),
      optional: all.filter((obligation) => !obligation.required),
    };
  }
}
