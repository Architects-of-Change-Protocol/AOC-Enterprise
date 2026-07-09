import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import type { PMFreakScenarioRunnerDeps } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { getPMFreakRealAgentPassportFixtures } from '../pmfreak-real-agent-passport-fixtures.js';
import { PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID } from '../pmfreak-project-governance-scenario-constants.js';

// Hardcoded, not filesystem-scanned -- mirrors packages/pmfreak-agent-passport-foundation's own determinism test.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'pmfreak-project-governance-scenario-constants.ts',
  'pmfreak-project-governance-scenario-types.ts',
  'pmfreak-project-governance-scenario-manifest.ts',
  'pmfreak-demo-project-context.ts',
  'pmfreak-demo-project-fixtures.ts',
  'pmfreak-real-agent-passport-fixtures.ts',
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

// Only the deterministic demo ids this pack declares itself for project context -- a real Datasys id would never match.
const ALLOWED_DEMO_ID_PATTERN = /^(workspace|project|customer|milestone|risk|change|pmfreak)\.(demo\.|agent\.|scenario\.)/;
// The real foundation package's own action-id namespace -- distinct from this pack's demo.* ids.
const ALLOWED_FOUNDATION_ACTION_ID_PATTERN = /^pmfreak\.foundation\.action\./;

function readModuleFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src/features/aoc-enterprise-demo/pmfreak-project-governance-scenarios', relativePath), 'utf8');
}

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

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
      assert.ok(ALLOWED_DEMO_ID_PATTERN.test(scenario.agentId));
      assert.ok(ALLOWED_FOUNDATION_ACTION_ID_PATTERN.test(scenario.action.actionId));
    }
  });

  it('every scenario definition and registry builder is a pure, deterministic function', () => {
    const registryA = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
    const registryB = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
    assert.deepEqual(registryA.listScenarioIds(), registryB.listScenarioIds());
  });

  /**
   * Rewritten for the real model: real passport issuance is not literal-string reproducible
   * across independent issuance calls (random id-entropy suffix and wall-clock signature
   * timestamp -- see pmfreak-real-agent-passport-fixtures.ts's header comment), so this pack's
   * determinism guarantee is no longer "two independently-built registries/fixtures produce
   * identical passport ids." It is instead: (a) `getPMFreakRealAgentPassportFixtures()` is a
   * process-wide memoized singleton, so every consumer in one test run shares identical passport
   * objects; and (b) given the SAME registry + SAME runnerDeps + SAME input, two calls to
   * `runPMFreakProjectGovernanceScenario` produce a byte-identical result.
   */
  it('getPMFreakRealAgentPassportFixtures is a process-wide memoized singleton', async () => {
    const first = await getPMFreakRealAgentPassportFixtures();
    const second = await getPMFreakRealAgentPassportFixtures();

    assert.equal(first, second);
    assert.equal(first.byRole.billing_readiness.passport, second.byRole.billing_readiness.passport);
    assert.equal(first.byRole.billing_readiness.passport.passportId, second.byRole.billing_readiness.passport.passportId);
  });

  it('given the same registry, runner deps, and input, runPMFreakProjectGovernanceScenario is byte-identical across calls', async () => {
    const runA = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);
    const runB = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);
    assert.deepEqual(runA, runB);
  });

  it('29. scenario traces are deterministic and ordered', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);

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

    const repeat = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);
    assert.deepEqual(result.scenarioTrace, repeat.scenarioTrace);
  });

  it('30. scenario trace details use only safe language -- no breach, invoice-validity, acceptance-certification, or compliance claim', async () => {
    for (const scenario of demoPMFreakProjectGovernanceScenarios) {
      const result = await runPMFreakProjectGovernanceScenario({ scenarioId: scenario.scenarioId, overrideEvidenceIds: [], overrideApprovalIds: [] }, scenarioRegistry, runnerDeps);
      const traceText = result.scenarioTrace
        .map((step) => step.detail)
        .join(' ')
        .toLowerCase();

      for (const unsafePhrase of ['customer acceptance invalid', 'invoice invalid', 'project non-compliant', 'contract breach detected', 'certified', 'compliant']) {
        assert.ok(!traceText.includes(unsafePhrase), `expected scenario "${scenario.scenarioId}" trace to never say "${unsafePhrase}"`);
      }
    }
  });
});
