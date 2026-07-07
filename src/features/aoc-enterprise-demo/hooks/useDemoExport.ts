import * as React from 'react';
import type { DemoExportArtifact, DemoExportArtifactType } from '../domain/demo-export.js';

export interface UseDemoExportResult {
  readonly artifacts: readonly DemoExportArtifact[];
  readonly selectedType?: DemoExportArtifactType;
  readonly selectedArtifact?: DemoExportArtifact;
  readonly selectType: (type: DemoExportArtifactType) => void;
}

/** Tracks which export artifact type is selected for display/download. Never regenerates artifact content itself. */
export function useDemoExport(artifacts: readonly DemoExportArtifact[]): UseDemoExportResult {
  const [selectedType, setSelectedType] = React.useState<DemoExportArtifactType | undefined>(artifacts[0]?.type);
  const selectedArtifact = artifacts.find((artifact) => artifact.type === selectedType);

  return {
    artifacts,
    ...(selectedType !== undefined ? { selectedType } : {}),
    ...(selectedArtifact !== undefined ? { selectedArtifact } : {}),
    selectType: setSelectedType,
  };
}
