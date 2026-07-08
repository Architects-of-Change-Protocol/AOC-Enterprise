import type { PolicyPackSafeFraming } from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import type { ExportRuntimeReference, FoundationRuntimeIntegrationStatus } from '../../policy-pack-foundation/foundation/foundation-runtime-types.js';
import { createPolicyPackExportAdapter } from '../../policy-pack-foundation/adapters/policy-pack-export-adapter.js';
import type { PolicyPackCompositionDecision, PolicyPackCompositionResult } from '../../policy-pack-foundation/composition/policy-pack-composition-types.js';
import { assertNoPolicyPackOverclaim } from '../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { POLICY_PACK_SAFE_LABELS } from '../../policy-pack-foundation/manifest/policy-pack-manifest-constants.js';

export interface CreateJurisdictionExportMetadataInput {
  readonly exportId: string;
  readonly composition: PolicyPackCompositionResult;
  readonly capabilities: readonly FoundationRuntimeIntegrationStatus[];
}

export interface JurisdictionExportMetadata {
  readonly exportId: string;
  readonly rootPackId: string;
  readonly safeFraming: PolicyPackSafeFraming;
  readonly decision: PolicyPackCompositionDecision;
  readonly exportReferences: readonly ExportRuntimeReference[];
  readonly disclaimers: readonly string[];
}

/**
 * Builds export metadata for a jurisdiction composition. The export
 * references come from the shared `createPolicyPackExportAdapter` (never
 * from a jurisdiction-specific export runtime), the safe framing is the
 * composition's own combined `PolicyPackSafeFraming` (never a duplicated
 * jurisdiction-safe metadata shape), and the result is scanned with
 * `assertNoPolicyPackOverclaim` before being returned so this function can
 * never hand back an unsafe claim.
 */
export function createJurisdictionExportMetadata(input: CreateJurisdictionExportMetadataInput): JurisdictionExportMetadata {
  const adapter = createPolicyPackExportAdapter(input.capabilities);
  const exportReferences = adapter.toExportRuntimeReferences(input.composition.requiredExports, input.composition.rootPackId);

  const metadata: JurisdictionExportMetadata = {
    exportId: input.exportId,
    rootPackId: input.composition.rootPackId,
    safeFraming: input.composition.safeFraming,
    decision: input.composition.decision,
    exportReferences,
    disclaimers: [...POLICY_PACK_SAFE_LABELS],
  };

  assertNoPolicyPackOverclaim(metadata);
  return metadata;
}
