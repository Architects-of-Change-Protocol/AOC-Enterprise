import type { AocPMFreakGovernanceDecision, AocPMFreakGovernanceDecisionSeverity, AocPMFreakGovernanceRequest } from './aoc-pmfreak-governance-intake-types.js';

const DECISION_LABELS: Readonly<Record<AocPMFreakGovernanceDecision, string>> = {
  allow: 'Allowed',
  deny: 'Denied',
  hold: 'Held',
  require_evidence: 'Evidence required',
  require_pm_approval: 'PM approval required',
  require_customer_validation: 'Customer validation required',
  require_billing_review: 'Billing review required',
  require_contract_review: 'Contract review required',
  require_security_review: 'Security review required',
  require_executive_approval: 'Executive approval required',
};

export function mapAocPMFreakDecisionToLabel(decision: AocPMFreakGovernanceDecision): string {
  return DECISION_LABELS[decision];
}

const DECISION_SEVERITIES: Readonly<Record<AocPMFreakGovernanceDecision, AocPMFreakGovernanceDecisionSeverity>> = {
  allow: 'success',
  hold: 'warning',
  require_evidence: 'warning',
  require_pm_approval: 'warning',
  require_customer_validation: 'warning',
  require_billing_review: 'warning',
  require_contract_review: 'warning',
  require_security_review: 'warning',
  require_executive_approval: 'warning',
  deny: 'danger',
};

export function mapAocPMFreakDecisionToSeverity(decision: AocPMFreakGovernanceDecision): AocPMFreakGovernanceDecisionSeverity {
  return DECISION_SEVERITIES[decision];
}

/**
 * A fixed safe-framing clause every summary carries, mirroring the safe
 * framing warning the PMFreak Agent Passport demo resolver attaches to
 * every resolution. Never claims invoice validity, customer acceptance
 * certification, legal compliance, contractual compliance, production
 * authorization, or risk-free execution.
 */
const SAFE_FRAMING_CLAUSE =
  'This reflects AOC Enterprise passport, evidence, and approval gating only; it is not an invoice validity certification, not a customer acceptance certification, and not a compliance or legal determination.';

const HEADLINE_BY_DECISION: Readonly<Record<AocPMFreakGovernanceDecision, (actionTitle: string) => string>> = {
  allow: (actionTitle) => `AOC allows the PMFreak action "${actionTitle}" to proceed based on the evidence and approvals present in this request.`,
  deny: (actionTitle) => `AOC denies the PMFreak action "${actionTitle}" based on the state of this request.`,
  hold: (actionTitle) => `AOC holds the PMFreak action "${actionTitle}" pending further review.`,
  require_evidence: (actionTitle) => `AOC requires additional evidence before the PMFreak action "${actionTitle}" can proceed.`,
  require_pm_approval: (actionTitle) => `AOC requires PM approval before the PMFreak action "${actionTitle}" can proceed.`,
  require_customer_validation: (actionTitle) => `AOC requires customer validation before the PMFreak action "${actionTitle}" can proceed.`,
  require_billing_review: (actionTitle) => `AOC requires billing review before the PMFreak action "${actionTitle}" can proceed.`,
  require_contract_review: (actionTitle) => `AOC requires contract review before the PMFreak action "${actionTitle}" can proceed.`,
  require_security_review: (actionTitle) => `AOC requires security review before the PMFreak action "${actionTitle}" can proceed.`,
  require_executive_approval: (actionTitle) => `AOC requires executive approval before the PMFreak action "${actionTitle}" can proceed.`,
};

/** Builds a claim-safe summary sentence for a decision. Never claims invoice validity, customer acceptance, compliance, or legal status. */
export function createAocPMFreakDecisionSafeSummary(decision: AocPMFreakGovernanceDecision, request: AocPMFreakGovernanceRequest): string {
  return `${HEADLINE_BY_DECISION[decision](request.actionAttempt.actionTitle)} ${SAFE_FRAMING_CLAUSE}`;
}
