import * as React from 'react';
import type { RoleAssignmentRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface RoleAssignmentsTableProps {
  readonly roleAssignments: readonly RoleAssignmentRow[];
}

export function RoleAssignmentsTable({ roleAssignments }: RoleAssignmentsTableProps): React.ReactElement {
  if (roleAssignments.length === 0) {
    return <AocEmptyState message="No role assignments." />;
  }
  return (
    <table className="aoc-table" aria-label="Role assignments">
      <thead>
        <tr>
          <th scope="col">Assignment</th>
          <th scope="col">Actor</th>
          <th scope="col">Role</th>
          <th scope="col">Status</th>
          <th scope="col">Assigned</th>
        </tr>
      </thead>
      <tbody>
        {roleAssignments.map((role) => (
          <tr key={role.id}>
            <th scope="row">{role.id}</th>
            <td>{role.actorId}</td>
            <td>{role.roleId}</td>
            <td>{role.status}</td>
            <td>{role.assignedAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
