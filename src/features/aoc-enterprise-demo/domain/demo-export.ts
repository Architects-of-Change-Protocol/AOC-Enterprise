import type { DemoScenarioId } from './demo-scenario.js';

export type DemoExportArtifactType =
  | 'json_summary'
  | 'markdown_script'
  | 'operator_walkthrough'
  | 'technical_trace'
  | 'sales_one_pager';

export interface DemoExportArtifact {
  readonly id: string;
  readonly scenarioId: DemoScenarioId;
  readonly type: DemoExportArtifactType;
  readonly title: string;
  readonly content: string;
  readonly createdAt: string;
}
