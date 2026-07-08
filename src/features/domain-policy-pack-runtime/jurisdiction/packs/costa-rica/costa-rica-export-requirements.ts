import type { PolicyPackExportRequirement, PolicyPackExportType } from '../../../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import type { FoundationRuntimeIntegrationStatus } from '../../../../policy-pack-foundation/foundation/foundation-runtime-types.js';
import type { PolicyPackCompositionResult } from '../../../../policy-pack-foundation/composition/policy-pack-composition-types.js';
import { assertNoPolicyPackOverclaim } from '../../../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { createJurisdictionExportMetadata } from '../../jurisdiction-pack-export.js';
import type { JurisdictionExportMetadata } from '../../jurisdiction-pack-export.js';

/**
 * Costa Rica base export-requirement catalog, using the shared
 * `PolicyPackExportRequirement` shape directly. These describe what an
 * auditor should be able to see for a Costa Rica-related action -- which
 * pack was used, its status, its declared jurisdiction, and the
 * evidence/approval/decision produced -- never a Costa Rica compliance,
 * legal-validity, or regulatory-approval claim (see
 * `createCostaRicaExportMetadata` below, which scans its own output with
 * `assertNoPolicyPackOverclaim` as defense in depth).
 */
export const COSTA_RICA_EXPORT_TYPES: readonly PolicyPackExportType[] = ['manifest_bundle', 'policy_decision', 'composition_bundle', 'evidence_bundle', 'approval_bundle', 'audit_bundle'];

export const COSTA_RICA_EXPORT_REQUIREMENTS: readonly PolicyPackExportRequirement[] = COSTA_RICA_EXPORT_TYPES.map((exportType) => ({
  id: `costa-rica-export-${exportType.replace(/_/g, '-')}`,
  exportType,
  required: true,
}));

export interface CreateCostaRicaExportMetadataInput {
  readonly exportId: string;
  readonly composition: PolicyPackCompositionResult;
  readonly capabilities: readonly FoundationRuntimeIntegrationStatus[];
}

export type CostaRicaExportMetadata = JurisdictionExportMetadata;

/**
 * Builds export metadata for a Costa Rica composition. This is a thin
 * delegation to the shared `createJurisdictionExportMetadata` -- it never
 * introduces a Costa Rica-specific export runtime. Lets a caller see which
 * pack was used (`rootPackId`), its decision, its combined safe framing, and
 * its export references; never a Costa Rica compliance, legal-validity, or
 * regulatory-approval claim. Re-scanned with `assertNoPolicyPackOverclaim`
 * here as defense in depth on top of the shared function's own scan.
 */
export function createCostaRicaExportMetadata(input: CreateCostaRicaExportMetadataInput): CostaRicaExportMetadata {
  const metadata = createJurisdictionExportMetadata(input);
  assertNoPolicyPackOverclaim(metadata);
  return metadata;
}
