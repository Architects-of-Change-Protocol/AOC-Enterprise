import * as React from 'react';
import type { DemoPolicyPackControlPlaneSnapshot } from '../domain/demo-policy-pack.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoPolicyPackControlPlaneWalkthroughProps {
  readonly snapshot?: DemoPolicyPackControlPlaneSnapshot;
}

const PANEL_LABELS: Record<string, string> = {
  policy_packs: 'Policy Packs',
  enforcement: 'Enforcement',
  proofs: 'Proofs / Audit',
  overview: 'Overview',
  recognition: 'Recognition',
  authority: 'Authority',
  approvals: 'Approvals',
  external_agents: 'External Agents',
};

export function DemoPolicyPackControlPlaneWalkthrough({ snapshot }: DemoPolicyPackControlPlaneWalkthroughProps): React.ReactElement {
  if (snapshot === undefined) {
    return <DemoEmptyState message="No policy-pack Control Plane snapshot has been built yet." />;
  }

  const panels = [...new Set(snapshot.walkthroughAnchors.map((anchor) => anchor.panel))];

  return (
    <div className="aoc-demo-policy-pack-control-plane-walkthrough">
      <section>
        <h3>Panels to inspect</h3>
        <ul>
          {panels.map((panel) => (
            <li key={panel} data-testid={`policy-walkthrough-panel-${panel}`}>
              {PANEL_LABELS[panel] ?? panel}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Highlighted rows</h3>
        <dl>
          {snapshot.highlightedDecisionId !== undefined ? (
            <>
              <dt>Policy decision</dt>
              <dd data-testid="policy-walkthrough-decision-row">{snapshot.highlightedDecisionId}</dd>
            </>
          ) : null}
          {snapshot.highlightedProofId !== undefined ? (
            <>
              <dt>Policy proof</dt>
              <dd data-testid="policy-walkthrough-proof-row">{snapshot.highlightedProofId}</dd>
            </>
          ) : null}
          {snapshot.highlightedEnforcementLinkId !== undefined ? (
            <>
              <dt>Policy-enforcement link</dt>
              <dd data-testid="policy-walkthrough-link-row">{snapshot.highlightedEnforcementLinkId}</dd>
            </>
          ) : null}
          {snapshot.highlightedPackIds.length > 0 ? (
            <>
              <dt>Policy pack(s)</dt>
              <dd>{snapshot.highlightedPackIds.join(', ')}</dd>
            </>
          ) : null}
        </dl>
      </section>
      <section>
        <h3>Suggested operator narration</h3>
        <ul>
          {snapshot.walkthroughAnchors.map((anchor) => (
            <li key={anchor.id} data-testid="policy-walkthrough-narration">
              {anchor.narration}
            </li>
          ))}
        </ul>
      </section>
      <p className="aoc-demo-policy-pack-control-plane-walkthrough__disclaimer">
        Demo-only policy pack: {snapshot.legalCompleteness}. This shows enforcement trace and policy evidence, not legal advice.
      </p>
    </div>
  );
}
