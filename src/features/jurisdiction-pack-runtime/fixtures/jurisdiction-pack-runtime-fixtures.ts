import {
  buildGlobalBaselineManifestFixture,
  createPolicyPackManifest,
  detectFoundationRuntimeCapabilities,
  type PolicyPackManifest,
} from '../../policy-pack-foundation/index.js';
import { createJurisdictionPackRegistry, JurisdictionPackRegistry } from '../services/jurisdiction-pack-registry.js';
import { createJurisdictionPackRuntime, JurisdictionPackRuntime } from '../runtime/jurisdiction-pack-runtime.js';
import type { JurisdictionCode } from '../domain/jurisdiction-pack-runtime-types.js';

/**
 * Demo fixtures for the Jurisdiction Pack Runtime. "Jurisdiction Alpha" and
 * "Jurisdiction Beta" are fictional, generic jurisdiction codes -- never
 * real ISO country/state/province codes -- and carry no real law. They
 * exist only to exercise registration, resolution, and composition
 * deterministically.
 */

export const JURISDICTION_CODE_DEMO_ALPHA: JurisdictionCode = 'demo-jurisdiction-alpha';
export const JURISDICTION_CODE_DEMO_BETA: JurisdictionCode = 'demo-jurisdiction-beta';

export function buildDemoJurisdictionAlphaManifestFixture(extendsPackId: string): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.demo.jurisdiction_alpha.base.v1',
    name: 'Demo Jurisdiction Alpha Baseline',
    version: '1.0.0',
    kind: 'jurisdiction_pack',
    domain: 'jurisdiction',
    status: 'demo_baseline',
    sourceStatus: 'demo_fixture',
    description:
      'Demo fixture: a fictional jurisdiction pack for the made-up "Jurisdiction Alpha" used to exercise the Jurisdiction Pack Runtime. Carries no real law and makes no jurisdictional compliance claim.',
    extendsPackIds: [extendsPackId],
    evidenceRequirements: [{ id: 'jurisdiction-alpha-evidence-1', evidenceType: 'demo_local_filing_reference', required: true }],
    approvalRequirements: [{ id: 'jurisdiction-alpha-approval-1', reviewType: 'operator_review', required: false }],
    exportRequirements: [{ id: 'jurisdiction-alpha-export-1', exportType: 'audit_bundle', required: true }],
    controlPlaneRequirements: [{ id: 'jurisdiction-alpha-control-plane-1', surface: 'policy_pack', required: true, safeDisplayLabels: ['not_legal_advice', 'no_jurisdictional_compliance_claim'] }],
  });
}

export function buildDemoJurisdictionBetaManifestFixture(extendsPackId: string): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.demo.jurisdiction_beta.base.v1',
    name: 'Demo Jurisdiction Beta Baseline',
    version: '1.0.0',
    kind: 'jurisdiction_pack',
    domain: 'jurisdiction',
    status: 'demo_baseline',
    sourceStatus: 'demo_fixture',
    description:
      'Demo fixture: a fictional jurisdiction pack for the made-up "Jurisdiction Beta" used to exercise the Jurisdiction Pack Runtime. Carries no real law and makes no jurisdictional compliance claim.',
    extendsPackIds: [extendsPackId],
  });
}

export function buildExpiredDemoJurisdictionManifestFixture(extendsPackId: string): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.demo.jurisdiction_alpha.expired.v0',
    name: 'Demo Jurisdiction Alpha Baseline (expired)',
    version: '0.1.0',
    kind: 'jurisdiction_pack',
    domain: 'jurisdiction',
    status: 'expired',
    sourceStatus: 'demo_fixture',
    description: 'Demo fixture: an expired, superseded prior version of the Jurisdiction Alpha pack, used to exercise resolver filtering of inactive packs.',
    extendsPackIds: [extendsPackId],
    supersededByPackId: 'aoc.demo.jurisdiction_alpha.base.v1',
  });
}

export interface DemoJurisdictionPackRuntimeFixture {
  readonly globalBaseline: PolicyPackManifest;
  readonly jurisdictionAlpha: PolicyPackManifest;
  readonly jurisdictionBeta: PolicyPackManifest;
  readonly registry: JurisdictionPackRegistry;
  readonly runtime: JurisdictionPackRuntime;
}

export function buildDemoJurisdictionPackRuntimeFixture(): DemoJurisdictionPackRuntimeFixture {
  const globalBaseline = buildGlobalBaselineManifestFixture();
  const jurisdictionAlpha = buildDemoJurisdictionAlphaManifestFixture(globalBaseline.id);
  const jurisdictionBeta = buildDemoJurisdictionBetaManifestFixture(globalBaseline.id);

  const registry = createJurisdictionPackRegistry();
  registry.register({ jurisdictionCode: JURISDICTION_CODE_DEMO_ALPHA, manifest: jurisdictionAlpha });
  registry.register({ jurisdictionCode: JURISDICTION_CODE_DEMO_BETA, manifest: jurisdictionBeta });

  const runtime = createJurisdictionPackRuntime(registry, detectFoundationRuntimeCapabilities());

  return { globalBaseline, jurisdictionAlpha, jurisdictionBeta, registry, runtime };
}
