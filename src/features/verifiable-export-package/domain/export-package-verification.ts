import type { ExportPackageIntegrityIssue } from './export-package-integrity.js';

export type ExportPackageVerificationStatus = 'verified' | 'failed' | 'verified_with_warnings';

export interface ExportPackageVerification {
  readonly id: string;

  readonly packageId: string;

  readonly status: ExportPackageVerificationStatus;

  readonly manifestHash: string;
  readonly packageHash: string;

  readonly verifiedManifest: boolean;
  readonly verifiedPackageHash: boolean;
  readonly verifiedSectionHashes: boolean;
  readonly verifiedItemHashes: boolean;
  readonly verifiedReferenceHashes: boolean;

  readonly verifiedAt: string;

  readonly issues: readonly ExportPackageIntegrityIssue[];

  readonly metadata?: Readonly<Record<string, unknown>>;
}
