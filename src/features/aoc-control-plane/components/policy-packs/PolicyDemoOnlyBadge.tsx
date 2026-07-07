import * as React from 'react';

export interface PolicyDemoOnlyBadgeProps {
  readonly demoOnly: boolean;
}

/** Shows whether a policy pack/version is demo-only. Reads `demoOnly` verbatim -- it never infers demo status from any other field. */
export function PolicyDemoOnlyBadge({ demoOnly }: PolicyDemoOnlyBadgeProps): React.ReactElement {
  if (!demoOnly) {
    return (
      <span className="aoc-badge aoc-badge--neutral" role="status">
        <span aria-hidden="true">•</span> production
      </span>
    );
  }
  return (
    <span className="aoc-badge aoc-badge--warning" role="status" aria-label="Demo only">
      <span aria-hidden="true">⚠</span> demo only
    </span>
  );
}
