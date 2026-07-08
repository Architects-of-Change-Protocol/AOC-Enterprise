import type { PolicyPackManifestValidationResult } from '../../policy-pack-foundation/manifest/policy-pack-manifest-validator.js';
import { validatePolicyPackManifest } from '../../policy-pack-foundation/manifest/policy-pack-manifest-validator.js';
import { JURISDICTION_VALIDATION_STATUSES } from './jurisdiction-pack-constants.js';
import type { JurisdictionPack } from './jurisdiction-pack-types.js';

/** Not a parallel result shape -- `validateJurisdictionPack` returns the same `valid`/`errors`/`warnings` structure `validatePolicyPackManifest` does. */
export type JurisdictionPackValidationResult = PolicyPackManifestValidationResult;

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * Validates a `JurisdictionPack` by delegating structural and claim-safety
 * checks to `validatePolicyPackManifest`, then adding only the checks that
 * are specific to a jurisdiction pack's shape: it must be a `jurisdiction_pack`
 * manifest scoped to the `jurisdiction` domain, must never drop the
 * `noJurisdictionalComplianceClaim` guarantee, and must identify the
 * jurisdiction it describes.
 */
export function validateJurisdictionPack(pack: JurisdictionPack): JurisdictionPackValidationResult {
  const manifestResult = validatePolicyPackManifest(pack.manifest);
  const errors = [...manifestResult.errors];
  const warnings = [...manifestResult.warnings];

  if (pack.manifest.kind !== 'jurisdiction_pack') {
    errors.push(`Jurisdiction pack "${pack.manifest.id}" must have manifest.kind = "jurisdiction_pack".`);
  }
  if (pack.manifest.domain !== 'jurisdiction') {
    errors.push(`Jurisdiction pack "${pack.manifest.id}" must have manifest.domain = "jurisdiction".`);
  }
  if (!pack.manifest.scope.jurisdictionSpecific) {
    errors.push(`Jurisdiction pack "${pack.manifest.id}" must have manifest.scope.jurisdictionSpecific = true.`);
  }
  if (pack.manifest.safeFraming.noJurisdictionalComplianceClaim !== true) {
    errors.push(`Jurisdiction pack "${pack.manifest.id}" must have manifest.safeFraming.noJurisdictionalComplianceClaim = true.`);
  }
  if (!(JURISDICTION_VALIDATION_STATUSES as readonly string[]).includes(pack.manifest.status)) {
    errors.push(
      `Jurisdiction pack "${pack.manifest.id}" has status "${pack.manifest.status}", which is not a JurisdictionValidationStatus (${JURISDICTION_VALIDATION_STATUSES.join(', ')}).`,
    );
  }
  if (isBlank(pack.jurisdiction.jurisdictionId)) {
    errors.push(`Jurisdiction pack "${pack.manifest.id}" is missing a jurisdiction.jurisdictionId.`);
  }
  if (isBlank(pack.jurisdiction.label)) {
    errors.push(`Jurisdiction pack "${pack.manifest.id}" is missing a jurisdiction.label.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
