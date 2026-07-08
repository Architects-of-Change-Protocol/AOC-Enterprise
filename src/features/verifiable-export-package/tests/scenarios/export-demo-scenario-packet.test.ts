import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildEnterpriseDemoExportFixture } from '../../fixtures/enterprise-demo-export.fixture.js';

describe('export scenario: enterprise demo scenario packet', () => {
  it('1. the enterprise_demo section includes a demo_scenario item and a demo_run item', async () => {
    const { runtime, packageId } = await buildEnterpriseDemoExportFixture();
    const pkg = runtime.getPackage(packageId);
    const demoSection = pkg?.sections.find((section) => section.type === 'enterprise_demo');
    assert.ok(demoSection?.items.some((item) => item.type === 'demo_scenario'));
    assert.ok(demoSection?.items.some((item) => item.type === 'demo_run'));
  });

  it('2. the control_plane section includes a control_plane_snapshot item', async () => {
    const { runtime, packageId } = await buildEnterpriseDemoExportFixture();
    const pkg = runtime.getPackage(packageId);
    const controlPlaneSection = pkg?.sections.find((section) => section.type === 'control_plane');
    assert.ok(controlPlaneSection?.items.some((item) => item.type === 'control_plane_snapshot'));
  });

  it('3. the policy section includes a policy_decision item and a policy_proof item', async () => {
    const { runtime, packageId } = await buildEnterpriseDemoExportFixture();
    const pkg = runtime.getPackage(packageId);
    const policySection = pkg?.sections.find((section) => section.type === 'policy');
    assert.ok(policySection?.items.some((item) => item.type === 'policy_decision'));
    assert.ok(policySection?.items.some((item) => item.type === 'policy_proof'));
  });

  it('4. the enforcement section includes an enforcement_decision item', async () => {
    const { runtime, packageId } = await buildEnterpriseDemoExportFixture();
    const pkg = runtime.getPackage(packageId);
    const enforcementSection = pkg?.sections.find((section) => section.type === 'enforcement');
    assert.ok(enforcementSection?.items.some((item) => item.type === 'enforcement_decision'));
  });

  it('5. renders a non-empty buyer-audience markdown summary containing the scenario title', async () => {
    const { runtime, packageId, run } = await buildEnterpriseDemoExportFixture();
    const markdown = runtime.renderMarkdownSummary(packageId, 'buyer');
    assert.equal(typeof markdown, 'string');
    assert.ok(markdown.length > 0);
    assert.ok(markdown.includes(run.scenario.title));
  });

  // The summary section now carries a real summary_text item (see
  // buildSummaryTextItem in export-package-section-builder.ts), so the
  // required `summary` section is present and this package verifies as
  // `verified_with_warnings`: every hash recomputes correctly, and the only
  // remaining issues are warning-severity MISSING_REFERENCE entries for
  // upstream ids (e.g. authorityProofId/recognitionDecisionId) this packet's
  // enforcement section references but does not itself include -- never a
  // critical issue.
  it('6. verifies as verified_with_warnings, with every hash intact and zero critical issues', async () => {
    const { runtime, packageId } = await buildEnterpriseDemoExportFixture();
    const verification = runtime.getPackageVerification(packageId);
    assert.equal(verification?.status, 'verified_with_warnings');
    assert.equal(verification?.verifiedManifest, true);
    assert.equal(verification?.verifiedPackageHash, true);
    assert.equal(verification?.verifiedSectionHashes, true);
    assert.equal(verification?.verifiedItemHashes, true);
    assert.equal(verification?.verifiedReferenceHashes, true);
    const criticalIssues = verification?.issues.filter((issue) => issue.severity === 'critical') ?? [];
    assert.deepEqual(criticalIssues, []);
  });
});
