import * as React from 'react';
import type { AuthorityViewModel } from '../../domain/control-plane-view-model.js';

export interface AuthorityGraphSummaryProps {
  readonly authority: AuthorityViewModel;
}

export function AuthorityGraphSummary({ authority }: AuthorityGraphSummaryProps): React.ReactElement {
  const activeGrants = authority.grants.filter((g) => g.status === 'active').length;
  const activeDelegations = authority.delegations.filter((d) => d.status === 'active').length;
  const invalidDecisions = authority.decisions.filter((d) => !d.valid).length;

  return (
    <dl className="aoc-authority-graph-summary">
      <dt>Active grants</dt>
      <dd>{activeGrants}</dd>
      <dt>Active delegations</dt>
      <dd>{activeDelegations}</dd>
      <dt>Role assignments</dt>
      <dd>{authority.roleAssignments.length}</dd>
      <dt>Invalid authority decisions</dt>
      <dd>{invalidDecisions}</dd>
    </dl>
  );
}
