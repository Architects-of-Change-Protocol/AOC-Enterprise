import type { ExportPackageSectionType } from './export-package-section.js';
import type { ExportPackageItemType } from './export-package-item.js';
import type { ExportPackageTargetType } from './export-package.js';

export interface ExportPackageManifestSectionHash {
  readonly sectionId: string;
  readonly sectionType: ExportPackageSectionType;
  readonly sectionHash: string;
}

export interface ExportPackageManifestItemHash {
  readonly itemId: string;
  readonly itemType: ExportPackageItemType;
  readonly sourceModule: string;
  readonly sourceId: string;
  readonly payloadHash: string;
}

export interface ExportPackageManifestReferenceHash {
  readonly referenceId: string;
  readonly referenceHash: string;
}

export interface ExportPackageManifest {
  readonly id: string;

  readonly packageId: string;

  readonly packageVersion: string;

  readonly targetType: ExportPackageTargetType;
  readonly targetId: string;

  readonly sectionHashes: readonly ExportPackageManifestSectionHash[];

  readonly itemHashes: readonly ExportPackageManifestItemHash[];

  readonly referenceHashes: readonly ExportPackageManifestReferenceHash[];

  readonly sourceModules: readonly string[];

  readonly requiredSections: readonly ExportPackageSectionType[];
  readonly missingRequiredSections: readonly ExportPackageSectionType[];

  readonly createdAt: string;

  readonly manifestHash: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
