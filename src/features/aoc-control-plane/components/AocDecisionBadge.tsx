import * as React from 'react';
import type { AocDecisionStatus, AocMetricTone } from '../domain/control-plane-status.js';
import { toneForDecisionStatus } from '../domain/control-plane-risk.js';

const TONE_SYMBOL: Readonly<Record<AocMetricTone, string>> = {
  success: '✓',
  danger: '✕',
  warning: '⚠',
  neutral: '•',
};

export interface AocDecisionBadgeProps {
  readonly status: AocDecisionStatus;
  readonly label?: string;
}

/** Renders a decision/status badge. Color never carries the only meaning: a text label and symbol are always present too. */
export function AocDecisionBadge({ status, label }: AocDecisionBadgeProps): React.ReactElement {
  const tone = toneForDecisionStatus(status);
  const text = label ?? status.replace(/_/g, ' ');
  return (
    <span className={`aoc-badge aoc-badge--${tone}`} role="status" aria-label={`Status: ${text}`}>
      <span aria-hidden="true">{TONE_SYMBOL[tone]}</span> {text}
    </span>
  );
}
