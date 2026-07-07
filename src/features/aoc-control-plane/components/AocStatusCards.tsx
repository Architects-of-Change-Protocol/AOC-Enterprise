import * as React from 'react';
import type { AocMetric } from '../domain/control-plane-metric.js';
import type { AocControlPlaneHealth } from '../domain/control-plane-status.js';

export interface AocStatusCardsProps {
  readonly metrics: readonly AocMetric[];
  readonly health: AocControlPlaneHealth;
}

const HEALTH_SYMBOL: Record<AocControlPlaneHealth['status'], string> = {
  healthy: '✓',
  attention_required: '⚠',
  degraded: '⚠',
  critical: '✕',
};

export function AocStatusCards({ metrics, health }: AocStatusCardsProps): React.ReactElement {
  return (
    <div className="aoc-status-cards">
      <div className={`aoc-status-cards__health aoc-status-cards__health--${health.status}`} role="status">
        <span aria-hidden="true">{HEALTH_SYMBOL[health.status]}</span>
        <div>
          <p className="aoc-status-cards__health-label">{health.status.replace(/_/g, ' ')}</p>
          <p className="aoc-status-cards__health-reason">{health.reason}</p>
        </div>
      </div>
      <ul className="aoc-status-cards__grid">
        {metrics.map((metric) => (
          <li key={metric.id} className={`aoc-status-cards__card aoc-status-cards__card--${metric.tone}`}>
            <p className="aoc-status-cards__card-value">{metric.value}</p>
            <p className="aoc-status-cards__card-label">{metric.label}</p>
            {metric.description !== undefined ? <p className="aoc-status-cards__card-description">{metric.description}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
