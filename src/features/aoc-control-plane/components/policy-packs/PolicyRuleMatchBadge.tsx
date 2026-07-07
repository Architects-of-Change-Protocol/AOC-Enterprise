import * as React from 'react';

export interface PolicyRuleMatchBadgeProps {
  readonly matched: boolean;
}

/** Shows matched/unmatched status for a policy rule result -- reads the rule evaluation result verbatim, never re-runs PolicyRuleEvaluator/PolicyConditionEvaluator. */
export function PolicyRuleMatchBadge({ matched }: PolicyRuleMatchBadgeProps): React.ReactElement {
  return matched ? (
    <span className="aoc-badge aoc-badge--success" role="status">
      <span aria-hidden="true">✓</span> matched
    </span>
  ) : (
    <span className="aoc-badge aoc-badge--neutral" role="status">
      <span aria-hidden="true">•</span> unmatched
    </span>
  );
}
