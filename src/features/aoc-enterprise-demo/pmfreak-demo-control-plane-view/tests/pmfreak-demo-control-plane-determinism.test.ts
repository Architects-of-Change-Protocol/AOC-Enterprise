import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { buildPMFreakDemoControlPlaneFixtures } from '../pmfreak-demo-control-plane-fixtures.js';
import type { PMFreakDemoControlPlaneFixtures } from '../pmfreak-demo-control-plane-fixtures.js';
import { createPMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view-model.js';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  getPMFreakRealAgentPassportFixtures,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import type { PMFreakScenarioRunnerDeps } from '../../pmfreak-project-governance-scenarios/index.js';

// Hardcoded, not filesystem-scanned: this repo prefers deterministic static
// lists over directory walks, and the pinned 'fs' type shim used here does
// not declare readdirSync/statSync.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'pmfreak-demo-control-plane-view-constants.ts',
  'pmfreak-demo-control-plane-view-types.ts',
  'pmfreak-demo-decision-badges.ts',
  'pmfreak-demo-agent-passport-card.ts',
  'pmfreak-demo-action-card.ts',
  'pmfreak-demo-evidence-panel.ts',
  'pmfreak-demo-approval-panel.ts',
  'pmfreak-demo-authority-panel.ts',
  'pmfreak-demo-trace-timeline.ts',
  'pmfreak-demo-policy-reference-panel.ts',
  'pmfreak-demo-export-panel.ts',
  'pmfreak-demo-control-plane-view-model.ts',
  'pmfreak-demo-dashboard.ts',
  'pmfreak-demo-comparison.ts',
  'pmfreak-demo-control-plane-fixtures.ts',
  'pmfreak-demo-control-plane-claim-safety.ts',
  'index.ts',
];

// Disallowed patterns, deliberately not written as contiguous literal
// substrings of the forbidden token -- otherwise this very file (which must
// name every forbidden pattern) would flag itself.
const DISALLOWED_PATTERNS: readonly RegExp[] = [
  /\bfetch\s*\(/,
  new RegExp('\\b' + ['ax', 'ios'].join('') + '\\b', 'i'),
  new RegExp('\\b' + ['XMLHttp', 'Request'].join('') + '\\b'),
  new RegExp(['open', 'ai'].join(''), 'i'),
  new RegExp(['anthro', 'pic'].join(''), 'i'),
  new RegExp('\\b' + ['O', 'C', 'R'].join('') + '\\b'),
  new RegExp(['pdf', 'parse'].join('-')),
  new RegExp(['tesse', 'ract'].join(''), 'i'),
  new RegExp(['web', 'lookup'].join(' '), 'i'),
  /\bMath\.random\s*\(/,
  /\bDate\.now\s*\(/,
  /\bnew\s+Date\s*\(\s*\)/,
  /function\s+sendEmail/,
  /function\s+createInvoice/,
  /function\s+updateProject/,
  /function\s+markMilestoneCompleteInProduction/,
  /function\s+syncPMFreak/,
  /function\s+callPMFreakApi/,
  /function\s+postToSlack/,
  /function\s+sendClientCommunication/,
];

function readModuleFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src/features/aoc-enterprise-demo/pmfreak-demo-control-plane-view', relativePath), 'utf8');
}

let fixtures: PMFreakDemoControlPlaneFixtures;
let runnerDeps: PMFreakScenarioRunnerDeps;
const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('PMFreak Demo Control Plane View -- determinism and offline execution', () => {
  it('33 & 35. never uses network/LLM/OCR/PDF/web-lookup/nondeterministic-clock calls, and defines no real-mutation function', () => {
    assert.ok(MODULE_RELATIVE_FILES.length > 10);

    const violations: string[] = [];
    for (const relativePath of MODULE_RELATIVE_FILES) {
      const text = readModuleFile(relativePath);
      for (const pattern of DISALLOWED_PATTERNS) {
        if (pattern.test(text)) violations.push(`${relativePath}: matched ${pattern}`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it('28. fixtures are deterministic -- stable ids, and repeated builder calls on the same input produce identical output', async () => {
    for (const fixture of [
      fixtures.demoBillingReadinessMissingEvidenceView,
      fixtures.demoBillingReadinessMissingApprovalView,
      fixtures.demoBillingReadinessAllowedView,
      fixtures.demoScheduleApplyDeniedView,
      fixtures.demoClientCommunicationApprovalRequiredView,
      fixtures.demoChangeControlDeniedView,
    ]) {
      assert.ok(fixture.scenarioId.startsWith('pmfreak.scenario.'));
    }
    assert.equal(fixtures.demoBillingReadinessMissingEvidenceView.scenarioId, PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID);

    assert.ok(fixtures.demoPMFreakControlPlaneDashboard.dashboardId.length > 0);
    assert.ok(fixtures.demoBillingReadinessComparison.comparisonId.length > 0);

    // buildPMFreakDemoControlPlaneFixtures() is memoized process-wide -- calling it again returns
    // the exact same already-built fixtures object.
    const second = await buildPMFreakDemoControlPlaneFixtures();
    assert.equal(second, fixtures);

    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);

    const first = createPMFreakDemoControlPlaneViewModel(result);
    const repeat = createPMFreakDemoControlPlaneViewModel(result);
    assert.deepEqual(first, repeat);
  });
});
