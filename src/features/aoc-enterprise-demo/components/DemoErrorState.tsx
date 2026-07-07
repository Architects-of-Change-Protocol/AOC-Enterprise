import * as React from 'react';

export interface DemoErrorStateProps {
  readonly message: string;
  readonly reasonCode?: string;
}

/** User-facing error surface. Never renders a raw stack trace or exception object. */
export function DemoErrorState({ message, reasonCode }: DemoErrorStateProps): React.ReactElement {
  return (
    <div className="aoc-demo-error-state" role="alert">
      <p className="aoc-demo-error-state__message">{message}</p>
      {reasonCode !== undefined ? <p className="aoc-demo-error-state__code">Reason code: {reasonCode}</p> : null}
    </div>
  );
}
