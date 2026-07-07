import * as React from 'react';
import type { PassportRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';
import { AocProofLink } from '../AocProofLink.js';

export interface PassportsTableProps {
  readonly passports: readonly PassportRow[];
}

export function PassportsTable({ passports }: PassportsTableProps): React.ReactElement {
  if (passports.length === 0) {
    return <AocEmptyState message="No passports issued." />;
  }
  return (
    <table className="aoc-table" aria-label="Passports">
      <thead>
        <tr>
          <th scope="col">Passport</th>
          <th scope="col">Actor</th>
          <th scope="col">Status</th>
          <th scope="col">Issued</th>
          <th scope="col">Expires</th>
          <th scope="col">Proof</th>
        </tr>
      </thead>
      <tbody>
        {passports.map((passport) => (
          <tr key={passport.id}>
            <th scope="row">{passport.id}</th>
            <td>{passport.actorId}</td>
            <td>{passport.status}</td>
            <td>{passport.issuedAt}</td>
            <td>{passport.expiresAt ?? '—'}</td>
            <td>
              <AocProofLink proofHash={passport.passportHash} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
