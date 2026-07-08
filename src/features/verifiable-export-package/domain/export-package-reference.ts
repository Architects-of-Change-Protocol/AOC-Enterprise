export type ExportPackageReferenceType =
  | 'supports'
  | 'derived_from'
  | 'verifies'
  | 'includes'
  | 'requires'
  | 'satisfies'
  | 'blocks'
  | 'allows'
  | 'warns'
  | 'approves'
  | 'recognizes'
  | 'authorizes'
  | 'delegates'
  | 'cites'
  | 'hashes'
  | 'links_to';

export interface ExportPackageReference {
  readonly id: string;

  readonly type: ExportPackageReferenceType;

  readonly fromItemId: string;
  readonly toItemId: string;

  readonly fromSourceId?: string;
  readonly toSourceId?: string;

  readonly reasonCode: string;
  readonly reason: string;

  readonly createdAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
