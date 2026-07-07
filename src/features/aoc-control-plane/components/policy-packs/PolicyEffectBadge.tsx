import * as React from 'react';
import type { AocMetricTone } from '../../domain/control-plane-status.js';
import { toneForPolicyEffectType } from '../../domain/policy-pack-control-plane-status.js';

const TONE_SYMBOL: Readonly<Record<AocMetricTone, string>> = {
  success: '✓',
  danger: '✕',
  warning: '⚠',
  neutral: '•',
};

export interface PolicyEffectBadgeProps {
  /** A PolicyEffectType -- allow, deny, require_evidence, require_approval, require_authority, require_external_standing, limit_scope, raise_risk, warn, no_op. */
  readonly effectType: string;
}

/** Renders a policy rule's effect type badge -- reads PolicyEffect.type verbatim, never re-evaluates a condition. */
export function PolicyEffectBadge({ effectType }: PolicyEffectBadgeProps): React.ReactElement {
  const tone = toneForPolicyEffectType(effectType);
  const text = effectType.replace(/_/g, ' ');
  return (
    <span className={`aoc-badge aoc-badge--${tone}`} role="status" aria-label={`Policy effect: ${text}`}>
      <span aria-hidden="true">{TONE_SYMBOL[tone]}</span> {text}
    </span>
  );
}
