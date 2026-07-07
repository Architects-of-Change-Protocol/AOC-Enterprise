import * as React from 'react';
import type { AuthorityViewModel, AuthorityProofRow } from '../../domain/control-plane-view-model.js';
import { AuthorityGraphSummary } from './AuthorityGraphSummary.js';
import { AuthorityChainViewer } from './AuthorityChainViewer.js';
import { AuthorityGrantsTable } from './AuthorityGrantsTable.js';
import { DelegationGrantsTable } from './DelegationGrantsTable.js';
import { RoleAssignmentsTable } from './RoleAssignmentsTable.js';
import { AuthorityProofDetail } from './AuthorityProofDetail.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface AuthorityPanelProps {
  readonly authority: AuthorityViewModel;
  readonly onRevokeGrant?: ((grantId: string) => void) | undefined;
  readonly onRevokeDelegation?: ((delegationId: string) => void) | undefined;
}

export function AuthorityPanel({ authority, onRevokeGrant, onRevokeDelegation }: AuthorityPanelProps): React.ReactElement {
  const [selectedProof, setSelectedProof] = React.useState<AuthorityProofRow | undefined>(undefined);

  return (
    <section className="aoc-panel" aria-label="Authority">
      <h2>Authority</h2>
      <AuthorityGraphSummary authority={authority} />

      <h3>Authority chain</h3>
      <AuthorityChainViewer grants={authority.grants} delegations={authority.delegations} />

      <h3>Authority grants</h3>
      <AuthorityGrantsTable grants={authority.grants} onRevoke={onRevokeGrant ? (grant) => onRevokeGrant(grant.id) : undefined} />

      <h3>Delegation grants</h3>
      <DelegationGrantsTable delegations={authority.delegations} onRevoke={onRevokeDelegation ? (d) => onRevokeDelegation(d.id) : undefined} />

      <h3>Role assignments</h3>
      <RoleAssignmentsTable roleAssignments={authority.roleAssignments} />

      <h3>Authority proofs</h3>
      {authority.proofs.length === 0 ? (
        <AocEmptyState message="No authority proofs generated." />
      ) : (
        <ul className="aoc-list">
          {authority.proofs.map((proof) => (
            <li key={proof.id}>
              <button type="button" onClick={() => setSelectedProof(proof)}>
                {proof.id} ({proof.decisionType})
              </button>
            </li>
          ))}
        </ul>
      )}
      {selectedProof !== undefined ? <AuthorityProofDetail proof={selectedProof} /> : null}
    </section>
  );
}
