export type {
  CapabilityVerificationContext,
  VerificationResult,
} from './verification/capability-verifier';
export type { DelegationVerificationContext } from './verification/delegation-verifier';

export { verifyCapabilityToken } from './verification/capability-verifier';
export { verifyDelegatedCapability } from './verification/delegation-verifier';
