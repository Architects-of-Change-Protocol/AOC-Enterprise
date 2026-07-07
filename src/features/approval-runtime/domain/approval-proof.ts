import { createHash } from 'crypto';

import type { ApprovalProofStatus } from './approval-status.js';

export type { ApprovalProofStatus } from './approval-status.js';

export interface ApprovalProof {
  readonly id: string;

  readonly approvalRequestId: string;
  readonly approvalDecisionId: string;

  readonly trustDomainId: string;

  readonly actionRequestId: string;

  readonly requestedByActorId: string;
  readonly approverActorId: string;
  readonly principalActorId?: string;

  readonly action: string;
  readonly resourceScope: string;

  readonly approved: boolean;

  readonly status: ApprovalProofStatus;

  readonly evidenceHashes: readonly string[];

  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;

  readonly previousHash?: string;
  readonly proofHash: string;

  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
  readonly revokedByActorId?: string;
  readonly revocationReason?: string;
}

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
