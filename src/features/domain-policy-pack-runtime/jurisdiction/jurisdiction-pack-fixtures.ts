import { createJurisdictionPack } from './jurisdiction-pack-factory.js';
import type { JurisdictionPack } from './jurisdiction-pack-types.js';

/**
 * Demo fixtures for the aligned Jurisdiction Pack Runtime. Every fixture
 * describes a placeholder, generic-shaped jurisdiction pack with no
 * completeness claim -- none of these carry real law, a real jurisdiction's
 * name, or a real compliance determination. They exist to exercise the
 * jurisdiction factory/validator/resolver/composer/adapters deterministically,
 * against the same `aoc.global_legal_baseline.v1` baseline manifest fixture
 * `policy-pack-foundation` itself uses (see `buildGlobalBaselineManifestFixture`
 * in `policy-pack-foundation/fixtures`).
 */

const DEMO_JURISDICTION = { jurisdictionId: 'demo-jurisdiction', label: 'Demo Jurisdiction (Placeholder)' } as const;

export function buildDemoJurisdictionPackFixture(): JurisdictionPack {
  return createJurisdictionPack({
    id: 'aoc.demo.jurisdiction_pack_runtime.v1',
    name: 'Soberanía Demo Jurisdiction Pack (Runtime Fixture)',
    version: '1.0.0',
    jurisdiction: DEMO_JURISDICTION,
    status: 'demo_baseline',
    sourceStatus: 'demo_fixture',
    description: 'Demo-only jurisdiction pack used to exercise the aligned Jurisdiction Pack Runtime. Carries no real jurisdiction-specific law; not legal advice; not a jurisdictional compliance certification.',
    requiredPackIds: ['aoc.global_legal_baseline.v1'],
    labels: ['demo_fixture'],
  });
}

export function buildCustomerProvidedJurisdictionPackFixture(): JurisdictionPack {
  return createJurisdictionPack({
    id: 'customer.demo_jurisdiction_pack.v1',
    name: 'Demo Customer-Provided Jurisdiction Pack',
    version: '1.0.0',
    jurisdiction: DEMO_JURISDICTION,
    status: 'customer_provided',
    sourceStatus: 'customer_provided',
    description: 'Demo fixture: a customer-provided jurisdiction pack that has not yet been validated by the customer or reviewed by counsel.',
  });
}

export function buildCustomerValidatedJurisdictionPackFixture(): JurisdictionPack {
  return createJurisdictionPack({
    id: 'customer.demo_jurisdiction_pack.v1',
    name: 'Demo Customer-Validated Jurisdiction Pack',
    version: '1.1.0',
    jurisdiction: DEMO_JURISDICTION,
    status: 'customer_validated',
    sourceStatus: 'customer_validated',
    description: 'Demo fixture: a customer-provided jurisdiction pack the customer has validated, but which has not been reviewed by counsel.',
  });
}

export function buildCounselReviewedJurisdictionPackFixture(): JurisdictionPack {
  return createJurisdictionPack({
    id: 'customer.demo_counsel_reviewed_jurisdiction_pack.v1',
    name: 'Demo Counsel-Reviewed Jurisdiction Pack',
    version: '1.0.0',
    jurisdiction: DEMO_JURISDICTION,
    status: 'counsel_reviewed',
    sourceStatus: 'counsel_reviewed',
    description: 'Demo fixture: a jurisdiction pack that outside counsel has reviewed, short of a full attestation.',
  });
}

export function buildCounselAttestedJurisdictionPackFixture(): JurisdictionPack {
  return createJurisdictionPack({
    id: 'customer.demo_counsel_attested_jurisdiction_pack.v1',
    name: 'Demo Counsel-Attested Jurisdiction Pack',
    version: '1.0.0',
    jurisdiction: DEMO_JURISDICTION,
    status: 'counsel_attested',
    sourceStatus: 'counsel_attested',
    description: 'Demo fixture: a jurisdiction pack that outside counsel has formally attested to.',
  });
}

/**
 * Demo fixture carrying real evidence/review requirement objects (not just a
 * validation status), used to exercise the shared evidence/approval
 * reference adapters -- separate from the counsel-reviewed/attested fixtures
 * above, whose only purpose is exercising `PolicyPackValidationStatus`
 * satisfaction, not pending-approval decisions.
 */
export function buildJurisdictionPackWithRequirementsFixture(): JurisdictionPack {
  return createJurisdictionPack({
    id: 'aoc.demo.jurisdiction_pack_with_requirements.v1',
    name: 'Demo Jurisdiction Pack With Requirements',
    version: '1.0.0',
    jurisdiction: DEMO_JURISDICTION,
    status: 'demo_baseline',
    sourceStatus: 'demo_fixture',
    description: 'Demo-only jurisdiction pack carrying evidence and review requirements, used to exercise the shared Foundation adapters. Not legal advice; not a jurisdictional compliance certification.',
    evidenceRequirements: [
      { id: 'demo-jurisdiction-basis-source', evidenceType: 'jurisdiction_basis_source', required: true, jurisdictionEvidenceType: 'jurisdiction_basis_source' },
    ],
    reviewRequirements: [
      { id: 'demo-jurisdiction-counsel-review', reviewType: 'counsel_review', required: true, jurisdictionReviewType: 'counsel_review' },
    ],
    labels: ['demo_fixture'],
  });
}

export const jurisdictionFixture = {
  demoJurisdictionPack: buildDemoJurisdictionPackFixture,
  customerProvidedJurisdictionPack: buildCustomerProvidedJurisdictionPackFixture,
  customerValidatedJurisdictionPack: buildCustomerValidatedJurisdictionPackFixture,
  counselReviewedJurisdictionPack: buildCounselReviewedJurisdictionPackFixture,
  counselAttestedJurisdictionPack: buildCounselAttestedJurisdictionPackFixture,
  jurisdictionPackWithRequirements: buildJurisdictionPackWithRequirementsFixture,
} as const;
