import * as React from 'react';

export interface AocErrorStateProps {
  readonly message: string;
  readonly reasonCode?: string;
}

/** User-facing error surface. Never renders a raw stack trace or exception object. */
export function AocErrorState({ message, reasonCode }: AocErrorStateProps): React.ReactElement {
  return (
    <div className="aoc-error-state" role="alert">
      <p className="aoc-error-state__message">{message}</p>
      {reasonCode !== undefined ? <p className="aoc-error-state__code">Reason code: {reasonCode}</p> : null}
    </div>
  );
}
