import type { PolicyPackManifest, PolicyPackSafeFraming } from './policy-pack-manifest-types.js';
import { evaluatePolicyPackClaimSafety } from '../validation/policy-pack-claim-safety.js';

export interface PolicyPackManifestValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const CORE_SAFE_FRAMING_FLAGS: ReadonlyArray<readonly [keyof PolicyPackSafeFraming, string]> = [
  ['notLegalAdvice', 'must not claim to provide legal advice'],
  ['notComplianceCertification', 'must not claim to be a compliance certification'],
  ['noCompletenessClaim', 'must not claim to be a complete policy model'],
  ['noJurisdictionalComplianceClaim', 'must not claim jurisdictional compliance'],
  ['partialPolicyModel', 'must be marked as a partial policy model'],
];

function isSystemAuthoredOrDemo(manifest: PolicyPackManifest): boolean {
  return (
    manifest.scope.systemAuthored ||
    manifest.scope.demoOnly ||
    manifest.kind === 'system_pack' ||
    manifest.kind === 'demo_pack' ||
    manifest.sourceStatus === 'system_authored' ||
    manifest.sourceStatus === 'demo_fixture'
  );
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

/**
 * Validates a `PolicyPackManifest` structurally and for claim safety. Never
 * evaluates whether the pack's underlying rules are legally correct --
 * that is outside this module's scope by design.
 */
export function validatePolicyPackManifest(manifest: PolicyPackManifest): PolicyPackManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (isBlank(manifest.id)) errors.push('Manifest is missing an id.');
  if (isBlank(manifest.name)) errors.push('Manifest is missing a name.');
  if (isBlank(manifest.version)) errors.push('Manifest is missing a version.');
  if (isBlank(manifest.kind)) errors.push('Manifest is missing a kind.');
  if (isBlank(manifest.domain)) errors.push('Manifest is missing a domain.');
  if (isBlank(manifest.status)) errors.push('Manifest is missing a status.');
  if (isBlank(manifest.sourceStatus)) errors.push('Manifest is missing a sourceStatus.');
  if (manifest.safeFraming === undefined || manifest.safeFraming === null) {
    errors.push('Manifest is missing safeFraming.');
  }

  // Domain labels classify the pack; they are never a compliance claim on their own.
  warnings.push(`Domain label "${manifest.domain}" is a classification only and does not imply compliance with any law or regulation.`);

  if (manifest.safeFraming !== undefined && manifest.safeFraming !== null && isSystemAuthoredOrDemo(manifest)) {
    for (const [flag, description] of CORE_SAFE_FRAMING_FLAGS) {
      if (manifest.safeFraming[flag] !== true) {
        errors.push(`System-authored or demo pack "${manifest.id}" ${description} (safeFraming.${flag} must be true).`);
      }
    }
  }

  if ((manifest.kind === 'demo_pack' || manifest.sourceStatus === 'demo_fixture') && !manifest.scope.demoOnly) {
    errors.push(`Demo pack "${manifest.id}" must set scope.demoOnly = true.`);
  }

  if (manifest.kind === 'customer_pack' && !manifest.scope.customerSpecific) {
    errors.push(`Customer pack "${manifest.id}" must set scope.customerSpecific = true.`);
  }

  if (manifest.status === 'expired') {
    warnings.push(`Pack "${manifest.id}" is expired and must not be treated as active.`);
  }

  if (manifest.status === 'superseded' && isBlank(manifest.supersededByPackId)) {
    errors.push(`Superseded pack "${manifest.id}" must identify supersededByPackId.`);
  }

  if (manifest.status === 'disabled') {
    warnings.push(`Pack "${manifest.id}" is disabled and must not be treated as active.`);
  }

  for (const packId of [...manifest.requiredPackIds, ...manifest.extendsPackIds, ...manifest.optionalPackIds]) {
    if (isBlank(packId)) {
      errors.push(`Pack "${manifest.id}" declares a dependency with a blank pack id.`);
      break;
    }
  }

  if (isSystemAuthoredOrDemo(manifest) && manifest.claimProfile.requiredDisclaimers.length === 0) {
    errors.push(`System-authored or demo pack "${manifest.id}" must declare at least one required disclaimer.`);
  }

  const claimSafety = evaluatePolicyPackClaimSafety(manifest);
  if (!claimSafety.safe) {
    errors.push(`Manifest "${manifest.id}" contains prohibited overclaim phrases: ${claimSafety.prohibitedPhrasesFound.join(', ')}.`);
  }
  warnings.push(...claimSafety.warnings);

  return { valid: errors.length === 0, errors, warnings };
}
