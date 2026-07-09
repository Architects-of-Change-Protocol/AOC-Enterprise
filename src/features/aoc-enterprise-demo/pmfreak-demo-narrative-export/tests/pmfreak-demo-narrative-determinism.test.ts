import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { buildPMFreakDemoNarrativeExportFixtures } from '../pmfreak-demo-narrative-fixtures.js';
import type { PMFreakDemoNarrativeExportFixtures } from '../pmfreak-demo-narrative-fixtures.js';
import { createPMFreakDemoNarrativeExport } from '../pmfreak-demo-narrative-builder.js';

// Hardcoded, not filesystem-scanned: this repo prefers deterministic static
// lists over directory walks, and the pinned 'fs' type shim used here does
// not declare readdirSync/statSync.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'pmfreak-demo-narrative-export-constants.ts',
  'pmfreak-demo-narrative-export-types.ts',
  'pmfreak-demo-narrative-export-descriptor.ts',
  'pmfreak-demo-executive-summary.ts',
  'pmfreak-demo-agent-action-narrative.ts',
  'pmfreak-demo-governance-checks-narrative.ts',
  'pmfreak-demo-evidence-narrative.ts',
  'pmfreak-demo-approval-narrative.ts',
  'pmfreak-demo-trace-narrative.ts',
  'pmfreak-demo-policy-reference-narrative.ts',
  'pmfreak-demo-safe-interpretation.ts',
  'pmfreak-demo-next-steps.ts',
  'pmfreak-demo-export-bundle-metadata.ts',
  'pmfreak-demo-narrative-builder.ts',
  'pmfreak-demo-markdown-renderer.ts',
  'pmfreak-demo-plain-text-renderer.ts',
  'pmfreak-demo-comparison-narrative.ts',
  'pmfreak-demo-dashboard-narrative.ts',
  'pmfreak-demo-narrative-fixtures.ts',
  'pmfreak-demo-narrative-claim-safety.ts',
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
  /\bcrypto\.randomUUID\s*\(/,
  /\bpdf\b/i,
  /\bdocx\b/i,
  /function\s+sendEmail/,
  /function\s+createDraft/,
  /function\s+postToSlack/,
  /function\s+sendClientCommunication/,
  /function\s+createInvoice/,
  /function\s+updateProject/,
  /function\s+markMilestoneCompleteInProduction/,
  /function\s+syncPMFreak/,
  /function\s+callPMFreakApi/,
];

function readModuleFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src/features/aoc-enterprise-demo/pmfreak-demo-narrative-export', relativePath), 'utf8');
}

let fixtures: PMFreakDemoNarrativeExportFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoNarrativeExportFixtures();
});

describe('PMFreak Demo Narrative Export -- determinism and offline execution', () => {
  it('39 & 40 & 42. never uses network/LLM/OCR/PDF/DOCX/web-lookup/nondeterministic-clock calls, and defines no real-mutation or real-export function', () => {
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

  it('34. fixtures are deterministic -- stable ids, and repeated builder calls on the same input produce identical output', async () => {
    for (const fixture of [
      fixtures.demoBillingReadinessMissingEvidenceNarrativeExport,
      fixtures.demoBillingReadinessMissingApprovalNarrativeExport,
      fixtures.demoBillingReadinessAllowedNarrativeExport,
      fixtures.demoScheduleApplyDeniedNarrativeExport,
    ]) {
      assert.ok(fixture.exportId.startsWith('aoc.export.demo.pmfreak.narrative.'));
    }

    assert.ok(fixtures.demoBillingReadinessNarrativeComparisonExport.comparisonExportId.length > 0);
    assert.ok(fixtures.demoPMFreakDashboardNarrativeExport.dashboardExportId.length > 0);

    // buildPMFreakDemoNarrativeExportFixtures() is memoized process-wide -- calling it again
    // returns the exact same already-built fixtures object.
    const second = await buildPMFreakDemoNarrativeExportFixtures();
    assert.equal(second, fixtures);

    const controlPlaneFixtures = await buildPMFreakDemoControlPlaneFixtures();
    const first = createPMFreakDemoNarrativeExport(controlPlaneFixtures.demoBillingReadinessAllowedView);
    const repeat = createPMFreakDemoNarrativeExport(controlPlaneFixtures.demoBillingReadinessAllowedView);
    assert.deepEqual(first, repeat);
  });
});
