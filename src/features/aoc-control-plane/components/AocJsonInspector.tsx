import * as React from 'react';

export interface AocJsonInspectorProps {
  readonly title: string;
  readonly value: unknown;
}

/** Read-only structured inspector for a domain object -- what you see is exactly the read model's own data, never a paraphrase. */
export function AocJsonInspector({ title, value }: AocJsonInspectorProps): React.ReactElement {
  return (
    <details className="aoc-json-inspector">
      <summary>{title}</summary>
      <pre className="aoc-json-inspector__body">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
