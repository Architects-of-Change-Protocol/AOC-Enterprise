import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildEvidenceBackedDecisionPacketFixture } from '../../fixtures/evidence-backed-decision-packet.fixture.js';

describe('export scenario: approved action decision packet', () => {
  it('1. includes the real approval decision in the approval section', async () => {
    const { runtime, packageId, approvalDecision } = await buildEvidenceBackedDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    const approvalSection = pkg?.sections.find((section) => section.type === 'approval');
    assert.ok(approvalSection !== undefined);
    assert.ok(approvalSection?.items.some((item) => item.sourceId === approvalDecision.id));
  });

  it('2. includes the real approval proof in the approval section', async () => {
    const { runtime, packageId, approvalProof } = await buildEvidenceBackedDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    const approvalSection = pkg?.sections.find((section) => section.type === 'approval');
    assert.ok(approvalSection?.items.some((item) => item.sourceId === approvalProof.id));
  });

  it('3. the approval decision payload shows approved: true', async () => {
    const { runtime, packageId, approvalDecision } = await buildEvidenceBackedDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    const approvalSection = pkg?.sections.find((section) => section.type === 'approval');
    const decisionItem = approvalSection?.items.find((item) => item.sourceId === approvalDecision.id);
    assert.equal(decisionItem?.payload['approved'], true);
  });

  it('4. the approval decision payload carries an approver actor id', async () => {
    const { runtime, packageId, approvalDecision } = await buildEvidenceBackedDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    const approvalSection = pkg?.sections.find((section) => section.type === 'approval');
    const decisionItem = approvalSection?.items.find((item) => item.sourceId === approvalDecision.id);
    const approverActorId = decisionItem?.payload['approverActorId'];
    assert.equal(typeof approverActorId, 'string');
    assert.ok((approverActorId as string).length > 0);
  });

  it('5. the evidence section includes at least one reviewed/attached evidence item', async () => {
    const { runtime, packageId } = await buildEvidenceBackedDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    const evidenceSection = pkg?.sections.find((section) => section.type === 'evidence');
    assert.ok(evidenceSection !== undefined);
    assert.ok((evidenceSection?.itemCount ?? 0) > 0);
  });

  it('6. includes an enforcement section item for the underlying enforcement decision', async () => {
    const { runtime, packageId } = await buildEvidenceBackedDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    const enforcementSection = pkg?.sections.find((section) => section.type === 'enforcement');
    assert.ok(enforcementSection !== undefined);
    assert.ok((enforcementSection?.itemCount ?? 0) > 0);
  });

  it('7. verifies without a failed status', async () => {
    const { runtime, packageId } = await buildEvidenceBackedDecisionPacketFixture();
    const verification = runtime.getPackageVerification(packageId);
    assert.notEqual(verification?.status, 'failed');
  });
});
