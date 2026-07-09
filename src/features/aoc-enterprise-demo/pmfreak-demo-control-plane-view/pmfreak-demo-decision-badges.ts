import type { PMFreakPassportActionDecision } from '@aoc-enterprise/pmfreak-agent-passport-foundation';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import type { PMFreakDemoDecisionBadge, PMFreakDemoDecisionSeverity } from './pmfreak-demo-control-plane-view-types.js';

/**
 * Decision -> severity/label/description mapping for the Control Plane
 * view. This mapping only relabels a decision already computed by
 * `resolvePMFreakAgentPassportAction`; it never decides anything itself.
 */
const DECISION_SEVERITY: Record<PMFreakPassportActionDecision, PMFreakDemoDecisionSeverity> = {
  allow: 'success',
  hold: 'warning',
  deny: 'danger',
  require_evidence: 'warning',
  require_pm_approval: 'warning',
  require_customer_validation: 'warning',
  require_contract_review: 'warning',
  require_billing_review: 'warning',
  require_legal_review: 'warning',
  require_security_review: 'warning',
  require_executive_approval: 'warning',
};

const DECISION_LABEL: Record<PMFreakPassportActionDecision, string> = {
  allow: 'Allowed',
  hold: 'On hold',
  deny: 'Denied',
  require_evidence: 'Evidence required',
  require_pm_approval: 'PM approval required',
  require_customer_validation: 'Customer validation required',
  require_contract_review: 'Contract review required',
  require_billing_review: 'Billing review required',
  require_legal_review: 'Legal review required',
  require_security_review: 'Security review required',
  require_executive_approval: 'Executive approval required',
};

const DECISION_DESCRIPTION: Record<PMFreakPassportActionDecision, string> = {
  allow: 'AOC Enterprise allows the governed demo action to proceed based on the configured passport, evidence, and approvals.',
  hold: 'AOC Enterprise holds the demo action pending passport reinstatement.',
  deny: 'AOC Enterprise denies the demo action based on passport, capability, or authority-scope gating.',
  require_evidence: 'Required evidence is missing before governed execution can proceed.',
  require_pm_approval: 'PM approval is required before governed execution can proceed.',
  require_customer_validation: 'Customer validation is required before governed execution can proceed.',
  require_contract_review: 'Contract review is required before governed execution can proceed.',
  require_billing_review: 'Billing review is required before governed execution can proceed.',
  require_legal_review: 'Legal review is required before governed execution can proceed.',
  require_security_review: 'Security review is required before governed execution can proceed.',
  require_executive_approval: 'Executive approval is required before governed execution can proceed.',
};

/**
 * Builds a claim-safe decision badge for an already-computed
 * `PMFreakPassportActionDecision`. Never re-derives the decision -- only
 * relabels it for presentation.
 */
export function createPMFreakDemoDecisionBadge(decision: PMFreakPassportActionDecision): PMFreakDemoDecisionBadge {
  const badge: PMFreakDemoDecisionBadge = {
    decision,
    severity: DECISION_SEVERITY[decision],
    label: DECISION_LABEL[decision],
    description: DECISION_DESCRIPTION[decision],
  };

  assertNoPMFreakDemoControlPlaneOverclaim(badge);
  return badge;
}
