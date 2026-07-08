import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertNoPolicyPackOverclaim } from '../../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { assertNoPMFreakAgentPassportOverclaim, buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import { assertNoPMFreakScenarioOverclaim, evaluatePMFreakScenarioClaimSafety } from '../pmfreak-scenario-claim-safety.js';
import { createPMFreakProjectGovernanceScenarioPackManifest } from '../pmfreak-project-governance-scenario-manifest.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioControlPlaneSummary } from '../pmfreak-scenario-control-plane-summary.js';
import { createPMFreakProjectGovernanceScenarioExportMetadata } from '../pmfreak-scenario-export-metadata.js';
import { PMFREAK_SCENARIO_CONTROL_PLANE_SAFE_LABELS } from '../pmfreak-scenario-control-plane-summary.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('PMFreak Project Governance Scenario Pack passes the universal no-overclaim harness', () => {
  it('35a. the manifest and every demo scenario pass all three claim-safety layers', () => {
    const manifest = createPMFreakProjectGovernanceScenarioPackManifest();
    assertNoPolicyPackOverclaim(manifest);
    assertNoPMFreakAgentPassportOverclaim(manifest);
    assertNoPMFreakScenarioOverclaim(manifest);

    assertNoPolicyPackOverclaim(demoPMFreakProjectGovernanceScenarios);
    assertNoPMFreakAgentPassportOverclaim(demoPMFreakProjectGovernanceScenarios);
    assertNoPMFreakScenarioOverclaim(demoPMFreakProjectGovernanceScenarios);
  });

  it('35b. every scenario run result, Control Plane summary, and export metadata passes claim safety', () => {
    for (const scenario of demoPMFreakProjectGovernanceScenarios) {
      const result = runPMFreakProjectGovernanceScenario({ scenarioId: scenario.scenarioId }, scenarioRegistry, passportRegistry);
      assertNoPMFreakScenarioOverclaim(result);

      const summary = createPMFreakProjectGovernanceScenarioControlPlaneSummary(result);
      assertNoPMFreakScenarioOverclaim(summary);

      const metadata = createPMFreakProjectGovernanceScenarioExportMetadata(result, scenario.projectContext);
      assertNoPMFreakScenarioOverclaim(metadata);
    }
  });

  it('36. unsafe scenario claims are caught', () => {
    const unsafeClaims = [
      'invoice ready certified',
      'customer acceptance certified',
      'contractually compliant',
      'fully governed',
      'fully trusted agent',
      'risk-free execution',
      'legally approved',
      'compliance passed',
      'guaranteed billing',
      'production authorized',
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
