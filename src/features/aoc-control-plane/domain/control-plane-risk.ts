import type { AocDecisionStatus, AocMetricTone } from './control-plane-status.js';

/**
 * Pure presentation mappings only: they translate a status or risk level the
 * runtimes already decided into a display tone. They never decide whether an
 * action is allowed, blocked, or approved -- that comes from the read model.
 */

export function toneForDecisionStatus(status: AocDecisionStatus): AocMetricTone {
  switch (status) {
    case 'allowed':
    case 'approved':
      return 'success';
    case 'blocked':
    case 'rejected':
    case 'revoked':
      return 'danger';
    case 'pending':
    case 'requires_attention':
      return 'warning';
    case 'expired':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function toneForRiskLevel(riskLevel: string | undefined): AocMetricTone {
  switch (riskLevel) {
    case 'critical':
    case 'prohibited':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'neutral';
    case 'low':
      return 'success';
    default:
      return 'neutral';
  }
}
