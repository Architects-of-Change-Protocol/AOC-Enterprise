import * as React from 'react';
import type { PolicyPackMetric } from '../../domain/policy-pack-view-model.js';

export interface PolicyPackSummaryCardsProps {
  readonly metrics: readonly PolicyPackMetric[];
}

export function PolicyPackSummaryCards({ metrics }: PolicyPackSummaryCardsProps): React.ReactElement {
  return (
    <ul className="aoc-status-cards__grid" aria-label="Policy pack summary metrics">
      {metrics.map((metric) => (
        <li key={metric.id} className={`aoc-status-cards__card aoc-status-cards__card--${metric.tone}`}>
          <p className="aoc-status-cards__card-value">{metric.value}</p>
          <p className="aoc-status-cards__card-label">{metric.label}</p>
          {metric.description !== undefined ? <p className="aoc-status-cards__card-description">{metric.description}</p> : null}
        </li>
      ))}
    </ul>
  );
}
