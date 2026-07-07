import type { ExportPackageReference } from './export-package-reference.js';

export type ExportPackageItemType =
  | 'recognition_decision'
  | 'recognition_proof'
  | 'authority_grant'
  | 'authority_delegation'
  | 'authority_proof'
  | 'approval_request'
  | 'approval_decision'
  | 'approval_proof'
  | 'external_handshake'
  | 'external_agent_visa'
  | 'external_standing_proof'
  | 'policy_pack'
  | 'policy_pack_version'
  | 'policy_rule'
  | 'policy_decision'
  | 'policy_proof'
  | 'policy_event'
  | 'source_document'
  | 'evidence_artifact'
  | 'evidence_requirement'
  | 'evidence_satisfaction'
  | 'evidence_review'
  | 'citation'
  | 'evidence_link'
  | 'evidence_proof'
  | 'evidence_event'
  | 'enforcement_request'
  | 'enforcement_decision'
  | 'enforcement_proof'
  | 'execution_result'
  | 'side_effect_result'
  | 'enforcement_event'
  | 'control_plane_snapshot'
  | 'demo_scenario'
  | 'demo_run'
  | 'demo_export_artifact'
  | 'summary_text'
  | 'integrity_report'
  | 'verification_result';

export type ExportPackageItemSourceModule =
  | 'recognition_runtime'
  | 'authority_graph'
  | 'approval_runtime'
  | 'external_agent_handshake'
  | 'action_enforcement'
  | 'domain_policy_pack_runtime'
  | 'evidence_source_runtime'
  | 'aoc_control_plane'
  | 'aoc_enterprise_demo'
  | 'verifiable_export_package';

export interface ExportPackageItem {
  readonly id: string;

  readonly type: ExportPackageItemType;

  readonly sourceModule: ExportPackageItemSourceModule;

  readonly sourceId: string;

  readonly title: string;
  readonly summary: string;

  readonly payload: Readonly<Record<string, unknown>>;

  readonly payloadHash: string;

  readonly references: readonly ExportPackageReference[];

  readonly createdAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
