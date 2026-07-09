import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { createAocPMFreakRemoteGovernanceEndpointDescriptor } from '../aoc-pmfreak-remote-governance-endpoint-descriptor.js';
import { createAocPMFreakRemoteGovernanceEndpointConfig } from '../aoc-pmfreak-remote-governance-endpoint-config.js';
import { handleAocPMFreakRemoteGovernanceRequest } from '../aoc-pmfreak-remote-governance-endpoint-handler.js';
import { demoAocPMFreakRemoteBillingMissingEvidenceEndpointRequest } from '../aoc-pmfreak-remote-governance-fixtures.js';

// Hardcoded, not filesystem-scanned -- mirrors
// pmfreak-governance-request-intake/tests/aoc-pmfreak-governance-intake-determinism.test.ts.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'aoc-pmfreak-remote-governance-endpoint-constants.ts',
  'aoc-pmfreak-remote-governance-endpoint-types.ts',
  'aoc-pmfreak-remote-governance-endpoint-descriptor.ts',
  'aoc-pmfreak-remote-governance-endpoint-config.ts',
  'aoc-pmfreak-remote-governance-endpoint-handler.ts',
  'aoc-pmfreak-remote-governance-http-adapter.ts',
  'aoc-pmfreak-remote-governance-method-guard.ts',
  'aoc-pmfreak-remote-governance-content-type-guard.ts',
  'aoc-pmfreak-remote-governance-payload-guard.ts',
  'aoc-pmfreak-remote-governance-auth-guard.ts',
  'aoc-pmfreak-remote-governance-parser.ts',
  'aoc-pmfreak-remote-governance-serializer.ts',
  'aoc-pmfreak-remote-governance-status-mapping.ts',
  'aoc-pmfreak-remote-governance-errors.ts',
  'aoc-pmfreak-remote-governance-health.ts',
  'aoc-pmfreak-remote-governance-fixtures.ts',
  'aoc-pmfreak-remote-governance-claim-safety.ts',
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
  /\bcrypto\.randomUUID\s*\(/,
];

function readModuleFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src/features/aoc-integrations/pmfreak-remote-governance-endpoint', relativePath), 'utf8');
}

describe('AOC PMFreak Remote Governance Endpoint -- determinism', () => {
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
    assert.deepEqual(createAocPMFreakRemoteGovernanceEndpointDescriptor(), createAocPMFreakRemoteGovernanceEndpointDescriptor());
  });

  it('the default config is identical across repeated calls', () => {
    assert.deepEqual(createAocPMFreakRemoteGovernanceEndpointConfig(), createAocPMFreakRemoteGovernanceEndpointConfig());
  });

  it('handling the same request twice returns the same response', async () => {
    const first = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteBillingMissingEvidenceEndpointRequest });
    const second = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteBillingMissingEvidenceEndpointRequest });
    assert.deepEqual(first, second);
  });
});
