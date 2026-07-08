import type { ExportPackageSectionType } from './export-package-section.js';

export type ExportPackageIntegrityStatus = 'passed' | 'failed' | 'warning';

export type ExportPackageIntegrityIssueSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ExportPackageIntegrityIssue {
  readonly id: string;

  readonly severity: ExportPackageIntegrityIssueSeverity;

  readonly reasonCode: string;
  readonly reason: string;

  readonly sectionId?: string;
  readonly itemId?: string;
  readonly referenceId?: string;
  readonly sourceModule?: string;
  readonly sourceId?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ExportPackageIntegrityReport {
  readonly id: string;

  readonly packageId: string;

  readonly status: ExportPackageIntegrityStatus;

  readonly sectionCount: number;
  readonly itemCount: number;
  readonly referenceCount: number;

  readonly verifiedSectionHashes: number;
  readonly verifiedItemHashes: number;
  readonly verifiedReferenceHashes: number;

  readonly missingRequiredSections: readonly ExportPackageSectionType[];
  readonly missingReferenceIds: readonly string[];

  readonly issues: readonly ExportPackageIntegrityIssue[];

  readonly createdAt: string;

  readonly integrityHash: string;
}
