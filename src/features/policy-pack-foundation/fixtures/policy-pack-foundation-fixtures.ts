import { createPolicyPackManifest } from '../manifest/policy-pack-manifest-factory.js';
import type { PolicyPackManifest } from '../manifest/policy-pack-manifest-types.js';

/**
 * Demo fixtures for the Policy Pack Foundation. Every fixture is a partial
 * policy model with no completeness claim -- none of these carry real law,
 * real jurisdiction content, or a real compliance determination. They exist
 * to exercise the manifest/composition/validation/no-overclaim machinery
 * deterministically.
 */

export function buildGlobalBaselineManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.global_legal_baseline.v1',
    name: 'AOC Global Legal Baseline (Demo Fixture)',
    version: '1.0.0',
    kind: 'global_baseline',
    domain: 'legal',
    status: 'system_baseline',
    sourceStatus: 'system_authored',
    description: 'Demo fixture: a partial, system-authored global legal baseline pack used to exercise the Foundation. Not legal advice; not a compliance certification.',
    labels: ['demo_fixture'],
    notes: ['Demo fixture for the Policy Pack Foundation. Carries no real jurisdiction-specific law.'],
  });
}

export function buildDemoLegalBaselineManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.demo.legal_baseline.v1',
    name: 'AOC Demo Legal Baseline',
    version: '1.0.0',
    kind: 'demo_pack',
    domain: 'legal',
    status: 'demo_baseline',
    sourceStatus: 'demo_fixture',
    description: 'Demo-only legal baseline pack for exercising the Foundation composition and validation harness. Not legal advice; not a compliance certification.',
    extendsPackIds: ['aoc.global_legal_baseline.v1'],
    labels: ['demo_fixture'],
  });
}

export function buildDemoJurisdictionManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.demo.jurisdiction_baseline.v1',
    name: 'AOC Demo Jurisdiction Baseline',
    version: '1.0.0',
    kind: 'demo_pack',
    domain: 'jurisdiction',
    status: 'demo_baseline',
    sourceStatus: 'demo_fixture',
    description: 'Demo-only jurisdiction-shaped pack used to exercise Foundation composition. Carries no real jurisdiction-specific law and makes no jurisdictional compliance claim.',
    requiredPackIds: ['aoc.global_legal_baseline.v1'],
    labels: ['demo_fixture'],
  });
}

export function buildCustomerProvidedManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'customer.demo_operator_policy.v1',
    name: 'Demo Customer-Provided Operator Policy',
    version: '1.0.0',
    kind: 'customer_pack',
    domain: 'general',
    status: 'customer_provided',
    sourceStatus: 'customer_provided',
    description: 'Demo fixture: a customer-provided policy pack that has not yet been validated by the customer or reviewed by counsel.',
  });
}

export function buildCustomerValidatedManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'customer.demo_operator_policy.v1',
    name: 'Demo Customer-Validated Operator Policy',
    version: '1.1.0',
    kind: 'customer_pack',
    domain: 'general',
    status: 'customer_validated',
    sourceStatus: 'customer_validated',
    description: 'Demo fixture: a customer-provided policy pack the customer has validated, but which has not been reviewed by counsel.',
  });
}

export function buildCounselReviewedManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'customer.demo_counsel_reviewed_policy.v1',
    name: 'Demo Counsel-Reviewed Policy',
    version: '1.0.0',
    kind: 'customer_pack',
    domain: 'legal',
    status: 'counsel_reviewed',
    sourceStatus: 'counsel_reviewed',
    description: 'Demo fixture: a customer policy pack that outside counsel has reviewed, short of a full attestation.',
  });
}

export function buildCounselAttestedManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'customer.demo_counsel_attested_policy.v1',
    name: 'Demo Counsel-Attested Policy',
    version: '1.0.0',
    kind: 'customer_pack',
    domain: 'legal',
    status: 'counsel_attested',
    sourceStatus: 'counsel_attested',
    description: 'Demo fixture: a customer policy pack that outside counsel has formally attested to.',
  });
}

export function buildExpiredManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.demo.expired_policy.v1',
    name: 'Demo Expired Policy',
    version: '0.9.0',
    kind: 'demo_pack',
    domain: 'general',
    status: 'expired',
    sourceStatus: 'demo_fixture',
    description: 'Demo fixture: a pack whose effective window has lapsed and which must not be treated as active.',
    effectiveFrom: '2024-01-01T00:00:00.000Z',
    effectiveUntil: '2025-01-01T00:00:00.000Z',
  });
}

export function buildSupersededManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.demo.superseded_policy.v1',
    name: 'Demo Superseded Policy',
    version: '1.0.0',
    kind: 'demo_pack',
    domain: 'general',
    status: 'superseded',
    sourceStatus: 'demo_fixture',
    description: 'Demo fixture: a pack that has been replaced by a newer version and must not be treated as active.',
    supersededByPackId: 'aoc.demo.superseded_policy.v2',
  });
}

export function buildDisabledManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.demo.disabled_policy.v1',
    name: 'Demo Disabled Policy',
    version: '1.0.0',
    kind: 'demo_pack',
    domain: 'general',
    status: 'disabled',
    sourceStatus: 'demo_fixture',
    description: 'Demo fixture: a pack an operator has explicitly disabled and which must never be treated as available.',
  });
}

export function buildSecurityDomainManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.demo.security_baseline.v1',
    name: 'Demo Security Baseline',
    version: '1.0.0',
    kind: 'domain_pack',
    domain: 'security',
    status: 'demo_baseline',
    sourceStatus: 'demo_fixture',
    description: 'Demo fixture: a partial security-domain pack. The "security" domain label is a classification only; this pack does not claim to be fully secure.',
  });
}

export function buildPrivacyDomainManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.demo.privacy_baseline.v1',
    name: 'Demo Privacy Baseline',
    version: '1.0.0',
    kind: 'domain_pack',
    domain: 'privacy',
    status: 'demo_baseline',
    sourceStatus: 'demo_fixture',
    description: 'Demo fixture: a partial privacy-domain pack. The "privacy" domain label is a classification only; it does not claim compliance with any privacy regulation.',
  });
}

export function buildAiGovernanceManifestFixture(): PolicyPackManifest {
  return createPolicyPackManifest({
    id: 'aoc.demo.ai_governance_baseline.v1',
    name: 'Demo AI Governance Baseline',
    version: '1.0.0',
    kind: 'domain_pack',
    domain: 'ai_governance',
    status: 'demo_baseline',
    sourceStatus: 'demo_fixture',
    description: 'Demo fixture: a partial AI-governance pack. The "ai_governance" domain label is a classification only; it does not claim the governed system is unbiased or regulator-approved.',
  });
}

export const fixture = {
  globalBaselineManifest: buildGlobalBaselineManifestFixture,
  demoLegalBaselineManifest: buildDemoLegalBaselineManifestFixture,
  demoJurisdictionManifest: buildDemoJurisdictionManifestFixture,
  customerProvidedManifest: buildCustomerProvidedManifestFixture,
  customerValidatedManifest: buildCustomerValidatedManifestFixture,
  counselReviewedManifest: buildCounselReviewedManifestFixture,
  counselAttestedManifest: buildCounselAttestedManifestFixture,
  expiredManifest: buildExpiredManifestFixture,
  supersededManifest: buildSupersededManifestFixture,
  disabledManifest: buildDisabledManifestFixture,
  securityDomainManifest: buildSecurityDomainManifestFixture,
  privacyDomainManifest: buildPrivacyDomainManifestFixture,
  aiGovernanceManifest: buildAiGovernanceManifestFixture,
} as const;
