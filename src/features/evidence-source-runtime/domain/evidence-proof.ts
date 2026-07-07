import { createHash } from 'crypto';
import type { CitationTargetType } from './citation.js';

// Recursively sorts object keys so hashing never depends on insertion order.
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const sorted: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      sorted[key] = sortValue(entryValue);
    }
    return sorted;
  }
  return value;
}

export function createDigest(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

/**
 * A deterministic proof that a set of source documents, evidence artifacts,
 * requirements, satisfactions, reviews, citations and links existed in a
 * specific state at `createdAt`. Each `*Hash` field is a pure function of
 * its own slice of the evidence graph, so an auditor can tell exactly which
 * part changed between two proofs; `proofHash` chains all of them together
 * with `previousHash`, mirroring PolicyPackProof/EnforcementProof/
 * ApprovalProof.
 */
export interface EvidenceProof {
  readonly id: string;
  readonly trustDomainId: string;
  readonly sourceDocumentIds: readonly string[];
  readonly evidenceArtifactIds: readonly string[];
  readonly requirementIds: readonly string[];
  readonly satisfactionIds: readonly string[];
  readonly reviewIds: readonly string[];
  readonly citationIds: readonly string[];
  readonly evidenceLinkIds: readonly string[];
  readonly targetType?: CitationTargetType;
  readonly targetId?: string;
  readonly sourceHash: string;
  readonly evidenceHash: string;
  readonly requirementHash: string;
  readonly satisfactionHash: string;
  readonly reviewHash: string;
  readonly citationHash: string;
  readonly linkHash: string;
  readonly previousHash?: string;
  readonly proofHash: string;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
