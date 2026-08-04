import type { CapabilityToken } from '@aoc/protocol';

export interface CapabilityVerificationContext {
  /**
   * NOT CURRENTLY ENFORCED. The real @aoc/protocol `CapabilityToken` carries no
   * trust-domain-bearing claim (no `trust_domain`, and `issuer`/`resource.tenantId`
   * are not proven equivalents), so this function cannot positively verify it
   * without inventing a semantic mapping. Per the fail-closed policy for
   * unverifiable checks, this parameter is retained only to avoid a breaking
   * signature change; it is intentionally unused below. See CHANGELOG (SECURITY)
   * and the R004.A PR description for the open gap and the decision this blocks.
   */
  trustDomain: string;
  revokedJti: Set<string>;
  nowIso: string;
}

export interface VerificationResult {
  valid: boolean;
  reasonCodes: string[];
}

const KNOWN_PROOF_TYPES = new Set(['jwt', 'mTLS', 'detached-signature', 'custom']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Validates a CapabilityToken against the real @aoc/protocol contract fields
 * (tokenId, expiresAt, revocationRefs, proof) -- see dist/contracts/index.d.ts
 * in vendor/aoc-protocol-0.1.0.tgz. Default posture is deny -- every input
 * this function cannot positively verify returns invalid, never valid.
 */
export function verifyCapabilityToken(token: CapabilityToken, ctx: CapabilityVerificationContext): VerificationResult {
  const reasonCodes: string[] = [];

  if (!isRecord(token)) {
    return { valid: false, reasonCodes: ['token_malformed'] };
  }

  if (typeof token.tokenId !== 'string' || token.tokenId.length === 0) {
    reasonCodes.push('token_malformed');
  } else if (ctx.revokedJti.has(token.tokenId)) {
    reasonCodes.push('token_revoked');
  }

  // revocationRefs point at an out-of-band revocation source (the protocol's
  // RevocationLookup port), which Enterprise does not wire up anywhere. Refs
  // this function cannot resolve are indeterminate, not clear -- fail closed.
  if (Array.isArray(token.revocationRefs) && token.revocationRefs.length > 0) {
    const hasUnresolvedRef = token.revocationRefs.some(
      (ref) => typeof ref !== 'string' || !ctx.revokedJti.has(ref),
    );
    if (hasUnresolvedRef) reasonCodes.push('revocation_status_indeterminate');
  }

  const nowMs = Date.parse(ctx.nowIso);
  const expiresAtMs = typeof token.expiresAt === 'string' ? Date.parse(token.expiresAt) : Number.NaN;
  if (Number.isNaN(nowMs) || Number.isNaN(expiresAtMs)) {
    reasonCodes.push('token_malformed');
  } else if (nowMs >= expiresAtMs) {
    reasonCodes.push('token_expired');
  }

  // No cryptographic signature bytes or verification key exist on this
  // contract (ProofMetadata is proofType/proofRef/issuedAt only), so this can
  // only check proof *shape*, not cryptographic integrity -- see the open gap
  // recorded in the R004.A PR description.
  const proof = token.proof;
  if (!isRecord(proof) || typeof proof.proofType !== 'string' || !KNOWN_PROOF_TYPES.has(proof.proofType)) {
    reasonCodes.push('token_malformed');
  } else if (proof.proofType !== 'custom' && (typeof proof.proofRef !== 'string' || proof.proofRef.length === 0)) {
    reasonCodes.push('proof_unverifiable');
  }

  return { valid: reasonCodes.length === 0, reasonCodes };
}
