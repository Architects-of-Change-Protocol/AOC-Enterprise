import { validatePolicyPackManifest, type PolicyPackManifest } from '../../policy-pack-foundation/index.js';
import type { JurisdictionCode, JurisdictionPackRegistration } from '../domain/jurisdiction-pack-runtime-types.js';
import { JurisdictionPackDuplicateManifestIdError, JurisdictionPackInvalidManifestError, JurisdictionPackWrongKindError } from '../runtime/jurisdiction-pack-runtime-errors.js';

/**
 * Registers jurisdiction pack manifests and indexes them by jurisdiction
 * code. This registry adds no manifest fields, no validation-status
 * semantics, and no claim-safety logic of its own -- every manifest is
 * validated with the Policy Pack Foundation's `validatePolicyPackManifest`,
 * and this class only tracks the jurisdiction-code lookup index on top.
 */
export class JurisdictionPackRegistry {
  private readonly registrationsByCode = new Map<JurisdictionCode, PolicyPackManifest[]>();
  private readonly manifestsById = new Map<string, PolicyPackManifest>();

  register(registration: JurisdictionPackRegistration): void {
    const { manifest, jurisdictionCode } = registration;

    if (manifest.kind !== 'jurisdiction_pack') {
      throw new JurisdictionPackWrongKindError(manifest.id, manifest.kind);
    }

    const validation = validatePolicyPackManifest(manifest);
    if (!validation.valid) {
      throw new JurisdictionPackInvalidManifestError(manifest.id, validation.errors);
    }

    if (this.manifestsById.has(manifest.id)) {
      throw new JurisdictionPackDuplicateManifestIdError(manifest.id);
    }

    this.manifestsById.set(manifest.id, manifest);
    const existing = this.registrationsByCode.get(jurisdictionCode) ?? [];
    this.registrationsByCode.set(jurisdictionCode, [...existing, manifest]);
  }

  getByJurisdictionCode(jurisdictionCode: JurisdictionCode): readonly PolicyPackManifest[] {
    return this.registrationsByCode.get(jurisdictionCode) ?? [];
  }

  getManifestById(manifestId: string): PolicyPackManifest | undefined {
    return this.manifestsById.get(manifestId);
  }

  allManifests(): readonly PolicyPackManifest[] {
    return [...this.manifestsById.values()];
  }

  allJurisdictionCodes(): readonly JurisdictionCode[] {
    return [...this.registrationsByCode.keys()];
  }
}

export function createJurisdictionPackRegistry(): JurisdictionPackRegistry {
  return new JurisdictionPackRegistry();
}
