import { createHash } from 'crypto';

export interface EnforcementProof {
  readonly id: string;

  readonly enforcementRequestId: string;
  readonly enforcementDecisionId: string;
  readonly executionResultId?: string;

  readonly trustDomainId: string;
  readonly actorId: string;
  readonly principalActorId?: string;

  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;

  readonly allowedToExecute: boolean;
  readonly executed: boolean;

  readonly recognitionDecisionId?: string;
  readonly authorityProofId?: string;
  readonly approvalProofId?: string;
  readonly handshakeProofId?: string;

  /** Policy pack references, present only when a policy pack integration actually evaluated this request -- see EnforcementDecision.policyDecisionId. */
  readonly policyDecisionId?: string;
  readonly policyProofId?: string;
  readonly policyPackVersionIds?: readonly string[];
  readonly policyMatchedRuleIds?: readonly string[];

  readonly sideEffectIds: readonly string[];

  readonly idempotencyKey?: string;

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
