import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPolicyPackManifest } from '../manifest/policy-pack-manifest-factory.js';
import { composePolicyPacks } from '../composition/policy-pack-composer.js';
import { assertNoPolicyPackOverclaim } from '../validation/policy-pack-no-overclaim.js';
import type { PolicyPackManifest } from '../manifest/policy-pack-manifest-types.js';

const globalBaseline = createPolicyPackManifest({
  id: 'global-baseline',
  name: 'Global Baseline',
  version: '1.0.0',
  kind: 'global_baseline',
  domain: 'general',
  status: 'system_baseline',
  sourceStatus: 'system_authored',
  description: 'Demo global baseline pack.',
});

const domainPack = createPolicyPackManifest({
  id: 'domain-pack',
  name: 'Domain Pack',
  version: '1.0.0',
  kind: 'domain_pack',
  domain: 'general',
  status: 'system_baseline',
  sourceStatus: 'system_authored',
  description: 'Demo domain pack that requires the global baseline.',
  requiredPackIds: ['global-baseline'],
  evidenceRequirements: [{ id: 'ev-1', evidenceType: 'contract', required: true }],
  approvalRequirements: [{ id: 'ap-1', reviewType: 'operator_review', required: false }],
  exportRequirements: [{ id: 'ex-1', exportType: 'audit_bundle', required: true }],
  controlPlaneRequirements: [{ id: 'cp-1', surface: 'policy_pack', required: true, safeDisplayLabels: ['not_legal_advice'] }],
});

function baseInput(overrides: Partial<Parameters<typeof composePolicyPacks>[0]> = {}) {
  return {
    compositionId: 'composition-1',
    rootPackId: 'domain-pack',
    requestedPackIds: ['domain-pack'],
    availableManifests: [globalBaseline, domainPack] as readonly PolicyPackManifest[],
    ...overrides,
  };
}

describe('composePolicyPacks', () => {
  it('19. composes a simple pack dependency graph', () => {
    const result = composePolicyPacks(baseInput());

    assert.equal(result.composed, true);
    assert.ok(result.includedPackIds.includes('global-baseline'));
    assert.ok(result.includedPackIds.includes('domain-pack'));
    assert.ok(result.dependencyGraph.some((edge) => edge.fromPackId === 'domain-pack' && edge.toPackId === 'global-baseline' && edge.dependencyType === 'requires' && edge.satisfied));
  });

  it('20. a missing required pack blocks composition', () => {
    const result = composePolicyPacks(baseInput({ availableManifests: [domainPack] }));

    assert.equal(result.composed, false);
    assert.ok(result.missingPackIds.includes('global-baseline'));
    assert.ok(['hold', 'require_review'].includes(result.decision));
  });

  it('21. a missing optional pack does not block composition', () => {
    const packWithOptional = createPolicyPackManifest({
      id: 'pack-with-optional',
      name: 'Pack With Optional',
      version: '1.0.0',
      kind: 'domain_pack',
      domain: 'general',
      status: 'system_baseline',
      sourceStatus: 'system_authored',
      description: 'Demo pack with an unresolved optional dependency.',
      optionalPackIds: ['does-not-exist'],
    });

    const result = composePolicyPacks({
      compositionId: 'composition-optional',
      rootPackId: 'pack-with-optional',
      requestedPackIds: ['pack-with-optional'],
      availableManifests: [packWithOptional],
    });

    assert.equal(result.composed, true);
    assert.ok(!result.missingPackIds.includes('does-not-exist'));
    assert.ok(result.dependencyGraph.some((edge) => edge.toPackId === 'does-not-exist' && edge.dependencyType === 'optional' && !edge.satisfied));
  });

  it('22. an expired required pack blocks composition with hold', () => {
    const expiredBaseline = createPolicyPackManifest({
      id: 'global-baseline',
      name: 'Global Baseline',
      version: '1.0.0',
      kind: 'global_baseline',
      domain: 'general',
      status: 'expired',
      sourceStatus: 'system_authored',
      description: 'Demo expired global baseline pack.',
    });

    const result = composePolicyPacks(baseInput({ availableManifests: [expiredBaseline, domainPack] }));

    assert.equal(result.composed, false);
    assert.ok(result.expiredPackIds.includes('global-baseline'));
    assert.equal(result.decision, 'hold');
  });

  it('23. a disabled required pack denies composition', () => {
    const disabledBaseline = createPolicyPackManifest({
      id: 'global-baseline',
      name: 'Global Baseline',
      version: '1.0.0',
      kind: 'global_baseline',
      domain: 'general',
      status: 'disabled',
      sourceStatus: 'system_authored',
      description: 'Demo disabled global baseline pack.',
    });

    const result = composePolicyPacks(baseInput({ availableManifests: [disabledBaseline, domainPack] }));

    assert.equal(result.composed, false);
    assert.ok(result.disabledPackIds.includes('global-baseline'));
    assert.equal(result.decision, 'deny');
  });

  it('24. a required counsel-reviewed status triggers require_counsel_review', () => {
    const customerValidatedPack = createPolicyPackManifest({
      id: 'customer-pack',
      name: 'Customer Pack',
      version: '1.0.0',
      kind: 'customer_pack',
      domain: 'general',
      status: 'customer_validated',
      sourceStatus: 'customer_validated',
      description: 'Demo customer-validated pack.',
    });

    const result = composePolicyPacks({
      compositionId: 'composition-counsel',
      rootPackId: 'customer-pack',
      requestedPackIds: ['customer-pack'],
      availableManifests: [customerValidatedPack],
      requiredValidationStatus: ['counsel_reviewed'],
    });

    assert.equal(result.validationStatusSatisfied, false);
    assert.equal(result.decision, 'require_counsel_review');
  });

  it('25. aggregates evidence/approval/export/control-plane requirements uniquely', () => {
    const duplicatePack = createPolicyPackManifest({
      id: 'duplicate-pack',
      name: 'Duplicate Pack',
      version: '1.0.0',
      kind: 'domain_pack',
      domain: 'general',
      status: 'system_baseline',
      sourceStatus: 'system_authored',
      description: 'Demo pack sharing requirement ids with the domain pack.',
      requiredPackIds: ['domain-pack'],
      evidenceRequirements: [{ id: 'ev-1', evidenceType: 'contract', required: true }],
      exportRequirements: [{ id: 'ex-1', exportType: 'audit_bundle', required: true }],
    });

    const result = composePolicyPacks({
      compositionId: 'composition-aggregate',
      rootPackId: 'duplicate-pack',
      requestedPackIds: ['duplicate-pack'],
      availableManifests: [globalBaseline, domainPack, duplicatePack],
    });

    assert.equal(result.requiredEvidence.filter((requirement) => requirement.id === 'ev-1').length, 1);
    assert.equal(result.requiredExports.filter((requirement) => requirement.id === 'ex-1').length, 1);
    assert.ok(result.requiredApprovals.some((requirement) => requirement.id === 'ap-1'));
    assert.ok(result.requiredControlPlaneSurfaces.some((requirement) => requirement.id === 'cp-1'));
  });

  it('27. composition result does not overclaim', () => {
    const result = composePolicyPacks(baseInput());
    assertNoPolicyPackOverclaim(result);
  });
});
