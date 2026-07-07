export type CitationTargetType =
  | 'recognition_decision'
  | 'authority_proof'
  | 'approval_request'
  | 'approval_decision'
  | 'approval_proof'
  | 'external_handshake'
  | 'policy_pack'
  | 'policy_pack_version'
  | 'policy_rule'
  | 'policy_decision'
  | 'policy_proof'
  | 'enforcement_request'
  | 'enforcement_decision'
  | 'enforcement_proof'
  | 'execution_result'
  | 'control_plane_snapshot'
  | 'demo_scenario'
  | 'export_package';

/** Links a source document and/or evidence artifact to a decision or proof produced by another AOC runtime. */
export interface Citation {
  readonly id: string;
  readonly sourceDocumentId?: string;
  readonly evidenceArtifactId?: string;
  readonly targetType: CitationTargetType;
  readonly targetId: string;
  readonly anchorId?: string;
  readonly citationText: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly createdByActorId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
