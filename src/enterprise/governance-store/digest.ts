import { createHash } from 'node:crypto';

import { AOC_CANONICALIZATION_VERSION, canonicalSerialize } from './canonical-json.js';

/**
 * SHA-256 digests over canonical serialization — the Governance Store's one
 * digest primitive. This is an *integrity* mechanism (detects that stored
 * bytes changed after commit), not a signature, not non-repudiation, and not
 * tamper-proof against a privileged writer who can rewrite both a record and
 * its digest. See `docs/enterprise/AOC_ENTERPRISE_GOVERNANCE_STORE.md`,
 * "Integrity model and its limits".
 */

export const GOVERNANCE_DIGEST_ALGORITHM = 'sha256' as const;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Computes `sha256:<hex>` over the canonical serialization of `value`.
 * `canonicalizationVersion` exists so a future canonical-json.v2 can coexist;
 * v1 is the only supported version today and anything else is rejected
 * rather than silently producing an incomparable digest.
 */
export function computeDigest(value: unknown, canonicalizationVersion: string = AOC_CANONICALIZATION_VERSION): string {
  if (canonicalizationVersion !== AOC_CANONICALIZATION_VERSION) {
    throw new Error(`Unsupported canonicalization version '${canonicalizationVersion}'; this Governance Store supports only '${AOC_CANONICALIZATION_VERSION}'.`);
  }
  const serialized = canonicalSerialize(value);
  const hex = createHash('sha256').update(serialized, 'utf8').digest('hex');
  return `${GOVERNANCE_DIGEST_ALGORITHM}:${hex}`;
}

/** True when `value` is a well-formed `sha256:<hex>` digest string. */
export function isWellFormedDigest(value: string): boolean {
  return DIGEST_PATTERN.test(value);
}
