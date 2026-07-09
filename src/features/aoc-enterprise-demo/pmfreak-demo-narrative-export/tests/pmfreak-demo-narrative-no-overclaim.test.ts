import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { assertNoPMFreakDemoNarrativeOverclaim, evaluatePMFreakDemoNarrativeClaimSafety } from '../pmfreak-demo-narrative-claim-safety.js';
import { PMFREAK_DEMO_NARRATIVE_SAFE_LABELS } from '../pmfreak-demo-narrative-export-constants.js';
import { buildPMFreakDemoNarrativeExportFixtures } from '../pmfreak-demo-narrative-fixtures.js';
import type { PMFreakDemoNarrativeExportFixtures } from '../pmfreak-demo-narrative-fixtures.js';

const UNSAFE_PHRASES = [
  'fully trusted agent',
  'certified enterprise compliant',
  'risk-free execution',
  'production authorized',
  'invoice-ready certified',
  'invoice ready certified',
  'customer acceptance certified',
  'contractually compliant',
  'legally approved',
  'compliance passed',
  'guaranteed billing',
  'certified audit export',
  'legal evidence package',
  'Costa Rica compliant',
  'CR compliant',
  'invoice validity certified',
  'billing entitlement guaranteed',
  'customer acceptance legally sufficient',
  'project compliant',
];

const SAFE_PHRASES = [
  'AOC-governed agent',
  'Demo narrative export',
  'Not production integration',
  'Not compliance certification',
  'Evidence required',
  'Approval required',
  'No invoice validity claimed',
  'No customer acceptance certification',
  'Audit-ready demo export',
  'Costa Rica jurisdiction context referenced',
  'This export does not provide legal advice',
  'This export does not certify compliance',
];

let fixtures: PMFreakDemoNarrativeExportFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoNarrativeExportFixtures();
});

describe('PMFreak Demo Narrative Export -- claim safety', () => {
  it('35. every narrative fixture passes assertNoPMFreakDemoNarrativeOverclaim', () => {
    // A thrown error here fails the test on its own -- no doesNotThrow wrapper needed.
    for (const fixture of [
      fixtures.demoBillingReadinessMissingEvidenceNarrativeExport,
      fixtures.demoBillingReadinessMissingApprovalNarrativeExport,
      fixtures.demoBillingReadinessAllowedNarrativeExport,
      fixtures.demoScheduleApplyDeniedNarrativeExport,
      fixtures.demoBillingReadinessNarrativeComparisonExport,
      fixtures.demoPMFreakDashboardNarrativeExport,
    ]) {
      assertNoPMFreakDemoNarrativeOverclaim(fixture);
    }
  });

  it('36. catches unsafe narrative claims', () => {
    for (const phrase of UNSAFE_PHRASES) {
      const result = evaluatePMFreakDemoNarrativeClaimSafety(`This demo output says: ${phrase}.`);
      assert.equal(result.safe, false, `expected "${phrase}" to be flagged as unsafe`);
    }
  });

  it('37. does not false-positive on safe narrative phrases', () => {
    for (const phrase of SAFE_PHRASES) {
      const result = evaluatePMFreakDemoNarrativeClaimSafety(`This demo output says: ${phrase}.`);
      assert.equal(result.safe, true, `expected "${phrase}" to be safe`);
    }

    const result = evaluatePMFreakDemoNarrativeClaimSafety(PMFREAK_DEMO_NARRATIVE_SAFE_LABELS);
    assert.equal(result.safe, true);
  });

  it('38. README is claim-safe outside of clearly-labeled unsafe examples', () => {
    const readme = readFileSync(resolve(process.cwd(), 'src/features/aoc-enterprise-demo/pmfreak-demo-narrative-export/README.md'), 'utf8');
    const result = evaluatePMFreakDemoNarrativeClaimSafety(readme);
    assert.equal(result.safe, true, `README contains unsafe phrases: ${result.prohibitedPhrasesFound.join(', ')}`);
  });

  it('41. fixtures carry no real Datasys/PMFreak customer or project identifiers', () => {
    // The README safely *disclaims* Datasys data, matching the sibling packs' READMEs -- so the
    // word itself is expected in that negated sentence. Fixture/export *data*, by contrast, must
    // never carry a real Datasys/PMFreak identifier at all.
    const dashboardText = JSON.stringify(fixtures.demoPMFreakDashboardNarrativeExport);
    assert.ok(!/datasys/i.test(dashboardText));

    const comparisonText = JSON.stringify(fixtures.demoBillingReadinessNarrativeComparisonExport);
    assert.ok(!/datasys/i.test(comparisonText));
  });
});
