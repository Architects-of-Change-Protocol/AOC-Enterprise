import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPolicyPackManifest, satisfiesPolicyPackValidationStatus } from '../../policy-pack-foundation/index.js';
import {
  JURISDICTION_CODE_DEMO_ALPHA,
  JURISDICTION_CODE_DEMO_BETA,
  buildDemoJurisdictionPackRuntimeFixture,
} from '../fixtures/jurisdiction-pack-runtime-fixtures.js';

describe('JurisdictionPackRuntime.resolve', () => {
  it('resolves a registered jurisdiction code and composes it against its extended global baseline', () => {
    const { runtime, globalBaseline, jurisdictionAlpha } = buildDemoJurisdictionPackRuntimeFixture();

    const result = runtime.resolve({ jurisdictionCode: JURISDICTION_CODE_DEMO_ALPHA, availableManifests: [globalBaseline] });

    assert.equal(result.status, 'resolved');
    assert.deepEqual(result.matchedPackIds, [jurisdictionAlpha.id]);
    assert.equal(result.composition?.composed, true);
    assert.ok(result.composition?.includedPackIds.includes(globalBaseline.id));
    assert.ok(result.composition?.includedPackIds.includes(jurisdictionAlpha.id));
    assert.deepEqual(result.errors, []);
  });

  it('produces approval/evidence/export/control-plane references via the Foundation adapters', () => {
    const { runtime, globalBaseline } = buildDemoJurisdictionPackRuntimeFixture();

    const result = runtime.resolve({ jurisdictionCode: JURISDICTION_CODE_DEMO_ALPHA, availableManifests: [globalBaseline] });

    assert.equal(result.approvalReferences.length, 1);
    assert.equal(result.approvalReferences[0]?.status, 'reference_only');
    assert.equal(result.evidenceReferences.length, 1);
    assert.equal(result.evidenceReferences[0]?.status, 'reference_only');
    assert.equal(result.exportReferences.length, 1);
    assert.equal(result.exportReferences[0]?.status, 'reference_only');
    assert.equal(result.controlPlaneReferences.length, 1);
    assert.ok(result.controlPlaneReferences[0]?.displaySafeLabels.includes('not_legal_advice'));
  });

  it('is unresolved for an unregistered jurisdiction code', () => {
    const { runtime } = buildDemoJurisdictionPackRuntimeFixture();
    const result = runtime.resolve({ jurisdictionCode: 'unknown-jurisdiction' });

    assert.equal(result.status, 'unresolved');
    assert.deepEqual(result.matchedPackIds, []);
    assert.ok(result.errors.length > 0);
    assert.equal(result.composition, undefined);
  });

  it('resolves both demo jurisdictions independently and deterministically', () => {
    const { runtime, globalBaseline, jurisdictionAlpha, jurisdictionBeta } = buildDemoJurisdictionPackRuntimeFixture();

    const alpha = runtime.resolve({ jurisdictionCode: JURISDICTION_CODE_DEMO_ALPHA, availableManifests: [globalBaseline] });
    const beta = runtime.resolve({ jurisdictionCode: JURISDICTION_CODE_DEMO_BETA, availableManifests: [globalBaseline] });

    assert.deepEqual(alpha.matchedPackIds, [jurisdictionAlpha.id]);
    assert.deepEqual(beta.matchedPackIds, [jurisdictionBeta.id]);

    const alphaAgain = runtime.resolve({ jurisdictionCode: JURISDICTION_CODE_DEMO_ALPHA, availableManifests: [globalBaseline] });
    assert.deepEqual(alpha, alphaAgain);
  });

  it('propagates requiredValidationStatus gating from composePolicyPacks', () => {
    const { runtime, globalBaseline } = buildDemoJurisdictionPackRuntimeFixture();

    const result = runtime.resolve({
      jurisdictionCode: JURISDICTION_CODE_DEMO_ALPHA,
      availableManifests: [globalBaseline],
      requiredValidationStatus: ['counsel_reviewed'],
    });

    assert.equal(result.composition?.validationStatusSatisfied, false);
    assert.equal(result.composition?.decision, 'require_counsel_review');
    assert.equal(satisfiesPolicyPackValidationStatus('demo_baseline', 'counsel_reviewed'), false);
  });

  it('reports ambiguous when a jurisdiction code has more than one active registered pack', () => {
    const fixture = buildDemoJurisdictionPackRuntimeFixture();
    // Register a second active pack under Alpha's code to force ambiguity.
    fixture.registry.register({
      jurisdictionCode: JURISDICTION_CODE_DEMO_ALPHA,
      manifest: createPolicyPackManifest({
        id: 'aoc.demo.jurisdiction_alpha.alt.v1',
        name: 'Alt Jurisdiction Alpha Pack',
        version: '1.0.0',
        kind: 'jurisdiction_pack',
        domain: 'jurisdiction',
        status: 'demo_baseline',
        sourceStatus: 'demo_fixture',
        description: 'A second, competing demo jurisdiction pack registered under the same code.',
      }),
    });

    const result = fixture.runtime.resolve({ jurisdictionCode: JURISDICTION_CODE_DEMO_ALPHA });
    assert.equal(result.status, 'ambiguous');
    assert.equal(result.matchedPackIds.length, 2);
  });
});
