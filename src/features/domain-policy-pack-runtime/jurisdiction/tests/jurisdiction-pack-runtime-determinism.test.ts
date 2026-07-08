import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Hardcoded, not filesystem-scanned -- mirrors
// policy-pack-foundation/tests/policy-pack-foundation-determinism.test.ts.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'jurisdiction-pack-types.ts',
  'jurisdiction-pack-constants.ts',
  'jurisdiction-pack-factory.ts',
  'jurisdiction-pack-validator.ts',
  'jurisdiction-pack-claim-safety.ts',
  'jurisdiction-pack-registry.ts',
  'jurisdiction-pack-resolver.ts',
  'jurisdiction-pack-composer.ts',
  'jurisdiction-pack-approval.ts',
  'jurisdiction-pack-evidence.ts',
  'jurisdiction-pack-export.ts',
  'jurisdiction-pack-control-plane.ts',
  'jurisdiction-pack-fixtures.ts',
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

// Real-jurisdiction names/law that must never appear in this generic
// infrastructure module (18/17). Matched case-insensitively; deliberately
// split so this file naming the patterns doesn't self-flag.
const REAL_JURISDICTION_PATTERNS: readonly RegExp[] = [
  /costa\s*rica/i,
  /panama/i,
  /\bdelaware\b/i,
  /\bcalifornia\b/i,
  new RegExp(['eu', ' law'].join(''), 'i'),
  new RegExp(['us', ' law'].join(''), 'i'),
  /civil code/i,
  /commercial code/i,
  /labor code/i,
  /criminal code/i,
  /tax code/i,
];

function readModuleFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src/features/domain-policy-pack-runtime/jurisdiction', relativePath), 'utf8');
}

describe('jurisdiction pack runtime determinism and no-real-jurisdiction-content', () => {
  it('18. never uses network calls, LLM calls, OCR/PDF parsing, or non-deterministic clocks/randomness', () => {
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

  it('17. introduces no real jurisdiction-specific law', () => {
    const violations: string[] = [];
    for (const relativePath of MODULE_RELATIVE_FILES) {
      const text = readModuleFile(relativePath);
      for (const pattern of REAL_JURISDICTION_PATTERNS) {
        if (pattern.test(text)) violations.push(`${relativePath}: matched ${pattern}`);
      }
    }

    assert.deepEqual(violations, []);
  });
});
