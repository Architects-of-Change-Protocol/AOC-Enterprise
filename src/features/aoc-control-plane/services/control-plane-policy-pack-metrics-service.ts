import type { PolicyPackMetric } from '../domain/policy-pack-view-model.js';
import type {
  PolicyDecisionRow,
  PolicyEnforcementLinkRow,
  PolicyEvaluationRow,
  PolicyPackRow,
  PolicyPackVersionRow,
  PolicyProofRow,
  PolicyRuleRow,
} from '../domain/policy-pack-view-model.js';

export interface PolicyPackMetricsInput {
  readonly packs: readonly PolicyPackRow[];
  readonly versions: readonly PolicyPackVersionRow[];
  readonly rules: readonly PolicyRuleRow[];
  readonly evaluations: readonly PolicyEvaluationRow[];
  readonly decisions: readonly PolicyDecisionRow[];
  readonly proofs: readonly PolicyProofRow[];
  readonly enforcementLinks: readonly PolicyEnforcementLinkRow[];
}

function countByDecisionType(decisions: readonly PolicyDecisionRow[], type: string): number {
  return decisions.filter((decision) => decision.type === type).length;
}

/** Counts already-projected policy-pack read-model rows into display metrics -- never re-evaluates a policy rule or infers legal compliance. */
export function computePolicyPackMetrics(input: PolicyPackMetricsInput): PolicyPackMetric[] {
  const activePolicyPacks = input.packs.filter((pack) => pack.status === 'active').length;
  const activeVersions = input.versions.filter((version) => version.status === 'active').length;
  const demoOnlyVersions = input.versions.filter((version) => version.demoOnly).length;
  const deniedDecisions = countByDecisionType(input.decisions, 'denied');
  const approvalRequiredDecisions = countByDecisionType(input.decisions, 'requires_approval');
  const evidenceRequiredDecisions = countByDecisionType(input.decisions, 'requires_evidence');
  const warningDecisions = countByDecisionType(input.decisions, 'warning');
  const policyBlockedExecutions = input.enforcementLinks.filter((link) => link.blockedByPolicy).length;

  return [
    { id: 'policy-packs', label: 'Policy Packs', value: input.packs.length, tone: 'neutral' },
    { id: 'active-policy-packs', label: 'Active Policy Packs', value: activePolicyPacks, tone: 'neutral' },
    { id: 'active-policy-pack-versions', label: 'Active Versions', value: activeVersions, tone: 'neutral' },
    { id: 'demo-only-policy-pack-versions', label: 'Demo-only Versions', value: demoOnlyVersions, tone: demoOnlyVersions > 0 ? 'warning' : 'neutral' },
    { id: 'policy-rules', label: 'Rules', value: input.rules.length, tone: 'neutral' },
    { id: 'policy-evaluations', label: 'Evaluations', value: input.evaluations.length, tone: 'neutral' },
    { id: 'policy-decisions', label: 'Decisions', value: input.decisions.length, tone: 'neutral' },
    { id: 'policy-denied-decisions', label: 'Denied Decisions', value: deniedDecisions, tone: deniedDecisions > 0 ? 'danger' : 'success' },
    { id: 'policy-approval-required-decisions', label: 'Approval Required', value: approvalRequiredDecisions, tone: approvalRequiredDecisions > 0 ? 'warning' : 'neutral' },
    { id: 'policy-evidence-required-decisions', label: 'Evidence Required', value: evidenceRequiredDecisions, tone: evidenceRequiredDecisions > 0 ? 'warning' : 'neutral' },
    { id: 'policy-warning-decisions', label: 'Warnings', value: warningDecisions, tone: warningDecisions > 0 ? 'warning' : 'neutral' },
    { id: 'policy-proofs', label: 'Policy Proofs', value: input.proofs.length, tone: 'neutral' },
    { id: 'policy-blocked-executions', label: 'Policy-blocked Executions', value: policyBlockedExecutions, tone: policyBlockedExecutions > 0 ? 'danger' : 'success' },
  ];
}
