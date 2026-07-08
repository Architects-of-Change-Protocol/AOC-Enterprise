import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPolicyPackDecisionPacketFixture } from '../../fixtures/policy-pack-decision-packet.fixture.js';

describe('export scenario: policy-blocked payment decision packet', () => {
  it('1. builds a policy_decision_packet for the blocked approve_payment action', async () => {
    const { runtime, packageId } = await buildPolicyPackDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    assert.ok(pkg !== undefined);
    assert.equal(pkg?.type, 'policy_decision_packet');
  });

  it('2. includes the real policy decision in the policy section', async () => {
    const { runtime, packageId, policyDecision } = await buildPolicyPackDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    const policySection = pkg?.sections.find((section) => section.type === 'policy');
    assert.ok(policySection !== undefined);
    assert.ok(policySection?.items.some((item) => item.sourceId === policyDecision.id));
  });

  it('3. includes the real policy proof in the policy section', async () => {
    const { runtime, packageId, policyProof } = await buildPolicyPackDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    const policySection = pkg?.sections.find((section) => section.type === 'policy');
    assert.ok(policySection?.items.some((item) => item.sourceId === policyProof.id));
  });

  it('4. includes the enforcement decision that was blocked by the policy pack', async () => {
    const { runtime, packageId, outcome } = await buildPolicyPackDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    const enforcementSection = pkg?.sections.find((section) => section.type === 'enforcement');
    assert.ok(enforcementSection !== undefined);
    assert.ok(enforcementSection?.items.some((item) => item.sourceId === outcome.decision.id));
  });

  it('5. produces a manifest with a non-empty manifestHash', async () => {
    const { runtime, packageId } = await buildPolicyPackDecisionPacketFixture();
    const manifest = runtime.getPackageManifest(packageId);
    assert.ok(manifest !== undefined);
    assert.equal(typeof manifest?.manifestHash, 'string');
    assert.ok((manifest?.manifestHash.length ?? 0) > 0);
  });

  it('6. seals the package with a non-empty packageHash', async () => {
    const { runtime, packageId } = await buildPolicyPackDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    assert.equal(typeof pkg?.packageHash, 'string');
    assert.ok((pkg?.packageHash?.length ?? 0) > 0);
  });

  // The summary section carries a real summary_text item (see
  // buildSummaryTextItem in export-package-section-builder.ts), so the
  // required `summary` section is present and every hash recomputes
  // correctly. Any remaining issues are, at most, warning-severity
  // MISSING_REFERENCE entries for upstream ids (e.g.
  // authorityProofId/recognitionDecisionId) this packet's enforcement
  // section references but does not itself include -- never a critical
  // issue, so verification never reaches `'failed'`.
  it('7. verifies with every hash intact and zero critical issues', async () => {
    const { runtime, packageId } = await buildPolicyPackDecisionPacketFixture();
    const verification = runtime.getPackageVerification(packageId);
    assert.notEqual(verification?.status, 'failed');
    assert.equal(verification?.verifiedManifest, true);
    assert.equal(verification?.verifiedPackageHash, true);
    assert.equal(verification?.verifiedSectionHashes, true);
    assert.equal(verification?.verifiedItemHashes, true);
    assert.equal(verification?.verifiedReferenceHashes, true);
    const criticalIssues = verification?.issues.filter((issue) => issue.severity === 'critical') ?? [];
    assert.deepEqual(criticalIssues, []);
  });

  it('8. renders a markdown summary carrying the legal disclaimer without claiming compliance', async () => {
    const { runtime, packageId } = await buildPolicyPackDecisionPacketFixture();
    const markdown = runtime.renderMarkdownSummary(packageId);
    assert.ok(markdown.includes('not legal advice'));
    assert.ok(!markdown.includes('is compliant'));
  });
});
