import type { ExportPackageTargetType } from './export-package.js';

export type ExportPackageEventType =
  | 'export_package_created'
  | 'export_package_section_created'
  | 'export_package_item_added'
  | 'export_package_reference_created'
  | 'export_package_manifest_created'
  | 'export_package_sealed'
  | 'export_package_verified'
  | 'export_package_verification_failed'
  | 'export_package_serialized'
  | 'audit_bundle_created';

export interface ExportPackageEvent {
  readonly id: string;

  readonly type: ExportPackageEventType;

  readonly packageId?: string;
  readonly sectionId?: string;
  readonly itemId?: string;
  readonly referenceId?: string;
  readonly manifestId?: string;
  readonly verificationId?: string;
  readonly auditBundleId?: string;

  readonly targetType?: ExportPackageTargetType;
  readonly targetId?: string;

  readonly timestamp: string;

  readonly payload: Readonly<Record<string, unknown>>;

  readonly previousHash?: string;
  readonly eventHash: string;
}
