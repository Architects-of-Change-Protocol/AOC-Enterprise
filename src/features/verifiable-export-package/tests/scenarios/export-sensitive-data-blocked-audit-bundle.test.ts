import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPolicyPackDecisionPacketFixture } from '../../fixtures/policy-pack-decision-packet.fixture.js';

describe('export scenario: sensitive/blocked action rolled into an audit bundle', () => {
  it('1. creates an audit bundle referencing the blocked payment decision packet', async () => {
    const { runtime, packageId, outcome } = await buildPolicyPackDecisionPacketFixture();

    const { auditBundle } = runtime.createAuditBundle({
      title: 'Audit bundle: sensitive/blocked payment approval',
      description: 'Audit bundle scoped to a policy-pack-blocked approve_payment decision.',
      trustDomainId: outcome.request.trustDomainId,
      scope: { trustDomainId: outcome.request.trustDomainId, actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
      packageIds: [packageId],
      sections: [{ type: 'summary', required: true, items: [] }],
    });

    assert.equal(auditBundle.summary.packageCount, 1);
  });

  it('2. produces a non-empty bundleHash', async () => {
    const { runtime, packageId, outcome } = await buildPolicyPackDecisionPacketFixture();

    const { auditBundle } = runtime.createAuditBundle({
      title: 'Audit bundle: sensitive/blocked payment approval',
      description: 'Audit bundle scoped to a policy-pack-blocked approve_payment decision.',
      trustDomainId: outcome.request.trustDomainId,
      scope: { trustDomainId: outcome.request.trustDomainId, actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
      packageIds: [packageId],
      sections: [{ type: 'summary', required: true, items: [] }],
    });

    assert.equal(typeof auditBundle.bundleHash, 'string');
    assert.ok(auditBundle.bundleHash.length > 0);
  });

  it('3. the new audit_bundle package is a distinct package from the original decision packet', async () => {
    const { runtime, packageId, outcome } = await buildPolicyPackDecisionPacketFixture();

    const { pkg } = runtime.createAuditBundle({
      title: 'Audit bundle: sensitive/blocked payment approval',
      description: 'Audit bundle scoped to a policy-pack-blocked approve_payment decision.',
      trustDomainId: outcome.request.trustDomainId,
      scope: { trustDomainId: outcome.request.trustDomainId, actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
      packageIds: [packageId],
      sections: [{ type: 'summary', required: true, items: [] }],
    });

    assert.notEqual(pkg.id, packageId);
    assert.equal(runtime.getPackage(pkg.id)?.type, 'audit_bundle');
  });

  it('4. seals and verifies the new audit_bundle package without a failed status', async () => {
    const { runtime, packageId, outcome } = await buildPolicyPackDecisionPacketFixture();

    const { pkg } = runtime.createAuditBundle({
      title: 'Audit bundle: sensitive/blocked payment approval',
      description: 'Audit bundle scoped to a policy-pack-blocked approve_payment decision.',
      trustDomainId: outcome.request.trustDomainId,
      scope: { trustDomainId: outcome.request.trustDomainId, actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
      packageIds: [packageId],
      sections: [{ type: 'summary', required: true, items: [] }],
    });

    runtime.sealPackage(pkg.id);
    const verification = runtime.verifyPackage(pkg.id);
    assert.notEqual(verification.status, 'failed');
  });
});
