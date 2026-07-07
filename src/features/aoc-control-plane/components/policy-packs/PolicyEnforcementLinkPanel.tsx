import * as React from 'react';
import type { PolicyEnforcementLinkRow } from '../../domain/policy-pack-view-model.js';
import { AocDecisionBadge } from '../AocDecisionBadge.js';

export interface PolicyEnforcementLinkPanelProps {
  readonly link: PolicyEnforcementLinkRow;
}

/**
 * Shows how an Action Enforcement decision/proof relates to the Domain
 * Policy Pack Runtime decision/proof it consulted. Every field is read
 * straight off the PolicyEnforcementLinkRow -- built only from fields
 * EnforcementDecision/EnforcementProof already carried -- so this panel can
 * never show a link that neither runtime recorded.
 */
export function PolicyEnforcementLinkPanel({ link }: PolicyEnforcementLinkPanelProps): React.ReactElement {
  return (
    <dl className="aoc-detail" aria-label={`Policy enforcement link ${link.id}`}>
      <dt>Blocked by policy</dt>
      <dd>
        <AocDecisionBadge status={link.blockedByPolicy ? 'blocked' : 'allowed'} label={link.blockedByPolicy ? 'blocked by policy' : 'not blocked by policy'} />
      </dd>
      {link.enforcementRequestId !== undefined ? (
        <>
          <dt>Enforcement request</dt>
          <dd>{link.enforcementRequestId}</dd>
        </>
      ) : null}
      {link.enforcementDecisionId !== undefined ? (
        <>
          <dt>Enforcement decision</dt>
          <dd>{link.enforcementDecisionId}</dd>
        </>
      ) : null}
      {link.enforcementProofId !== undefined ? (
        <>
          <dt>Enforcement proof</dt>
          <dd>
            <code>{link.enforcementProofId}</code>
          </dd>
        </>
      ) : null}
      {link.policyDecisionId !== undefined ? (
        <>
          <dt>Policy decision</dt>
          <dd>{link.policyDecisionId}</dd>
        </>
      ) : null}
      {link.policyProofId !== undefined ? (
        <>
          <dt>Policy proof</dt>
          <dd>
            <code>{link.policyProofId}</code>
          </dd>
        </>
      ) : null}
      <dt>Policy pack versions</dt>
      <dd>{link.policyPackVersionIds.length > 0 ? link.policyPackVersionIds.join(', ') : '—'}</dd>
      <dt>Matched rules</dt>
      <dd>{link.matchedRuleIds.length > 0 ? link.matchedRuleIds.join(', ') : '—'}</dd>
      <dt>Action</dt>
      <dd>{link.action}</dd>
      <dt>Actor</dt>
      <dd>{link.actorId}</dd>
      <dt>Resource scope</dt>
      <dd>{link.resourceScope}</dd>
      {link.reasonCode !== undefined ? (
        <>
          <dt>Reason code</dt>
          <dd>{link.reasonCode}</dd>
        </>
      ) : null}
      {link.reason !== undefined ? (
        <>
          <dt>Reason</dt>
          <dd>{link.reason}</dd>
        </>
      ) : null}
    </dl>
  );
}
