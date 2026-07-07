import type { DemoScenarioId } from './demo-scenario.js';

export type DemoControlPlanePanel =
  | 'overview'
  | 'recognition'
  | 'authority'
  | 'approvals'
  | 'external_agents'
  | 'enforcement'
  | 'proofs';

export interface DemoHighlightedControlPlaneRow {
  readonly id: string;
  readonly panel: DemoControlPlanePanel;
  readonly rowId: string;
  readonly reason: string;
}

export interface DemoControlPlaneSnapshot {
  readonly id: string;
  readonly scenarioId: DemoScenarioId;
  readonly trustDomainId: string;
  readonly generatedAt: string;
  readonly overviewMetricIds: readonly string[];
  readonly visiblePanelIds: readonly DemoControlPlanePanel[];
  readonly highlightedRows: readonly DemoHighlightedControlPlaneRow[];
  readonly timelineItemIds: readonly string[];
  readonly proofChainIds: readonly string[];
}
