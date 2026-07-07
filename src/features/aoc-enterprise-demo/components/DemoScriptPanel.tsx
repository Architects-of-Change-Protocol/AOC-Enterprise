import * as React from 'react';
import type { DemoScript } from '../domain/demo-script.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoScriptPanelProps {
  readonly scripts: readonly DemoScript[];
}

export function DemoScriptPanel({ scripts }: DemoScriptPanelProps): React.ReactElement {
  if (scripts.length === 0) {
    return <DemoEmptyState message="No demo scripts have been generated for this scenario yet." />;
  }

  return (
    <div className="aoc-demo-script-panel">
      {scripts.map((script) => (
        <article key={script.id} className="aoc-demo-script-panel__script">
          <h4>{script.audience}</h4>
          <p className="aoc-demo-script-panel__duration">{script.durationMinutes} min</p>
          <p className="aoc-demo-script-panel__opening">{script.opening}</p>
          <ol>
            {script.talkTrack.map((segment) => (
              <li key={segment.id}>
                <p className="aoc-demo-script-panel__segment-title">{segment.title}</p>
                <p className="aoc-demo-script-panel__segment-narration">{segment.narration}</p>
              </li>
            ))}
          </ol>
          <p className="aoc-demo-script-panel__closing">{script.closing}</p>
        </article>
      ))}
    </div>
  );
}
