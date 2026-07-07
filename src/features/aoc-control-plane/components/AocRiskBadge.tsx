import * as React from 'react';
import { toneForRiskLevel } from '../domain/control-plane-risk.js';

export interface AocRiskBadgeProps {
  readonly riskLevel?: string;
}

export function AocRiskBadge({ riskLevel }: AocRiskBadgeProps): React.ReactElement {
  const tone = toneForRiskLevel(riskLevel);
  const text = riskLevel ?? 'unknown';
  return (
    <span className={`aoc-badge aoc-badge--${tone}`} role="status" aria-label={`Risk level: ${text}`}>
      {text}
    </span>
  );
}
