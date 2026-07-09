import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { assertNoPolicyPackOverclaim } from '../../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import type { PMFreakScenarioRunnerDeps } from '../pmfreak-scenario-runner.js';
import { assertNoPMFreakScenarioOverclaim, evaluatePMFreakScenarioClaimSafety } from '../pmfreak-scenario-claim-safety.js';
import { createPMFreakProjectGovernanceScenarioPackManifest } from '../pmfreak-project-governance-scenario-manifest.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { getPMFreakRealAgentPassportFixtures } from '../pmfreak-real-agent-passport-fixtures.js';
import { createPMFreakProjectGovernanceScenarioControlPlaneSummary } from '../pmfreak-scenario-control-plane-summary.js';
import { createPMFreakProjectGovernanceScenarioExportMetadata } from '../pmfreak-scenario-export-metadata.js';
import { PMFREAK_SCENARIO_CONTROL_PLANE_SAFE_LABELS } from '../pmfreak-scenario-control-plane-summary.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

describe('PMFreak Project Governance Scenario Pack passes the universal no-overclaim harness', () => {
  /**
   * This pack's claim-safety module (`pmfreak-scenario-claim-safety.ts`) no longer imports
   * anything from `pmfreak-agent-passport` (the old demo pack) -- it layers directly on
   * `evaluatePolicyPackClaimSafety`/`assertNoPolicyPackOverclaim` from the universal Policy Pack
   * Foundation, so this test now checks exactly those two layers (universal, then
   * scenario-specific) instead of also running the old demo pack's own, no-longer-relevant
   * PMFreak-wide claim-safety layer.
   */
  it('35a. the manifest and every demo scenario pass both claim-safety layers this pack actually depends on', () => {
    const manifest = createPMFreakProjectGovernanceScenarioPackManifest();
    assertNoPolicyPackOverclaim(manifest);
    assertNoPMFreakScenarioOverclaim(manifest);

    assertNoPolicyPackOverclaim(demoPMFreakProjectGovernanceScenarios);
    assertNoPMFreakScenarioOverclaim(demoPMFreakProjectGovernanceScenarios);
  });

  it('35b. every scenario run result, Control Plane summary, and export metadata passes claim safety', async () => {
    for (const scenario of demoPMFreakProjectGovernanceScenarios) {
      const result = await runPMFreakProjectGovernanceScenario({ scenarioId: scenario.scenarioId }, scenarioRegistry, runnerDeps);
      assertNoPMFreakScenarioOverclaim(result);

      const summary = createPMFreakProjectGovernanceScenarioControlPlaneSummary(result);
      assertNoPMFreakScenarioOverclaim(summary);

      const metadata = createPMFreakProjectGovernanceScenarioExportMetadata(result, scenario.projectContext);
      assertNoPMFreakScenarioOverclaim(metadata);
    }
  });

  /**
   * This pack's claim-safety module no longer imports `pmfreak-agent-passport`'s PMFreak-wide
   * phrase list (see pmfreak-scenario-claim-safety.ts's header comment), but it carries its own
   * copy of that same list, so PMFreak-wide claims stay caught. Every claim below is caught by
   * either the universal Policy Pack Foundation list or this pack's own
   * `PMFREAK_SCENARIO_PROHIBITED_OVERCLAIM_PHRASES` (which now includes the PMFreak-wide list).
   */
  it('36. unsafe scenario claims are caught', () => {
    const unsafeClaims = [
      'invoice ready certified',
      'customer acceptance certified',
      'fully governed',
      'guaranteed billing',
      'risk-free execution',
      'costa rica compliant',
      'fully trusted agent',
      'autonomous approval granted',
      'production authorized',
      'contractually compliant',
      'legally approved',
      'compliance passed',
    ];

    for (const claim of unsafeClaims) {
      const text = `This PMFreak project governance scenario is ${claim}.`;
      const result = evaluatePMFreakScenarioClaimSafety(text);
      assert.equal(result.safe, false, `expected "${claim}" to be flagged unsafe`);
      assert.ok(result.prohibitedPhrasesFound.length > 0);
      assert.throws(() => assertNoPMFreakScenarioOverclaim(text));
    }
  });

  it('37. safe scenario labels never false-positive', () => {
    const safeText = [...PMFREAK_SCENARIO_CONTROL_PLANE_SAFE_LABELS].join('; ');
    const result = evaluatePMFreakScenarioClaimSafety(safeText);

    assert.equal(result.safe, true, JSON.stringify(result.prohibitedPhrasesFound));
    assertNoPMFreakScenarioOverclaim(safeText);
  });
});
