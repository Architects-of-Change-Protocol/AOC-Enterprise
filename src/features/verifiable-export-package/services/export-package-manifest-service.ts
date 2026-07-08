import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageType } from '../domain/export-package.js';
import type { ExportPackageSection, ExportPackageSectionType } from '../domain/export-package-section.js';
import type { ExportPackageReference } from '../domain/export-package-reference.js';
import type { ExportPackageManifest } from '../domain/export-package-manifest.js';
import { ExportPackageHashService } from './export-package-hash-service.js';

export const REQUIRED_SECTIONS_BY_PACKAGE_TYPE: Readonly<Record<ExportPackageType, readonly ExportPackageSectionType[]>> = {
  decision_packet: ['summary', 'enforcement'],
  audit_bundle: ['summary'],
  policy_decision_packet: ['summary', 'policy'],
  enforcement_decision_packet: ['summary', 'enforcement'],
  approval_decision_packet: ['summary', 'approval'],
  evidence_packet: ['summary', 'evidence'],
  control_plane_snapshot_packet: ['summary', 'control_plane'],
  enterprise_demo_packet: ['summary', 'enterprise_demo'],
};

export interface CreateManifestInput {
  readonly packageId: string;
  readonly packageType: ExportPackageType;
  readonly packageVersion: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly sections: readonly ExportPackageSection[];
  readonly references: readonly ExportPackageReference[];
}

/**
 * Builds the deterministic manifest for a package: a hash for every
 * section, item, and reference, plus which required sections (for this
 * package's type) are missing. The manifest never re-derives a fact -- it
 * only records hashes of facts the builder already assembled.
 */
export class ExportPackageManifestService {
  constructor(private readonly hashService: ExportPackageHashService) {}

  createManifest(ctx: ExportRuntimeContext, input: CreateManifestInput): ExportPackageManifest {
    const sectionHashes = input.sections.map((section) => ({ sectionId: section.id, sectionType: section.type, sectionHash: section.sectionHash }));

    const itemHashes = input.sections
      .flatMap((section) => section.items)
      .map((item) => ({ itemId: item.id, itemType: item.type, sourceModule: item.sourceModule, sourceId: item.sourceId, payloadHash: item.payloadHash }));

    const referenceHashes = input.references.map((reference) => ({
      referenceId: reference.id,
      referenceHash: this.hashService.hashReference({ type: reference.type, fromItemId: reference.fromItemId, toItemId: reference.toItemId, reasonCode: reference.reasonCode }),
    }));

    const sourceModules = Array.from(new Set(input.sections.flatMap((section) => section.items.map((item) => item.sourceModule)))).sort();

    const requiredSections = REQUIRED_SECTIONS_BY_PACKAGE_TYPE[input.packageType];
    const missingRequiredSections = requiredSections.filter((sectionType) => {
      const section = input.sections.find((candidate) => candidate.type === sectionType);
      return section === undefined || section.status === 'not_available';
    });

    const manifestHash = this.hashService.hashManifest({
      packageId: input.packageId,
      packageVersion: input.packageVersion,
      targetType: input.targetType,
      targetId: input.targetId,
      sectionHashes,
      itemHashes,
      referenceHashes,
      requiredSections,
      missingRequiredSections,
    });

    return {
      id: ctx.ids.nextId('export-manifest'),
      packageId: input.packageId,
      packageVersion: input.packageVersion,
      targetType: input.targetType as ExportPackageManifest['targetType'],
      targetId: input.targetId,
      sectionHashes,
      itemHashes,
      referenceHashes,
      sourceModules,
      requiredSections,
      missingRequiredSections,
      createdAt: ctx.clock.now(),
      manifestHash,
    };
  }

  /** Recomputes the manifest hash from its own recorded fields and compares it to the stored value. */
  verifyManifest(manifest: ExportPackageManifest): boolean {
    const recomputed = this.hashService.hashManifest({
      packageId: manifest.packageId,
      packageVersion: manifest.packageVersion,
      targetType: manifest.targetType,
      targetId: manifest.targetId,
      sectionHashes: manifest.sectionHashes,
      itemHashes: manifest.itemHashes,
      referenceHashes: manifest.referenceHashes,
      requiredSections: manifest.requiredSections,
      missingRequiredSections: manifest.missingRequiredSections,
    });
    return recomputed === manifest.manifestHash;
  }
}

export function createExportPackageManifestService(hashService: ExportPackageHashService): ExportPackageManifestService {
  return new ExportPackageManifestService(hashService);
}
