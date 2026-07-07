import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementDecision } from '../../../action-enforcement/domain/enforcement-decision.js';
import { createExportRuntimeContext } from '../../domain/export-runtime-context.js';
import { createExportPackageRuntime } from '../../services/export-package-runtime.js';
import { mapEnforcementDecisionToItem } from '../../integrations/action-enforcement-export-adapter.js';

const NOW = '2026-02-03T00:00:00.000Z';
const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';

// References a policy proof id that is never included as a policy_proof
// item in this package, so the reference resolver cannot find it.
const DECISION_WITH_DANGLING_POLICY_PROOF: EnforcementDecision = {
  id: 'enforcement-decision-dangling-policy-proof-001',
  enforcementRequestId: 'enforcement-request-dangling-policy-proof-001',
  type: 'execute_allowed',
  allowedToExecute: true,
  reasonCode: 'RECOGNIZED_AND_AUTHORIZED',
  reason: 'The actor is recognized and authorized to perform this action.',
  decidedAt: NOW,
  policyResults: [],
  policyProofId: 'policy-proof-does-not-exist',
};

function buildPackageWithDanglingReference() {
  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);

  const enforcementDecisionItem = mapEnforcementDecisionToItem(ctx, DECISION_WITH_DANGLING_POLICY_PROOF);

  const { pkg } = runtime.createEnforcementDecisionPacket({
    title: 'Enforcement decision packet: dangling policy proof reference',
    description: 'Package referencing a policy proof id that is not included in the package.',
    trustDomainId: TRUST_DOMAIN_ID,
    targetType: 'enforcement_decision',
    targetId: DECISION_WITH_DANGLING_POLICY_PROOF.id,
    sections: [
      { type: 'summary', required: true, items: [] },
      { type: 'enforcement', required: true, items: [enforcementDecisionItem] },
    ],
  });

  runtime.sealPackage(pkg.id);
  const verification = runtime.verifyPackage(pkg.id);

  return { runtime, packageId: pkg.id, verification };
}

describe('export scenario: missing proof reference', () => {
  it('1. the enforcement section ends up incomplete with a non-empty missingReferenceIds array', () => {
    const { runtime, packageId } = buildPackageWithDanglingReference();
    const pkg = runtime.getPackage(packageId);
    const enforcementSection = pkg?.sections.find((section) => section.type === 'enforcement');
    assert.equal(enforcementSection?.status, 'incomplete');
    assert.ok((enforcementSection?.missingReferenceIds.length ?? 0) > 0);
  });

  it('2. the missing reference id string mentions the dangling policyProofId field', () => {
    const { runtime, packageId } = buildPackageWithDanglingReference();
    const pkg = runtime.getPackage(packageId);
    const enforcementSection = pkg?.sections.find((section) => section.type === 'enforcement');
    assert.ok(enforcementSection?.missingReferenceIds.some((id) => id.includes('policyProofId') && id.includes('policy-proof-does-not-exist')));
  });

  it('3. the integrity report records a MISSING_REFERENCE issue at warning severity', () => {
    const { verification } = buildPackageWithDanglingReference();
    const missingReferenceIssue = verification.issues.find((issue) => issue.reasonCode === 'MISSING_REFERENCE');
    assert.ok(missingReferenceIssue !== undefined);
    assert.equal(missingReferenceIssue?.severity, 'warning');
  });

  it('4. since a missing reference is only a warning-severity issue, verification reaches verified_with_warnings rather than failed', () => {
    const { verification } = buildPackageWithDanglingReference();
    assert.equal(verification.status, 'verified_with_warnings');
  });
});
