import * as React from 'react';

export interface AocEmptyStateProps {
  readonly message: string;
}

export function AocEmptyState({ message }: AocEmptyStateProps): React.ReactElement {
  return (
    <p className="aoc-empty-state" role="status">
      {message}
    </p>
  );
}
