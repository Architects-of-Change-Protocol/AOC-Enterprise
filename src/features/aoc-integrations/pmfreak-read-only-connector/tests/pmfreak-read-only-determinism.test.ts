import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Hardcoded, not filesystem-scanned -- mirrors the Project Governance Scenario Pack's own determinism test.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'pmfreak-read-only-connector-constants.ts',
  'pmfreak-read-only-connector-types.ts',
  'pmfreak-read-only-connector-descriptor.ts',
  'pmfreak-read-only-connector-config.ts',
  'pmfreak-read-only-source.ts',
  'pmfreak-read-only-client.ts',
  'pmfreak-read-models.ts',
  'pmfreak-connector-snapshot.ts',
  'pmfreak-connector-health.ts',
  'pmfreak-connector-errors.ts',
  'pmfreak-redaction.ts',
  'pmfreak-no-mutation-guard.ts',
  'pmfreak-in-memory-source.ts',
  'pmfreak-real-source-adapter.ts',
  'pmfreak-read-only-connector-fixtures.ts',
  'pmfreak-read-only-claim-safety.ts',
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

// This connector must never call into the demo governance/view/export layers -- it only reads and normalizes.
const GOVERNANCE_LAYER_CALL_PATTERNS: readonly RegExp[] = [
  /\bresolvePMFreakAgentPassportAction\s*\(/,
  /\brunPMFreakProjectGovernanceScenario\s*\(/,
  /\bcreatePMFreakDemoControlPlaneViewModel\s*\(/,
  /\bcreatePMFreakDemoNarrativeExport\s*\(/,
];

// This connector must never define or call a real PMFreak write/communication/execution function.
const MUTATION_FUNCTION_NAME_PATTERNS: readonly RegExp[] = [
  /\bwriteback\w*\s*\(/i,
  /\bupdateProject\s*\(/,
  /\binsertProject\s*\(/,
  /\bdeleteProject\s*\(/,
  /\bupsertProject\s*\(/,
  /\bmutateProject\s*\(/,
  /\bsendEmail\s*\(/,
  /\bpostToSlack\s*\(/,
  /\bsendClientCommunication\s*\(/,
  /\bcreateInvoice\s*\(/,
  /\bapproveAction\s*\(/,
  /\bexecuteAction\s*\(/,
  /\bmarkMilestoneCompleteInProduction\s*\(/,
  /\bsyncPMFreak\s*\(/,
  /\bcallPMFreakApi\s*\(/,
];

// This connector must never introduce real PMFreak production integration credentials or secrets.
const PRODUCTION_INTEGRATION_PATTERNS: readonly RegExp[] = [/pmfreak[_.]api[_.]key/i, /pmfreak[_.]bearer[_.]token/i, new RegExp(['oauth', 'client'].join('_'), 'i'), /webhook[_.]secret/i];

function readModuleFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src/features/aoc-integrations/pmfreak-read-only-connector', relativePath), 'utf8');
}

describe('AOC PMFreak Read-Only Connector determinism and scope boundary', () => {
  it('never uses network calls, LLM calls, OCR/PDF parsing, or non-deterministic clocks/randomness', () => {
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

  it('never calls the PMFreak Agent Passport resolver, Project Governance Scenario runner, Control Plane view builder, or Narrative Export builder', () => {
    const violations: string[] = [];
    for (const relativePath of MODULE_RELATIVE_FILES) {
      const text = readModuleFile(relativePath);
      for (const pattern of GOVERNANCE_LAYER_CALL_PATTERNS) {
        if (pattern.test(text)) violations.push(`${relativePath}: matched ${pattern}`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it('never defines or calls a real project/schedule/billing/communication mutation function', () => {
    const violations: string[] = [];
    for (const relativePath of MODULE_RELATIVE_FILES) {
      const text = readModuleFile(relativePath);
      for (const pattern of MUTATION_FUNCTION_NAME_PATTERNS) {
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
});
