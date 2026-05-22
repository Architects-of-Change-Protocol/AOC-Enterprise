export type {
  CapabilityVerificationContext,
  VerificationResult,
} from './verification/capability-verifier.js';
export type { DelegationVerificationContext } from './verification/delegation-verifier.js';

export { verifyCapabilityToken } from './verification/capability-verifier.js';
export { verifyDelegatedCapability } from './verification/delegation-verifier.js';
