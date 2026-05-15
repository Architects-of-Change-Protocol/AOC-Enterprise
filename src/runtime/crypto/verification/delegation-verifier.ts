import type { CapabilityVerificationContext, VerificationResult } from './capability-verifier';
import { verifyCapabilityToken } from './capability-verifier';
import type { CapabilityToken } from '@aoc/protocol/contracts';

export type DelegationVerificationContext = CapabilityVerificationContext;

export function verifyDelegatedCapability(token: CapabilityToken, ctx: DelegationVerificationContext): VerificationResult {
  return verifyCapabilityToken(token, ctx);
}
