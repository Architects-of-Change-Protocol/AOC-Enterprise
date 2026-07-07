import type { DemoAssertionResult } from './demo-assertion.js';
import type { DemoControlPlaneSnapshot } from './demo-control-plane-snapshot.js';
import type { DemoExportArtifact } from './demo-export.js';
import type { DemoScenarioOutcome } from './demo-outcome.js';
import type { DemoProofChain } from './demo-proof-chain.js';
import type { DemoScenarioId } from './demo-scenario.js';

export type DemoStepKind =
  | 'setup'
  | 'recognition'
  | 'authority'
  | 'approval'
  | 'external_handshake'
  | 'enforcement'
  | 'control_plane'
  | 'proof'
  | 'operator_explanation';

export type DemoStepEventSource = 'recognition' | 'authority' | 'approval' | 'handshake' | 'enforcement';

export interface DemoStepDefinition {
  readonly id: string;
  readonly kind: DemoStepKind;
  readonly title: string;
  readonly description: string;
  readonly operatorNarration: string;
  readonly expectedState?: string;
  readonly expectedEventSource?: DemoStepEventSource;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type DemoStepRunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface DemoStepRun {
  readonly id: string;
  readonly scenarioId: DemoScenarioId;
  readonly stepId: string;
  readonly kind: DemoStepKind;
  readonly status: DemoStepRunStatus;
  readonly title: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly summary: string;
  readonly relatedEntityIds: readonly string[];
  readonly relatedProofIds: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type DemoScenarioRunStatus = 'not_started' | 'running' | 'passed' | 'failed';

export interface DemoScenarioRun {
  readonly id: string;
  readonly scenarioId: DemoScenarioId;
  readonly status: DemoScenarioRunStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly steps: readonly DemoStepRun[];
  readonly outcome?: DemoScenarioOutcome;
  readonly assertions: readonly DemoAssertionResult[];
  readonly controlPlaneSnapshot?: DemoControlPlaneSnapshot;
  readonly proofChain?: DemoProofChain;
  readonly exportArtifacts: readonly DemoExportArtifact[];
}
