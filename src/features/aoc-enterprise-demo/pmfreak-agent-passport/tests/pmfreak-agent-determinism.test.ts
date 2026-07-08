import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { buildAllPMFreakAgentPassportFixtures, buildAllPMFreakNegativePassportFixtures } from '../pmfreak-agent-passport-fixtures.js';

// Hardcoded, not filesystem-scanned -- mirrors
// costa-rica/tests/costa-rica-determinism.test.ts.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'pmfreak-agent-passport-constants.ts',
  'pmfreak-agent-passport-types.ts',
  'pmfreak-agent-roles.ts',
  'pmfreak-capability-catalog.ts',
  'pmfreak-action-catalog.ts',
  'pmfreak-authority-scope.ts',
  'pmfreak-evidence-requirements.ts',
  'pmfreak-approval-requirements.ts',
  'pmfreak-agent-passport-manifest.ts',
  'pmfreak-passport-registry.ts',
  'pmfreak-passport-resolver.ts',
  'pmfreak-control-plane-summary.ts',
  'pmfreak-export-metadata.ts',
  'pmfreak-claim-safety.ts',
  'pmfreak-agent-passport-fixtures.ts',
  'index.ts',
];

// Deliberately not written as contiguous literal substrings of the forbidden
// token -- otherwise this very file would flag itself.
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

// This pack must never grow real PMFreak/Datasys production integration surface.
const PRODUCTION_INTEGRATION_PATTERNS: readonly RegExp[] = [/pmfreak[_.]api[_.]key/i, /pmfreak[_.]bearer[_.]token/i, new RegExp(['oauth', 'client'].join('_'), 'i'), /webhook[_.]secret/i];

function readModuleFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src/features/aoc-enterprise-demo/pmfreak-agent-passport', relativePath), 'utf8');
}

describe('PMFreak Agent Passport Demo Pack determinism', () => {
  it('37. never uses network calls, LLM calls, OCR/PDF parsing, or non-deterministic clocks/randomness', () => {
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

  it('every demo passport fixture builder is a pure, deterministic function', () => {
    assert.deepEqual(buildAllPMFreakAgentPassportFixtures(), buildAllPMFreakAgentPassportFixtures());
    assert.deepEqual(buildAllPMFreakNegativePassportFixtures(), buildAllPMFreakNegativePassportFixtures());
  });
});
