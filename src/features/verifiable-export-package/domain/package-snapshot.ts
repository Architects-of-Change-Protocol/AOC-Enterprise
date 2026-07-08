import type { ExportPackageSectionStatus, ExportPackageSectionType } from './export-package-section.js';
import type { ExportPackageTargetType } from './export-package.js';
import type { ExportPackageVerificationStatus } from './export-package-verification.js';

export interface PackageSnapshotSectionSummary {
  readonly sectionType: ExportPackageSectionType;
  readonly status: ExportPackageSectionStatus;
  readonly itemCount: number;
  readonly sectionHash: string;
}

export interface PackageSnapshot {
  readonly id: string;

  readonly packageId: string;

  readonly targetType: ExportPackageTargetType;
  readonly targetId: string;

  readonly sections: readonly PackageSnapshotSectionSummary[];

  readonly manifestHash?: string;
  readonly packageHash?: string;
  readonly verificationStatus?: ExportPackageVerificationStatus;

  readonly createdAt: string;
}
