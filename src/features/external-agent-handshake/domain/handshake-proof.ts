import { createHash } from 'crypto';

import type { HandshakeDecisionType } from './handshake-decision.js';

export interface HandshakeProof {
  readonly id: string;

  readonly handshakeRequestId: string;
  readonly handshakeDecisionId: string;

  readonly localTrustDomainId: string;
  readonly externalAgentId: string;

  readonly passportPresentationId: string;
  readonly authorityPresentationId?: string;
  readonly approvalProofId?: string;

  readonly visaId?: string;
  readonly ingressGrantId?: string;

  readonly decisionType: HandshakeDecisionType;

  readonly accepted: boolean;

  readonly evidenceHashes: readonly string[];

  readonly previousHash?: string;
  readonly proofHash: string;

  readonly createdAt: string;
}

// Recursively sorts object keys so hashing never depends on insertion order. Mirrors
// approval-runtime/domain/approval-proof.ts so both features hash deterministically the same way.
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
