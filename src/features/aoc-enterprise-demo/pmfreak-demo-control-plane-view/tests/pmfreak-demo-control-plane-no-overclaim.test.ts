import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { assertNoPMFreakDemoControlPlaneOverclaim, evaluatePMFreakDemoControlPlaneClaimSafety } from '../pmfreak-demo-control-plane-claim-safety.js';
import { PMFREAK_DEMO_CONTROL_PLANE_SAFE_LABELS } from '../pmfreak-demo-control-plane-view-constants.js';
import { buildPMFreakDemoControlPlaneFixtures } from '../pmfreak-demo-control-plane-fixtures.js';
import type { PMFreakDemoControlPlaneFixtures } from '../pmfreak-demo-control-plane-fixtures.js';

const UNSAFE_PHRASES = [
  'fully trusted agent',
  'certified enterprise compliant',
  'risk-free execution',
  'production authorized',
  'invoice-ready certified',
  'customer acceptance certified',
  'contractually compliant',
  'legally approved',
  'compliance passed',
  'guaranteed billing',
  'certified audit export',
  'legal evidence package',
  'Costa Rica compliant',
];

const SAFE_PHRASES = [
  'Soberanía-governed agent',
  'Demo scenario',
  'Not production integration',
  'Not compliance certification',
  'Evidence required',
  'Approval required',
  'No invoice validity claimed',
  'No customer acceptance certification',
  'Audit-ready demo export',
  'Costa Rica jurisdiction context referenced',
];

let fixtures: PMFreakDemoControlPlaneFixtures;

before(async () => {
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
});

describe('PMFreak Demo Control Plane View -- claim safety', () => {
  it('29. every view fixture passes assertNoPMFreakDemoControlPlaneOverclaim', () => {
    // A thrown error here fails the test on its own -- no doesNotThrow wrapper needed.
    for (const fixture of [
      fixtures.demoBillingReadinessMissingEvidenceView,
      fixtures.demoBillingReadinessMissingApprovalView,
      fixtures.demoBillingReadinessAllowedView,
      fixtures.demoScheduleApplyDeniedView,
      fixtures.demoClientCommunicationApprovalRequiredView,
      fixtures.demoChangeControlDeniedView,
      fixtures.demoPMFreakControlPlaneDashboard,
      fixtures.demoBillingReadinessComparison,
    ]) {
      assertNoPMFreakDemoControlPlaneOverclaim(fixture);
    }
  });

  it('30. catches unsafe Control Plane claims', () => {
    for (const phrase of UNSAFE_PHRASES) {
      const result = evaluatePMFreakDemoControlPlaneClaimSafety(`This demo output says: ${phrase}.`);
      assert.equal(result.safe, false, `expected "${phrase}" to be flagged as unsafe`);
    }
  });

  it('31. does not false-positive on safe Control Plane labels', () => {
    for (const phrase of SAFE_PHRASES) {
      const result = evaluatePMFreakDemoControlPlaneClaimSafety(`This demo output says: ${phrase}.`);
      assert.equal(result.safe, true, `expected "${phrase}" to be safe`);
    }

    const result = evaluatePMFreakDemoControlPlaneClaimSafety(PMFREAK_DEMO_CONTROL_PLANE_SAFE_LABELS);
    assert.equal(result.safe, true);
  });

  it('32. README is claim-safe outside of clearly-labeled unsafe examples', () => {
    const readme = readFileSync(resolve(process.cwd(), 'src/features/aoc-enterprise-demo/pmfreak-demo-control-plane-view/README.md'), 'utf8');
    const result = evaluatePMFreakDemoControlPlaneClaimSafety(readme);
    assert.equal(result.safe, true, `README contains unsafe phrases: ${result.prohibitedPhrasesFound.join(', ')}`);
  });

  it('34. fixtures carry no real Datasys/PMFreak customer or project identifiers', () => {
    // The README safely *disclaims* Datasys data ("No real Datasys project codes... appear
    // anywhere in this module"), matching the sibling packs' READMEs -- so the word itself is
    // expected in that negated sentence. Fixture/dashboard *data*, by contrast, must never carry
    // a real Datasys/PMFreak identifier at all.
    const dashboardText = JSON.stringify(fixtures.demoPMFreakControlPlaneDashboard);
    assert.ok(!/datasys/i.test(dashboardText));

    const comparisonText = JSON.stringify(fixtures.demoBillingReadinessComparison);
    assert.ok(!/datasys/i.test(comparisonText));
  });
});
