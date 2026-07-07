import * as React from 'react';
import type { PolicyDecisionRow } from '../../domain/policy-pack-view-model.js';
import { PolicyDecisionBadge } from './PolicyDecisionBadge.js';
import { PolicyObligationsList } from './PolicyObligationsList.js';
import { PolicyEvidenceRequirementsList } from './PolicyEvidenceRequirementsList.js';
import { PolicyApprovalRequirementsList } from './PolicyApprovalRequirementsList.js';

export interface PolicyDecisionDetailProps {
  readonly decision: PolicyDecisionRow;
}

/** Always shows the reasonCode/reason next to the decision badge -- an operator must never have to guess why a policy pack allowed, denied or otherwise constrained an action. */
export function PolicyDecisionDetail({ decision }: PolicyDecisionDetailProps): React.ReactElement {
  return (
    <dl className="aoc-detail" aria-label={`Policy decision ${decision.id}`}>
      <dt>Decision</dt>
      <dd>{decision.id}</dd>
      <dt>Type</dt>
      <dd>
        <PolicyDecisionBadge type={decision.type} />
      </dd>
      <dt>Allowed</dt>
      <dd>{decision.allowed ? 'Yes' : 'No'}</dd>
      <dt>Actor</dt>
      <dd>{decision.actorId}</dd>
      <dt>Action</dt>
      <dd>{decision.action}</dd>
      <dt>Resource scope</dt>
      <dd>{decision.resourceScope}</dd>
      <dt>Risk / effective risk</dt>
      <dd>
        {decision.riskLevel} / {decision.effectiveRiskLevel}
      </dd>
      <dt>Reason code</dt>
      <dd>{decision.reasonCode}</dd>
      <dt>Reason</dt>
      <dd>{decision.reason}</dd>
      <dt>Applicable pack versions</dt>
      <dd>{decision.applicablePackVersionIds.length > 0 ? decision.applicablePackVersionIds.join(', ') : '—'}</dd>
      <dt>Matched rules</dt>
      <dd>{decision.matchedRuleIds.length > 0 ? decision.matchedRuleIds.join(', ') : '—'}</dd>
      <dt>Obligations</dt>
      <dd>
        <PolicyObligationsList obligations={decision.obligations} />
      </dd>
      <dt>Evidence requirements</dt>
      <dd>
        <PolicyEvidenceRequirementsList evidenceRequirements={decision.evidenceRequirements} />
      </dd>
      <dt>Approval requirements</dt>
      <dd>
        <PolicyApprovalRequirementsList approvalRequirements={decision.approvalRequirements} />
      </dd>
      {decision.proofId !== undefined ? (
        <>
          <dt>Proof</dt>
          <dd>
            <code>{decision.proofId}</code>
          </dd>
        </>
      ) : null}
      <dt>Decided at</dt>
      <dd>{decision.decidedAt}</dd>
    </dl>
  );
}
