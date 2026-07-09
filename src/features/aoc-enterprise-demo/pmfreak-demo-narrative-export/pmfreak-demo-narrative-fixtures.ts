import { buildPMFreakDemoControlPlaneFixtures } from '../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoNarrativeExport } from './pmfreak-demo-narrative-builder.js';
import { createPMFreakDemoNarrativeComparisonExport } from './pmfreak-demo-comparison-narrative.js';
import { createPMFreakDemoNarrativeDashboardExport } from './pmfreak-demo-dashboard-narrative.js';
import type { PMFreakDemoNarrativeComparisonExport, PMFreakDemoNarrativeDashboardExport, PMFreakDemoNarrativeExport } from './pmfreak-demo-narrative-export-types.js';

/**
 * Deterministic narrative export fixtures for the PMFreak Demo Narrative
 * Export Pack. Every fixture is built from a real Control Plane View
 * fixture -- never hand-authored decision data -- so a fixture's decision
 * can never drift from what the Control Plane View, the scenario runner,
 * and the real `@aoc-enterprise/pmfreak-agent-passport-foundation` resolver
 * actually compute.
 *
 * Building these fixtures requires the Control Plane View's own fixtures
 * (`buildPMFreakDemoControlPlaneFixtures`), which are inherently async (real
 * passport issuance). `buildPMFreakDemoNarrativeExportFixtures` is therefore
 * an async factory, memoized so every caller in a process shares the same
 * computed fixtures.
 */
export interface PMFreakDemoNarrativeExportFixtures {
  readonly demoBillingReadinessMissingEvidenceNarrativeExport: PMFreakDemoNarrativeExport;
  readonly demoBillingReadinessMissingApprovalNarrativeExport: PMFreakDemoNarrativeExport;
  readonly demoBillingReadinessAllowedNarrativeExport: PMFreakDemoNarrativeExport;
  readonly demoScheduleApplyDeniedNarrativeExport: PMFreakDemoNarrativeExport;
  readonly demoBillingReadinessNarrativeComparisonExport: PMFreakDemoNarrativeComparisonExport;
  readonly demoPMFreakDashboardNarrativeExport: PMFreakDemoNarrativeDashboardExport;
}

async function buildPMFreakDemoNarrativeExportFixturesUncached(): Promise<PMFreakDemoNarrativeExportFixtures> {
  const controlPlaneFixtures = await buildPMFreakDemoControlPlaneFixtures();

  return {
    demoBillingReadinessMissingEvidenceNarrativeExport: createPMFreakDemoNarrativeExport(controlPlaneFixtures.demoBillingReadinessMissingEvidenceView),
    demoBillingReadinessMissingApprovalNarrativeExport: createPMFreakDemoNarrativeExport(controlPlaneFixtures.demoBillingReadinessMissingApprovalView),
    demoBillingReadinessAllowedNarrativeExport: createPMFreakDemoNarrativeExport(controlPlaneFixtures.demoBillingReadinessAllowedView),
    demoScheduleApplyDeniedNarrativeExport: createPMFreakDemoNarrativeExport(controlPlaneFixtures.demoScheduleApplyDeniedView),
    demoBillingReadinessNarrativeComparisonExport: createPMFreakDemoNarrativeComparisonExport(controlPlaneFixtures.demoBillingReadinessComparison),
    demoPMFreakDashboardNarrativeExport: createPMFreakDemoNarrativeDashboardExport(controlPlaneFixtures.demoPMFreakControlPlaneDashboard),
  };
}

let cachedFixtures: Promise<PMFreakDemoNarrativeExportFixtures> | undefined;

/**
 * Returns this process's single, memoized set of narrative export fixtures.
 * The first caller triggers the Control Plane View's real (async) fixture
 * build; every subsequent caller receives the same already-built result.
 */
export function buildPMFreakDemoNarrativeExportFixtures(): Promise<PMFreakDemoNarrativeExportFixtures> {
  if (cachedFixtures === undefined) cachedFixtures = buildPMFreakDemoNarrativeExportFixturesUncached();
  return cachedFixtures;
}
