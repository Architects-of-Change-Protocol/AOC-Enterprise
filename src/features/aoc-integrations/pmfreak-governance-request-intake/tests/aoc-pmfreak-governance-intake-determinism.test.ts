import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { createAocPMFreakGovernanceRequestIntakeDescriptor } from '../aoc-pmfreak-governance-intake-descriptor.js';
import { createAocPMFreakGovernanceRequestIntakeConfig } from '../aoc-pmfreak-governance-intake-config.js';
import { evaluateAocPMFreakGovernanceRequest } from '../aoc-pmfreak-governance-evaluator.js';
import { createAocPMFreakGovernanceRequestIntakeClient } from '../aoc-pmfreak-governance-intake-client.js';
import { demoAocPMFreakBillingMissingEvidenceRequest } from '../aoc-pmfreak-governance-intake-fixtures.js';

// Hardcoded, not filesystem-scanned -- mirrors
// pmfreak-agent-passport/tests/pmfreak-agent-determinism.test.ts.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'aoc-pmfreak-governance-intake-constants.ts',
  'aoc-pmfreak-governance-intake-types.ts',
  'aoc-pmfreak-governance-intake-descriptor.ts',
  'aoc-pmfreak-governance-intake-config.ts',
  'aoc-pmfreak-governance-request-compat.ts',
  'aoc-pmfreak-governance-response-compat.ts',
  'aoc-pmfreak-governance-intake-validator.ts',
  'aoc-pmfreak-governance-request-redaction.ts',
  'aoc-pmfreak-request-to-passport-adapter.ts',
  'aoc-pmfreak-governance-evaluator.ts',
  'aoc-pmfreak-governance-response-builder.ts',
  'aoc-pmfreak-governance-decision-mapping.ts',
  'aoc-pmfreak-governance-intake-client.ts',
  'aoc-pmfreak-governance-intake-errors.ts',
  'aoc-pmfreak-governance-intake-health.ts',
  'aoc-pmfreak-governance-intake-fixtures.ts',
  'aoc-pmfreak-governance-intake-claim-safety.ts',
  'index.ts',
];

// Deliberately not written as contiguous literal substrings of the
// forbidden token -- otherwise this very file would flag itself.
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
  return readFileSync(resolve(process.cwd(), 'src/features/aoc-integrations/pmfreak-governance-request-intake', relativePath), 'utf8');
}

describe('Soberanía PMFreak Governance Request Intake -- determinism', () => {
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

  it('the descriptor is identical across repeated calls', () => {
    assert.deepEqual(createAocPMFreakGovernanceRequestIntakeDescriptor(), createAocPMFreakGovernanceRequestIntakeDescriptor());
  });

  it('the default config is identical across repeated calls', () => {
    assert.deepEqual(createAocPMFreakGovernanceRequestIntakeConfig(), createAocPMFreakGovernanceRequestIntakeConfig());
  });

  it('evaluating the same request twice returns the same response', () => {
    const first = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingMissingEvidenceRequest });
    const second = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingMissingEvidenceRequest });
    assert.deepEqual(first, second);
  });

  it('a freshly created client evaluates identically to another freshly created client', async () => {
    const responseA = await createAocPMFreakGovernanceRequestIntakeClient().evaluateRequest(demoAocPMFreakBillingMissingEvidenceRequest);
    const responseB = await createAocPMFreakGovernanceRequestIntakeClient().evaluateRequest(demoAocPMFreakBillingMissingEvidenceRequest);
    assert.deepEqual(responseA, responseB);
  });
});
