import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPMFreakAgentPassportDemoPackManifest } from '../pmfreak-agent-passport-manifest.js';
import { PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID, PMFREAK_AGENT_PASSPORT_DEMO_PACK_NAME } from '../pmfreak-agent-passport-constants.js';
import { validatePolicyPackManifest } from '../../../policy-pack-foundation/manifest/policy-pack-manifest-validator.js';

describe('PMFreak Agent Passport Demo Pack manifest', () => {
  it('1. creates a PMFreak Agent Passport Demo Pack manifest with the correct identity, domain, status, and scope', () => {
    const manifest = createPMFreakAgentPassportDemoPackManifest();

    assert.equal(manifest.id, PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID);
    assert.equal(manifest.id, 'aoc.demo.pmfreak.agent_passport.v1');
    assert.equal(manifest.name, PMFREAK_AGENT_PASSPORT_DEMO_PACK_NAME);
    assert.equal(manifest.kind, 'demo_pack');
    assert.equal(manifest.domain, 'project_governance');
    assert.equal(manifest.status, 'demo_baseline');
    assert.equal(manifest.sourceStatus, 'system_authored');
    assert.equal(manifest.scope.demoOnly, true);
    assert.equal(manifest.scope.domainSpecific, true);
    assert.equal(manifest.scope.useCaseSpecific, true);
    assert.equal(manifest.scope.customerSpecific, false);
    assert.equal(manifest.scope.systemAuthored, true);
  });

  it('safe framing defaults are all true', () => {
    const manifest = createPMFreakAgentPassportDemoPackManifest();

    assert.equal(manifest.safeFraming.notLegalAdvice, true);
    assert.equal(manifest.safeFraming.notComplianceCertification, true);
    assert.equal(manifest.safeFraming.noCompletenessClaim, true);
    assert.equal(manifest.safeFraming.partialPolicyModel, true);
    assert.equal(manifest.safeFraming.requiresCustomerValidation, true);
    assert.equal(manifest.safeFraming.requiresDomainExpertReviewWhenApplicable, true);
  });

  it('carries the required PMFreak demo labels and never a production-integration label', () => {
    const manifest = createPMFreakAgentPassportDemoPackManifest();

    const requiredLabels = [
      'pmfreak',
      'agent_passport',
      'aoc_enterprise_demo',
      'project_governance',
      'identity_governance',
      'authority_scope',
      'capability_tokens',
      'evidence_required',
      'approval_required',
      'audit_trail',
      'demo_baseline',
      'not_production_integration',
    ];
    for (const label of requiredLabels) assert.ok(manifest.labels.includes(label), `expected label "${label}"`);

    const forbiddenLabels = ['production_ready', 'certified_enterprise_compliant', 'fully_governed', 'legally_approved', 'risk_free'];
    for (const label of forbiddenLabels) assert.ok(!manifest.labels.includes(label), `must not include label "${label}"`);
  });

  it('validates structurally through the shared Policy Pack Foundation validator', () => {
    const manifest = createPMFreakAgentPassportDemoPackManifest();
    const result = validatePolicyPackManifest(manifest);

    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  it('cannot opt out of safe framing even when a caller passes a non-demo status', () => {
    const manifest = createPMFreakAgentPassportDemoPackManifest({ status: 'operator_reviewed', sourceStatus: 'system_authored' });

    assert.equal(manifest.safeFraming.notLegalAdvice, true);
    assert.equal(manifest.safeFraming.notComplianceCertification, true);
    assert.equal(manifest.safeFraming.noCompletenessClaim, true);
    assert.equal(manifest.safeFraming.partialPolicyModel, true);
  });
});
