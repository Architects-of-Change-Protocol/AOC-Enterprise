import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID } from '../pmfreak-project-governance-scenario-constants.js';

// Hardcoded, not filesystem-scanned -- mirrors pmfreak-agent-passport/tests/pmfreak-agent-determinism.test.ts.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'pmfreak-project-governance-scenario-constants.ts',
  'pmfreak-project-governance-scenario-types.ts',
  'pmfreak-project-governance-scenario-manifest.ts',
  'pmfreak-demo-project-context.ts',
  'pmfreak-demo-project-fixtures.ts',
  'pmfreak-scenario-registry.ts',
  'pmfreak-scenario-runner.ts',
  'pmfreak-scenario-control-plane-summary.ts',
  'pmfreak-scenario-export-metadata.ts',
  'pmfreak-scenario-claim-safety.ts',
  'scenarios/billing-readiness-scenario.ts',
  'scenarios/milestone-acceptance-scenario.ts',
  'scenarios/schedule-change-scenario.ts',
  'scenarios/risk-escalation-scenario.ts',
  'scenarios/client-communication-scenario.ts',
  'scenarios/change-control-scenario.ts',
  'scenarios/index.ts',
  'index.ts',
];

// Deliberately not written as contiguous literal substrings of the forbidden token --
// otherwise this very file would flag itself.
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
];

// This pack must never grow real PMFreak/Datasys production integration or mutation surface.
const PRODUCTION_INTEGRATION_PATTERNS: readonly RegExp[] = [/pmfreak[_.]api[_.]key/i, /pmfreak[_.]bearer[_.]token/i, new RegExp(['oauth', 'client'].join('_'), 'i'), /webhook[_.]secret/i];

const MUTATION_FUNCTION_NAME_PATTERNS: readonly RegExp[] = [
  /\bsendEmail\s*\(/,
  /\bcreateInvoice\s*\(/,
  /\bupdateProject\s*\(/,
  /\bmarkMilestoneCompleteInProduction\s*\(/,
  /\bsyncPMFreak\s*\(/,
  /\bcallPMFreakApi\s*\(/,
  /\bpostToSlack\s*\(/,
  /\bsendClientCommunication\s*\(/,
];

// Only the deterministic demo ids this pack declares itself -- a real Datasys id would never match.
const ALLOWED_DEMO_ID_PATTERN = /^(workspace|project|customer|milestone|risk|change|pmfreak)\.(demo\.|agent\.|action\.|evidence\.|approval\.|capability\.|scenario\.)/;

function readModuleFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src/features/aoc-enterprise-demo/pmfreak-project-governance-scenarios', relativePath), 'utf8');
}

describe('PMFreak Project Governance Scenario Pack determinism', () => {
  it('38. never uses network calls, LLM calls, OCR/PDF parsing, or non-deterministic clocks/randomness', () => {
    assert.ok(MODULE_RELATIVE_FILES.length > 5);

    const violations: string[] = [];
    for (const relativePath of MODULE_RELATIVE_FILES) {
      const text = readModuleFile(relativePath);
      for (const pattern of DISALLOWED_PATTERNS) {
        if (pattern.test(text)) violations.push(`${relativePath}: matched ${pattern}`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it('never introduces real PMFreak production integration credentials or secrets', () => {
    const violations: string[] = [];
    for (const relativePath of MODULE_RELATIVE_FILES) {
      const text = readModuleFile(relativePath);
      for (const pattern of PRODUCTION_INTEGRATION_PATTERNS) {
        if (pattern.test(text)) violations.push(`${relativePath}: matched ${pattern}`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it('40. never defines a real project/schedule/billing/communication mutation function', () => {
    const violations: string[] = [];
    for (const relativePath of MODULE_RELATIVE_FILES) {
      const text = readModuleFile(relativePath);
      for (const pattern of MUTATION_FUNCTION_NAME_PATTERNS) {
        if (pattern.test(text)) violations.push(`${relativePath}: matched ${pattern}`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it('39. every demo scenario, milestone, risk, and change request id is an opaque demo.* id, never a real Datasys/PMFreak identifier', () => {
    for (const scenario of demoPMFreakProjectGovernanceScenarios) {
      assert.ok(ALLOWED_DEMO_ID_PATTERN.test(scenario.projectContext.workspaceId));
      assert.ok(ALLOWED_DEMO_ID_PATTERN.test(scenario.projectContext.projectId));
      assert.ok(ALLOWED_DEMO_ID_PATTERN.test(scenario.projectContext.customerId));
      assert.ok(ALLOWED_DEMO_ID_PATTERN.test(scenario.primaryAgentId));
      assert.ok(ALLOWED_DEMO_ID_PATTERN.test(scenario.primaryActionId));
    }
  });

  it('every scenario definition and demo fixture builder is a pure, deterministic function', () => {
    const registryA = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
    const registryB = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
    assert.deepEqual(registryA.listScenarioIds(), registryB.listScenarioIds());

    const passportRegistry = buildPMFreakAgentPassportRegistryFixture();
    const runA = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, registryA, passportRegistry);
    const runB = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, registryB, passportRegistry);
    assert.deepEqual(runA, runB);
  });

  it('29. scenario traces are deterministic and ordered', () => {
    const passportRegistry = buildPMFreakAgentPassportRegistryFixture();
    const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, scenarioRegistry, passportRegistry);

    assert.deepEqual(
      result.scenarioTrace.map((step) => step.stepId),
      [
        'scenario_loaded',
        'passport_resolved',
        'action_authorized',
        'capability_checked',
        'authority_scope_checked',
        'evidence_checked',
        'approvals_checked',
        'context_sensitivity_checked',
        'decision_computed',
        'control_plane_ready',
        'export_metadata_ready',
      ],
    );

    const repeat = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, scenarioRegistry, passportRegistry);
    assert.deepEqual(result.scenarioTrace, repeat.scenarioTrace);
  });

  it('30. scenario trace details use only safe language -- no breach, invoice-validity, acceptance-certification, or compliance claim', () => {
    const passportRegistry = buildPMFreakAgentPassportRegistryFixture();
    const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);

    for (const scenario of demoPMFreakProjectGovernanceScenarios) {
      const result = runPMFreakProjectGovernanceScenario({ scenarioId: scenario.scenarioId, overrideEvidenceIds: [], overrideApprovalIds: [] }, scenarioRegistry, passportRegistry);
      const traceText = result.scenarioTrace.map((step) => step.detail).join(' ').toLowerCase();

      for (const unsafePhrase of ['customer acceptance invalid', 'invoice invalid', 'project non-compliant', 'contract breach detected', 'certified', 'compliant']) {
        assert.ok(!traceText.includes(unsafePhrase), `expected scenario "${scenario.scenarioId}" trace to never say "${unsafePhrase}"`);
      }
    }
  });
});
