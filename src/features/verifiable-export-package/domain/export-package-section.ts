import type { ExportPackageItem } from './export-package-item.js';

export type ExportPackageSectionType =
  | 'summary'
  | 'recognition'
  | 'authority'
  | 'approval'
  | 'external_standing'
  | 'policy'
  | 'evidence'
  | 'citations'
  | 'enforcement'
  | 'execution'
  | 'events'
  | 'control_plane'
  | 'enterprise_demo'
  | 'manifest'
  | 'verification';

export type ExportPackageSectionStatus = 'included' | 'not_available' | 'incomplete' | 'failed_verification';

export interface ExportPackageSection {
  readonly id: string;

  readonly type: ExportPackageSectionType;

  readonly title: string;
  readonly description: string;

  readonly status: ExportPackageSectionStatus;

  readonly items: readonly ExportPackageItem[];

  readonly itemCount: number;

  readonly sectionHash: string;

  readonly required: boolean;

  readonly missingReferenceIds: readonly string[];

  readonly createdAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
