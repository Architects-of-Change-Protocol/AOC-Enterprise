/**
 * PMFreak agent passport action decision -- mirrors the demo pack's
 * `PMFreakAgentPassportDecision`
 * (`src/features/aoc-enterprise-demo/pmfreak-agent-passport/pmfreak-agent-passport-types.ts`)
 * value-for-value so a caller already familiar with that vocabulary sees
 * the same decision set here, but this type is independently declared:
 * this foundation package has no import path to the demo pack (see this
 * package's README, "Why a new workspace package").
 */
export type PMFreakPassportActionDecision =
  | 'allow'
  | 'hold'
  | 'deny'
  | 'require_evidence'
  | 'require_pm_approval'
  | 'require_customer_validation'
  | 'require_contract_review'
  | 'require_billing_review'
  | 'require_legal_review'
  | 'require_security_review'
  | 'require_executive_approval';

/**
 * Highest-priority-wins decision ordering used by
 * `resolvePMFreakAgentPassportAction` when more than one decision
 * candidate applies to a single action attempt.
 */
export const PMFREAK_PASSPORT_ACTION_DECISION_PRIORITY: readonly PMFreakPassportActionDecision[] = [
  'deny',
  'require_legal_review',
  'require_contract_review',
  'require_billing_review',
  'require_security_review',
  'require_executive_approval',
  'require_customer_validation',
  'require_pm_approval',
  'require_evidence',
  'hold',
  'allow',
];
