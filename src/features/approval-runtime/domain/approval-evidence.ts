export type ApprovalEvidenceType =
  | 'draft_action'
  | 'email_draft'
  | 'project_context'
  | 'source_document'
  | 'authority_proof'
  | 'recognition_decision'
  | 'policy_result'
  | 'human_comment'
  | 'system_log'
  | 'external_reference'
  | 'approval_proof';

export interface ApprovalEvidenceRequirement {
  readonly id: string;
  readonly type: ApprovalEvidenceType;
  readonly required: boolean;
  readonly description: string;
}

export interface ApprovalEvidenceArtifact {
  readonly id: string;
  readonly type: ApprovalEvidenceType;
  readonly providedByActorId: string;
  readonly uri?: string;
  readonly hash?: string;
  readonly description?: string;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
