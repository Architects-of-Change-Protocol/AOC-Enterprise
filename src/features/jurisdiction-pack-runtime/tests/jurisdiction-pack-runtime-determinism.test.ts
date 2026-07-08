import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Hardcoded, not filesystem-scanned: consistent with policy-pack-foundation's
// determinism test, and this repo's pinned 'fs'/'path' shims don't declare
// readdirSync/statSync/join.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'domain/jurisdiction-pack-runtime-types.ts',
  'domain/index.ts',
  'services/jurisdiction-pack-registry.ts',
  'services/jurisdiction-pack-resolver.ts',
  'services/index.ts',
  'runtime/jurisdiction-pack-runtime.ts',
  'runtime/jurisdiction-pack-runtime-errors.ts',
  'runtime/index.ts',
  'fixtures/jurisdiction-pack-runtime-fixtures.ts',
  'fixtures/index.ts',
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
  return readFileSync(resolve(process.cwd(), 'src/features/jurisdiction-pack-runtime', relativePath), 'utf8');
}

describe('jurisdiction-pack-runtime determinism', () => {
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
});
