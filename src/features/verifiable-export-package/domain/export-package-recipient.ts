export type ExportPackageRecipientType =
  | 'internal_operator'
  | 'customer'
  | 'auditor'
  | 'legal_reviewer'
  | 'compliance_officer'
  | 'investor'
  | 'partner'
  | 'demo_viewer';

export type ExportPackageRecipientPurpose =
  | 'internal_review'
  | 'customer_review'
  | 'audit'
  | 'legal_review'
  | 'compliance_review'
  | 'investor_demo'
  | 'enterprise_demo'
  | 'incident_review';

export interface ExportPackageRecipient {
  readonly type: ExportPackageRecipientType;

  readonly name?: string;
  readonly organization?: string;

  readonly purpose: ExportPackageRecipientPurpose;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
