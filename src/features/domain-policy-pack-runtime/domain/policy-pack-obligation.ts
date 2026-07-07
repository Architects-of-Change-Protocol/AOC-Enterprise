export type PolicyObligationType =
  | 'record_event'
  | 'retain_evidence'
  | 'notify_operator'
  | 'require_review'
  | 'create_audit_note'
  | 'attach_source_reference'
  | 'run_dry_run_first'
  | 'manual_verification';

export interface PolicyObligation {
  readonly id: string;
  readonly type: PolicyObligationType;
  readonly description: string;
  readonly required: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
