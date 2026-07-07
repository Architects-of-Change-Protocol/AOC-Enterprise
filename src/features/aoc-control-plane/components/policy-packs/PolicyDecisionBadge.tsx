import * as React from 'react';
import type { AocMetricTone } from '../../domain/control-plane-status.js';
import { toneForPolicyDecisionType } from '../../domain/policy-pack-control-plane-status.js';

const TONE_SYMBOL: Readonly<Record<AocMetricTone, string>> = {
  success: '✓',
  danger: '✕',
  warning: '⚠',
  neutral: '•',
};

export interface PolicyDecisionBadgeProps {
  /** A PolicyPackDecisionType -- allowed, denied, requires_evidence, requires_approval, requires_authority, requires_external_standing, limited, warning, not_applicable, invalid_input. */
  readonly type: string;
}

/** Renders a policy pack decision type badge -- reads PolicyPackDecision.type verbatim, never re-derives it. */
export function PolicyDecisionBadge({ type }: PolicyDecisionBadgeProps): React.ReactElement {
  const tone = toneForPolicyDecisionType(type);
  const text = type.replace(/_/g, ' ');
  return (
    <span className={`aoc-badge aoc-badge--${tone}`} role="status" aria-label={`Policy decision: ${text}`}>
      <span aria-hidden="true">{TONE_SYMBOL[tone]}</span> {text}
    </span>
  );
}
