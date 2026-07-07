import * as React from 'react';
import type { DemoExportArtifact, DemoExportArtifactType } from '../domain/demo-export.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoExportPanelProps {
  readonly artifacts: readonly DemoExportArtifact[];
  readonly selectedType?: DemoExportArtifactType;
  readonly onSelectType?: (type: DemoExportArtifactType) => void;
}

/** Interactive export selector: pick an artifact type, see its real generated content. Never regenerates content itself. */
export function DemoExportPanel({ artifacts, selectedType, onSelectType }: DemoExportPanelProps): React.ReactElement {
  if (artifacts.length === 0) {
    return <DemoEmptyState message="No export artifacts are available for this scenario yet." />;
  }

  const activeType = selectedType ?? artifacts[0]!.type;
  const activeArtifact = artifacts.find((artifact) => artifact.type === activeType);

  return (
    <div className="aoc-demo-export-panel">
      <div className="aoc-demo-export-panel__tabs" role="tablist" aria-label="Export artifact type">
        {artifacts.map((artifact) => (
          <button
            key={artifact.type}
            type="button"
            role="tab"
            aria-selected={artifact.type === activeType}
            onClick={onSelectType ? () => onSelectType(artifact.type) : undefined}
          >
            {artifact.title}
          </button>
        ))}
      </div>
      {activeArtifact !== undefined ? (
        <pre className="aoc-demo-export-panel__content" data-testid="export-content">
          {activeArtifact.content}
        </pre>
      ) : (
        <DemoEmptyState message="Select an export artifact type to view its content." />
      )}
    </div>
  );
}
