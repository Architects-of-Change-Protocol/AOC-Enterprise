import { createHash } from 'crypto';

export interface AuthorityProof {
  readonly id: string;

  readonly requestId: string;
  readonly authorityDecisionId: string;
  readonly trustDomainId: string;

  readonly actorId: string;
  readonly principalActorId?: string;

  readonly chainHash: string;

  readonly evaluatedGrantIds: readonly string[];
  readonly evaluatedDelegationIds: readonly string[];

  readonly decisionType: string;
  readonly valid: boolean;

  readonly previousHash?: string;
  readonly proofHash: string;

  readonly createdAt: string;
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
