import type { PolicyPackManifest, PolicyPackSourceStatus } from '../../../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import { createPolicyPackManifest } from '../../../../policy-pack-foundation/manifest/policy-pack-manifest-factory.js';
import { fromPolicyPackManifest } from '../../jurisdiction-pack-factory.js';
import type { JurisdictionPack, JurisdictionValidationStatus } from '../../jurisdiction-pack-types.js';
import { createCostaRicaJurisdictionDescriptor } from './costa-rica-jurisdiction-descriptor.js';
import { COSTA_RICA_APPROVAL_REQUIREMENTS } from './costa-rica-approval-requirements.js';
import { COSTA_RICA_EVIDENCE_REQUIREMENTS } from './costa-rica-evidence-requirements.js';
import { COSTA_RICA_EXPORT_REQUIREMENTS } from './costa-rica-export-requirements.js';
import { COSTA_RICA_CONTROL_PLANE_REQUIREMENT } from './costa-rica-control-plane.js';
import { COSTA_RICA_BASE_PACK_ID, COSTA_RICA_BASE_PACK_NAME, COSTA_RICA_BASE_PACK_VERSION, COSTA_RICA_REQUIRED_BASELINE_PACK_ID } from './costa-rica-constants.js';

/**
 * Soberanía Jurisdiction Costa Rica Base Pack v1
 * (`aoc.jurisdiction.costa_rica.base.v1`).
 *
 * A jurisdiction-aware operational baseline for Costa Rica-related actions,
 * built entirely on the Jurisdiction Pack Runtime / Policy Pack Foundation:
 * a real `PolicyPackManifest` (via `createPolicyPackManifest`), the shared
 * `PolicyPackValidationStatus` lattice, and the shared safe-framing
 * guarantees. It never encodes Costa Rican law, never interprets Costa Rican
 * law, never certifies compliance with Costa Rican law, never provides
 * legal advice, and never replaces Costa Rican counsel -- see this
 * directory's README for the full safety framing.
 *
 * Default `status`/`sourceStatus` are the safe, non-counsel-reviewed
 * baseline (`demo_baseline` / `system_authored`): this pack is created as
 * infrastructure and baseline triggers, not as a lawyer-reviewed legal
 * artifact, and it must never satisfy a `counsel_reviewed` requirement by
 * default (`satisfiesPolicyPackValidationStatus` enforces this for every
 * caller; see `costa-rica-resolution.ts`).
 */
export interface CreateCostaRicaBaseJurisdictionPackInput {
  readonly status?: JurisdictionValidationStatus;
  readonly sourceStatus?: PolicyPackSourceStatus;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly labels?: readonly string[];
  readonly notes?: readonly string[];
}

const DESCRIPTION =
  'Soberanía Jurisdiction Costa Rica Base Pack v1 provides a structured jurisdiction-aware baseline for Costa Rica-related actions: it identifies when Costa Rica jurisdiction context may be relevant, which evidence should be collected, which review paths may be required, and which safe labels/export metadata should be produced. It does not encode Costa Rican law, does not interpret Costa Rican law, does not certify compliance with Costa Rican law, does not provide legal advice, and does not replace Costa Rican counsel.';

const SAFETY_NOTE =
  'This pack does not encode Costa Rican law, does not provide legal advice, does not certify compliance with Costa Rican law, does not claim legal completeness, and does not replace Costa Rican counsel. It does not satisfy counsel_reviewed/counsel_attested requirements unless explicitly created with that status and corresponding evidence.';

export function createCostaRicaBaseJurisdictionPack(input?: CreateCostaRicaBaseJurisdictionPackInput): JurisdictionPack {
  const status: JurisdictionValidationStatus = input?.status ?? 'demo_baseline';
  const sourceStatus: PolicyPackSourceStatus = input?.sourceStatus ?? 'system_authored';
  const isDemoBaseline = status === 'demo_baseline' || sourceStatus === 'demo_fixture';

  const manifest: PolicyPackManifest = createPolicyPackManifest({
    id: COSTA_RICA_BASE_PACK_ID,
    name: COSTA_RICA_BASE_PACK_NAME,
    version: COSTA_RICA_BASE_PACK_VERSION,
    kind: 'jurisdiction_pack',
    domain: 'jurisdiction',
    status,
    sourceStatus,
    description: DESCRIPTION,
    scope: {
      global: false,
      jurisdictionSpecific: true,
      domainSpecific: false,
      useCaseSpecific: false,
      customerSpecific: false,
      demoOnly: isDemoBaseline,
      systemAuthored: true,
    },
    // Every flag below is forced true regardless of status/sourceStatus -- this pack never
    // opts out of its own safe framing, and createPolicyPackManifest additionally re-forces
    // the five core flags for any system-authored/demo pack (scope.systemAuthored is always
    // true above), so a caller cannot weaken these by passing a different status.
    safeFraming: {
      notLegalAdvice: true,
      notComplianceCertification: true,
      noCompletenessClaim: true,
      noJurisdictionalComplianceClaim: true,
      partialPolicyModel: true,
      requiresCustomerValidation: true,
      requiresCounselReviewWhenApplicable: true,
    },
    requiredPackIds: [COSTA_RICA_REQUIRED_BASELINE_PACK_ID],
    evidenceRequirements: COSTA_RICA_EVIDENCE_REQUIREMENTS,
    approvalRequirements: COSTA_RICA_APPROVAL_REQUIREMENTS,
    exportRequirements: COSTA_RICA_EXPORT_REQUIREMENTS,
    controlPlaneRequirements: [COSTA_RICA_CONTROL_PLANE_REQUIREMENT],
    labels: ['costa_rica_jurisdiction_context', ...(input?.labels ?? [])],
    notes: [SAFETY_NOTE, ...(input?.notes ?? [])],
    ...(input?.reviewedBy !== undefined ? { reviewedBy: input.reviewedBy } : {}),
    ...(input?.reviewedAt !== undefined ? { reviewedAt: input.reviewedAt } : {}),
    ...(input?.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
    ...(input?.effectiveUntil !== undefined ? { effectiveUntil: input.effectiveUntil } : {}),
  });

  return fromPolicyPackManifest(manifest, createCostaRicaJurisdictionDescriptor());
}
