import * as React from 'react';
import type { PolicyProofRow } from '../../domain/policy-pack-view-model.js';

export interface PolicyProofDetailProps {
  readonly proof: PolicyProofRow;
  /** Enforcement proof id this policy proof is linked from, when the caller already resolved that link (see control-plane-policy-pack-proof-service.ts). */
  readonly linkedEnforcementProofId?: string;
}

export function PolicyProofDetail({ proof, linkedEnforcementProofId }: PolicyProofDetailProps): React.ReactElement {
  return (
    <dl className="aoc-detail" aria-label={`Policy proof ${proof.id}`}>
      <dt>Proof</dt>
      <dd>
        <code title={proof.proofHash}>{proof.proofHash.slice(0, 16)}…</code>
      </dd>
      <dt>Input hash</dt>
      <dd>
        <code title={proof.inputHash}>{proof.inputHash.slice(0, 16)}…</code>
      </dd>
      <dt>Rule results hash</dt>
      <dd>
        <code title={proof.ruleResultsHash}>{proof.ruleResultsHash.slice(0, 16)}…</code>
      </dd>
      <dt>Decision hash</dt>
      <dd>
        <code title={proof.decisionHash}>{proof.decisionHash.slice(0, 16)}…</code>
      </dd>
      {proof.previousHash !== undefined ? (
        <>
          <dt>Previous hash</dt>
          <dd>
            <code title={proof.previousHash}>{proof.previousHash.slice(0, 16)}…</code>
          </dd>
        </>
      ) : null}
      <dt>Policy pack versions</dt>
      <dd>{proof.policyPackVersionIds.length > 0 ? proof.policyPackVersionIds.join(', ') : '—'}</dd>
      <dt>Matched rules</dt>
      <dd>{proof.matchedRuleIds.length > 0 ? proof.matchedRuleIds.join(', ') : '—'}</dd>
      {linkedEnforcementProofId !== undefined ? (
        <>
          <dt>Linked enforcement proof</dt>
          <dd>
            <code>{linkedEnforcementProofId}</code>
          </dd>
        </>
      ) : null}
      <dt>Created at</dt>
      <dd>{proof.createdAt}</dd>
    </dl>
  );
}
