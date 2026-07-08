import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Hardcoded, not filesystem-scanned: this repo prefers deterministic static
// lists over directory walks (see foundation-runtime-capabilities.ts), and
// the pinned 'fs'/'path' shims here don't declare readdirSync/statSync/join.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'foundation/foundation-runtime-types.ts',
  'foundation/foundation-runtime-capabilities.ts',
  'foundation/foundation-runtime-references.ts',
  'foundation/foundation-runtime-validation.ts',
  'foundation/foundation-runtime-report.ts',
  'foundation/index.ts',
  'manifest/policy-pack-manifest-types.ts',
  'manifest/policy-pack-manifest-constants.ts',
  'manifest/policy-pack-manifest-factory.ts',
  'manifest/policy-pack-manifest-validator.ts',
  'manifest/index.ts',
  'composition/policy-pack-composition-types.ts',
  'composition/policy-pack-dependency-resolver.ts',
  'composition/policy-pack-composer.ts',
  'composition/index.ts',
  'validation/policy-pack-validation-status.ts',
  'validation/policy-pack-claim-safety.ts',
  'validation/policy-pack-no-overclaim.ts',
  'validation/index.ts',
  'adapters/policy-pack-approval-adapter.ts',
  'adapters/policy-pack-evidence-adapter.ts',
  'adapters/policy-pack-export-adapter.ts',
  'adapters/policy-pack-control-plane-adapter.ts',
  'adapters/index.ts',
  'fixtures/policy-pack-foundation-fixtures.ts',
  'fixtures/index.ts',
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
];

function readModuleFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src/features/policy-pack-foundation', relativePath), 'utf8');
}

describe('policy-pack-foundation determinism', () => {
  it('35. never uses network calls, LLM calls, OCR/PDF parsing, or non-deterministic clocks/randomness', () => {
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
});
