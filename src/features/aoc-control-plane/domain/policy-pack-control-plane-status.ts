import type { AocMetricTone } from './control-plane-status.js';

/**
 * Pure presentation mappings, mirroring control-plane-risk.ts: they only
 * translate a status/effect/legal-completeness value the Domain Policy Pack
 * Runtime already produced into a display tone or label. They never decide
 * whether a policy pack is legally complete, whether a rule matched, or
 * whether an action should be allowed.
 */

export function toneForPolicyDecisionType(type: string): AocMetricTone {
  switch (type) {
    case 'allowed':
      return 'success';
    case 'denied':
    case 'invalid_input':
      return 'danger';
    case 'requires_evidence':
    case 'requires_approval':
    case 'requires_authority':
    case 'requires_external_standing':
    case 'limited':
    case 'warning':
      return 'warning';
    case 'not_applicable':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function toneForPolicyEffectType(effectType: string): AocMetricTone {
  switch (effectType) {
    case 'allow':
      return 'success';
    case 'deny':
      return 'danger';
    case 'require_evidence':
    case 'require_approval':
    case 'require_authority':
    case 'require_external_standing':
    case 'limit_scope':
    case 'raise_risk':
    case 'warn':
      return 'warning';
    case 'no_op':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/**
 * `not_legal_advice` is always `danger` tone -- it must never read as
 * "green"/compliant. Only `verified_by_customer`/`verified_by_counsel` --
 * i.e. legal completeness the pack's own metadata explicitly asserts -- are
 * `success`.
 */
export function toneForLegalCompleteness(legalCompleteness: string): AocMetricTone {
  switch (legalCompleteness) {
    case 'not_legal_advice':
      return 'danger';
    case 'partial_policy_model':
    case 'customer_provided_policy':
      return 'warning';
    case 'verified_by_customer':
    case 'verified_by_counsel':
      return 'success';
    default:
      return 'neutral';
  }
}

export function legalCompletenessLabel(legalCompleteness: string): string {
  switch (legalCompleteness) {
    case 'not_legal_advice':
      return 'Not legal advice';
    case 'partial_policy_model':
      return 'Partial policy model';
    case 'customer_provided_policy':
      return 'Customer-provided policy';
    case 'verified_by_customer':
      return 'Verified by customer';
    case 'verified_by_counsel':
      return 'Verified by counsel';
    default:
      return legalCompleteness.replace(/_/g, ' ');
  }
}
