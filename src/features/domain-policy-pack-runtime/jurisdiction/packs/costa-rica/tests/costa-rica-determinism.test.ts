import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Hardcoded, not filesystem-scanned -- mirrors
// jurisdiction/tests/jurisdiction-pack-runtime-determinism.test.ts.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'costa-rica-constants.ts',
  'costa-rica-jurisdiction-descriptor.ts',
  'costa-rica-review-triggers.ts',
  'costa-rica-evidence-requirements.ts',
  'costa-rica-approval-requirements.ts',
  'costa-rica-export-requirements.ts',
  'costa-rica-control-plane.ts',
  'costa-rica-base-pack.ts',
  'costa-rica-resolution.ts',
  'costa-rica-registry.ts',
  'costa-rica-fixtures.ts',
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

// Other real jurisdictions must never appear -- this pack is scoped to Costa
// Rica only, and must not silently grow into a multi-jurisdiction engine.
const OTHER_JURISDICTION_PATTERNS: readonly RegExp[] = [/panama/i, /\bdelaware\b/i, /\bcalifornia\b/i, new RegExp(['eu', ' law'].join(''), 'i'), new RegExp(['us', ' law'].join(''), 'i')];

function readModuleFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src/features/domain-policy-pack-runtime/jurisdiction/packs/costa-rica', relativePath), 'utf8');
}

describe('Costa Rica Base Pack determinism and jurisdiction scope', () => {
  it('23. never uses network calls, LLM calls, OCR/PDF parsing, or non-deterministic clocks/randomness', () => {
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

  it('never introduces another real jurisdiction\'s content', () => {
    const violations: string[] = [];
    for (const relativePath of MODULE_RELATIVE_FILES) {
      const text = readModuleFile(relativePath);
      for (const pattern of OTHER_JURISDICTION_PATTERNS) {
        if (pattern.test(text)) violations.push(`${relativePath}: matched ${pattern}`);
      }
    }

    assert.deepEqual(violations, []);
  });
});
