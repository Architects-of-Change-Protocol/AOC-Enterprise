import * as React from 'react';

export interface DemoEmptyStateProps {
  readonly message: string;
}

export function DemoEmptyState({ message }: DemoEmptyStateProps): React.ReactElement {
  return (
    <p className="aoc-demo-empty-state" role="status">
      {message}
    </p>
  );
}
