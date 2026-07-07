import * as React from 'react';
import type { AocMetricTone } from '../../domain/control-plane-status.js';
import { legalCompletenessLabel, toneForLegalCompleteness } from '../../domain/policy-pack-control-plane-status.js';

const TONE_SYMBOL: Readonly<Record<AocMetricTone, string>> = {
  success: '✓',
  danger: '✕',
  warning: '⚠',
  neutral: '•',
};

export interface PolicyLegalCompletenessBadgeProps {
  /** A PolicyPackLegalCompleteness value -- not_legal_advice, partial_policy_model, customer_provided_policy, verified_by_customer, verified_by_counsel. */
  readonly legalCompleteness: string;
}

/**
 * Displays legal-completeness metadata exactly as the policy pack version
 * itself declares it. `not_legal_advice` always renders with the `danger`
 * tone and the literal label "Not legal advice" -- it must never read as
 * green/compliant. Only `verified_by_customer`/`verified_by_counsel` --
 * legal completeness the pack's own metadata explicitly asserts -- render
 * with the `success` tone. This component never infers or upgrades legal
 * compliance on its own.
 */
export function PolicyLegalCompletenessBadge({ legalCompleteness }: PolicyLegalCompletenessBadgeProps): React.ReactElement {
  const tone = toneForLegalCompleteness(legalCompleteness);
  const text = legalCompletenessLabel(legalCompleteness);
  return (
    <span className={`aoc-badge aoc-badge--${tone}`} role="status" aria-label={`Legal completeness: ${text}`}>
      <span aria-hidden="true">{TONE_SYMBOL[tone]}</span> {text}
    </span>
  );
}
