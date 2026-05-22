import type { CapabilityVerificationContext, VerificationResult } from './capability-verifier.js';
import { verifyCapabilityToken } from './capability-verifier.js';
import type { CapabilityToken } from '@aoc/protocol';

export type DelegationVerificationContext = CapabilityVerificationContext;

export function verifyDelegatedCapability(token: CapabilityToken, ctx: DelegationVerificationContext): VerificationResult {
  return verifyCapabilityToken(token, ctx);
}
