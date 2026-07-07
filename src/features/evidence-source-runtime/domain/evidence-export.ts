import type { CitationTargetType } from './citation.js';

export type EvidenceExportArtifactType = 'json_summary' | 'markdown_summary' | 'citation_trail' | 'evidence_trace' | 'audit_bundle_fragment';

/** A generated, string-only export artifact. This runtime never writes to the filesystem -- callers decide what to do with `content`. */
export interface EvidenceExportArtifact {
  readonly id: string;
  readonly type: EvidenceExportArtifactType;
  readonly title: string;
  readonly content: string;
  readonly targetType?: CitationTargetType;
  readonly targetId?: string;
  readonly evidenceProofId?: string;
  readonly createdAt: string;
}
