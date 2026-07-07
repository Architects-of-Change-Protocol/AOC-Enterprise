import * as React from 'react';
import type { DemoExportArtifact } from '../domain/demo-export.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoArtifactsPanelProps {
  readonly artifacts: readonly DemoExportArtifact[];
}

const ARTIFACT_LABELS: Readonly<Record<DemoExportArtifact['type'], string>> = {
  json_summary: 'JSON summary',
  markdown_script: 'Markdown script',
  operator_walkthrough: 'Operator walkthrough',
  technical_trace: 'Technical trace',
  sales_one_pager: 'Sales one-pager',
};

export function DemoArtifactsPanel({ artifacts }: DemoArtifactsPanelProps): React.ReactElement {
  if (artifacts.length === 0) {
    return <DemoEmptyState message="No export artifacts have been generated for this scenario yet." />;
  }

  return (
    <div className="aoc-demo-artifacts-panel">
      {artifacts.map((artifact) => (
        <details key={artifact.id} className="aoc-demo-artifacts-panel__artifact">
          <summary>{ARTIFACT_LABELS[artifact.type]}</summary>
          <pre>{artifact.content}</pre>
        </details>
      ))}
    </div>
  );
}
