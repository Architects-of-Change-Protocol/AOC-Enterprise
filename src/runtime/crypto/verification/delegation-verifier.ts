import type { CapabilityToken } from '@aoc/protocol/contracts';

export interface DelegationVerificationContext {
  trustDomain: string;
  revokedJti: Set<string>;
  nowIso: string;
}

export function verifyDelegatedCapability(token: CapabilityToken, ctx: DelegationVerificationContext): { valid: boolean; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  const payload = token as unknown as Record<string, unknown>;
  if (typeof payload.jti === 'string' && ctx.revokedJti.has(payload.jti)) reasonCodes.push('token_revoked');
  if (typeof payload.trust_domain === 'string' && payload.trust_domain !== ctx.trustDomain) reasonCodes.push('trust_domain_mismatch');
  if (typeof payload.exp === 'number' && Date.parse(ctx.nowIso) / 1000 > payload.exp) reasonCodes.push('token_expired');
  return { valid: reasonCodes.length === 0, reasonCodes };
}
