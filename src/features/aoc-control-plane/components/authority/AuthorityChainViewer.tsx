import * as React from 'react';
import type { AuthorityGrantRow, DelegationGrantRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface AuthorityChainViewerProps {
  readonly grants: readonly AuthorityGrantRow[];
  readonly delegations: readonly DelegationGrantRow[];
}

interface ChainStep {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly capability: string;
  readonly status: string;
}

/**
 * A deterministic nested-card chain view built directly from authority
 * grants and delegations already in the read model -- no graph library, no
 * layout engine, just "who gave authority to whom, for what" in order.
 */
export function AuthorityChainViewer({ grants, delegations }: AuthorityChainViewerProps): React.ReactElement {
  const steps: ChainStep[] = [
    ...grants.map((grant) => ({ id: grant.id, from: grant.issuerActorId, to: grant.subjectActorId, capability: grant.capability, status: grant.status })),
    ...delegations.map((delegation) => ({
      id: delegation.id,
      from: delegation.delegatorActorId,
      to: delegation.delegateActorId,
      capability: delegation.capability,
      status: delegation.status,
    })),
  ];

  if (steps.length === 0) {
    return <AocEmptyState message="No authority chain to display." />;
  }

  return (
    <ol className="aoc-authority-chain" aria-label="Authority chain">
      {steps.map((step, index) => (
        <li key={step.id} className={`aoc-authority-chain__step aoc-authority-chain__step--${step.status}`}>
          <span className="aoc-authority-chain__node">{step.from}</span>
          <span className="aoc-authority-chain__arrow" aria-hidden="true">
            →
          </span>
          <span className="aoc-authority-chain__node">{step.to}</span>
          <span className="aoc-authority-chain__capability">({step.capability}, {step.status})</span>
          {index < steps.length - 1 ? <span className="aoc-authority-chain__connector" aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}
