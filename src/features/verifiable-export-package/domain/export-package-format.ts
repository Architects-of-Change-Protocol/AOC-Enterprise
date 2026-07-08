export type ExportPackageFormat = 'json_bundle' | 'markdown_summary' | 'audit_bundle_fragment' | 'verification_manifest' | 'integrity_report';

export interface SerializedExportPackage {
  readonly id: string;

  readonly packageId: string;

  readonly format: ExportPackageFormat;

  readonly title: string;

  readonly content: string;

  readonly contentHash: string;

  readonly createdAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
