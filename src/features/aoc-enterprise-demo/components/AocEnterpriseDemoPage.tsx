import * as React from 'react';
import type { DemoPersona } from '../domain/demo-persona.js';
import type { DemoScenario, DemoScenarioId } from '../domain/demo-scenario.js';
import type { DemoScript } from '../domain/demo-script.js';
import type { DemoScenarioRun } from '../domain/demo-step.js';
import { DemoArtifactsPanel } from './DemoArtifactsPanel.js';
import { DemoAssertionPanel } from './DemoAssertionPanel.js';
import { DemoControlPlaneSnapshotPanel } from './DemoControlPlaneSnapshotPanel.js';
import { DemoEmptyState } from './DemoEmptyState.js';
import { DemoErrorState } from './DemoErrorState.js';
import { DemoExportPanel } from './DemoExportPanel.js';
import { DemoOutcomePanel } from './DemoOutcomePanel.js';
import { DemoProofChainPanel } from './DemoProofChainPanel.js';
import { DemoScenarioDetail } from './DemoScenarioDetail.js';
import { DemoScenarioSelector } from './DemoScenarioSelector.js';
import { DemoScenarioTimeline } from './DemoScenarioTimeline.js';
import { DemoScriptPanel } from './DemoScriptPanel.js';

export interface AocEnterpriseDemoPageProps {
  readonly scenarios: readonly DemoScenario[];
  readonly personas?: readonly DemoPersona[];
  readonly selectedScenarioId?: DemoScenarioId;
  readonly run?: DemoScenarioRun;
  readonly scripts?: readonly DemoScript[];
  readonly errorMessage?: string;
  readonly onSelectScenario?: (scenarioId: DemoScenarioId) => void;
  readonly onRunScenario?: (scenarioId: DemoScenarioId) => void;
}

/**
 * The single mount point for the AOC Enterprise Demo Scenario Pack. It only
 * ever reads `scenarios`/`run`/`scripts` -- built upstream by
 * DemoScenarioRegistry, DemoScenarioRunner and DemoScriptService from real
 * runtime output -- and dispatches `onRunScenario` verbatim to whatever
 * DemoScenarioRunner wiring the caller supplies. It never fabricates a
 * scenario outcome itself.
 */
export function AocEnterpriseDemoPage({
  scenarios,
  personas,
  selectedScenarioId,
  run,
  scripts,
  errorMessage,
  onSelectScenario,
  onRunScenario,
}: AocEnterpriseDemoPageProps): React.ReactElement {
  const activeScenarioId = selectedScenarioId ?? scenarios[0]?.id;
  const selectedScenario = scenarios.find((scenario) => scenario.id === activeScenarioId);

  return (
    <div className="aoc-enterprise-demo-page">
      <header>
        <h1>AOC Enterprise Demo Scenario Pack</h1>
        <p className="aoc-enterprise-demo-page__subtitle">Deterministic enterprise scenarios for governed autonomous execution</p>
      </header>

      {errorMessage !== undefined ? <DemoErrorState message={errorMessage} /> : null}

      <div className="aoc-enterprise-demo-page__body">
        <nav aria-label="Scenario selection">
          <DemoScenarioSelector scenarios={scenarios} {...(activeScenarioId !== undefined ? { selectedScenarioId: activeScenarioId } : {})} {...(onSelectScenario !== undefined ? { onSelect: onSelectScenario } : {})} />
        </nav>

        <main>
          {selectedScenario === undefined ? (
            <DemoEmptyState message="Select a scenario to see its details." />
          ) : (
            <>
              <DemoScenarioDetail scenario={selectedScenario} {...(personas !== undefined ? { personas } : {})} />

              {onRunScenario !== undefined ? (
                <button type="button" onClick={() => onRunScenario(selectedScenario.id)}>
                  Run scenario
                </button>
              ) : null}

              <section aria-label="Scenario timeline">
                <h3>Timeline</h3>
                <DemoScenarioTimeline steps={run?.steps ?? []} />
              </section>

              <section aria-label="Scenario outcome">
                <h3>Outcome</h3>
                <DemoOutcomePanel {...(run?.outcome !== undefined ? { outcome: run.outcome } : {})} />
              </section>

              <section aria-label="Scenario assertions">
                <h3>Assertions</h3>
                <DemoAssertionPanel assertions={run?.assertions ?? []} />
              </section>

              <section aria-label="Proof chain">
                <h3>Proof chain</h3>
                <DemoProofChainPanel {...(run?.proofChain !== undefined ? { proofChain: run.proofChain } : {})} />
              </section>

              <section aria-label="Control Plane snapshot">
                <h3>Control Plane snapshot</h3>
                <DemoControlPlaneSnapshotPanel {...(run?.controlPlaneSnapshot !== undefined ? { snapshot: run.controlPlaneSnapshot } : {})} />
              </section>

              {scripts !== undefined ? (
                <section aria-label="Demo scripts">
                  <h3>Scripts</h3>
                  <DemoScriptPanel scripts={scripts} />
                </section>
              ) : null}

              <section aria-label="Export artifacts">
                <h3>Exports</h3>
                <DemoExportPanel artifacts={run?.exportArtifacts ?? []} />
                <DemoArtifactsPanel artifacts={run?.exportArtifacts ?? []} />
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
