import type { PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import type { PMFreakDemoExportPanel, PMFreakDemoPanelFinding } from './pmfreak-demo-control-plane-view-types.js';

const EXPORT_LABEL = 'Audit-ready demo export';

/**
 * Builds a claim-safe export status panel from a scenario run result. Never
 * calls a real export or network service -- only presents whether the run
 * result carries the fields `createPMFreakProjectGovernanceScenarioExportMetadata`
 * (from the Project Governance Scenario Pack) needs to build a real export
 * record; it does not itself build one.
 */
export function createPMFreakDemoExportPanel(result: PMFreakProjectGovernanceScenarioRunResult): PMFreakDemoExportPanel {
  const traceIncluded = result.scenarioTrace.length > 0;
  const warningsIncluded = result.warnings.length > 0;
  const errorsIncluded = result.errors.length > 0;
  const safeFramingIncluded = true;
  const exportMetadataAvailable = true;
  const exportReady = traceIncluded && exportMetadataAvailable;

  const findings: PMFreakDemoPanelFinding[] = [
    {
      id: 'trace_included',
      label: 'Trace included',
      status: traceIncluded ? 'passed' : 'failed',
      detail: traceIncluded ? 'The scenario trace is included in the export-ready record.' : 'No scenario trace is available to include in an export-ready record.',
    },
    {
      id: 'safe_framing_included',
      label: 'Safe framing included',
      status: 'passed',
      detail: 'The export-ready record carries safe framing: not legal advice, not a compliance certification, demo only.',
    },
  ];

  const panel: PMFreakDemoExportPanel = {
    exportReady,
    exportLabel: EXPORT_LABEL,
    exportMetadataAvailable,
    traceIncluded,
    warningsIncluded,
    errorsIncluded,
    safeFramingIncluded,
    findings,
  };

  assertNoPMFreakDemoControlPlaneOverclaim(panel);
  return panel;
}
