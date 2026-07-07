import * as React from 'react';
import type { DemoAssertionResult } from '../domain/demo-assertion.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoAssertionPanelProps {
  readonly assertions: readonly DemoAssertionResult[];
}

export function DemoAssertionPanel({ assertions }: DemoAssertionPanelProps): React.ReactElement {
  if (assertions.length === 0) {
    return <DemoEmptyState message="No assertions have been evaluated for this scenario yet." />;
  }

  return (
    <table className="aoc-table" aria-label="Scenario assertions">
      <thead>
        <tr>
          <th scope="col">Assertion</th>
          <th scope="col">Type</th>
          <th scope="col">Result</th>
          <th scope="col">Expected</th>
          <th scope="col">Actual</th>
          <th scope="col">Reason</th>
        </tr>
      </thead>
      <tbody>
        {assertions.map((assertion) => (
          <tr key={assertion.id} className={assertion.passed ? 'aoc-demo-assertion-panel__row--passed' : 'aoc-demo-assertion-panel__row--failed'}>
            <th scope="row">{assertion.assertionId}</th>
            <td>{assertion.type}</td>
            <td data-testid="assertion-result">{assertion.passed ? 'PASS' : 'FAIL'}</td>
            <td>{assertion.expected}</td>
            <td>{assertion.actual}</td>
            <td>{assertion.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
