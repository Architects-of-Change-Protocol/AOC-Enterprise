// Existing contracts — preserved for backward compatibility
export type * from './contracts.js';

// Enrollment
export type * from './enrollment/enrollment-contracts.js';

// Constitution
export type * from './constitution/constitution-contracts.js';
export { createAgentConstitution } from './constitution/constitution.js';

// Policy Manifest
export type * from './policy-manifest/manifest-contracts.js';
export { createAgentPolicyManifest } from './policy-manifest/policy-manifest.js';

// Crypto / Hashing
export { canonicalizeJson, sha256Hex, createHashUrn } from './crypto/canonical-json.js';

// Signing
export type * from './signing/signer-port.js';

// Passport ID
export type { AgentPassportId, GenerateAgentPassportIdOptions } from './passport/passport-id.js';
export { generateAgentPassportId, isValidAgentPassportId } from './passport/passport-id.js';

// Passport Status
export type { AgentPassportStatus } from './passport/passport-status.js';
export {
  canTransitionAgentPassportStatus,
  transitionAgentPassportStatus,
} from './passport/passport-status.js';

// Governance Level
export type { AgentGovernanceLevel } from './passport/governance-level.js';

// Passport Contracts
export type * from './passport/passport-contracts.js';

// Passport Issuance
export type { IssueAgentPassportDeps } from './passport/passport-issuance.js';
export {
  issueAgentPassport,
  createAgentPassportVerificationUrl,
  createAgentPassportQrPayload,
  createAgentPassportPublicVerificationPayload,
} from './passport/passport-issuance.js';

// Passport Verification
export type { VerifyAgentPassportDeps } from './passport/passport-verification.js';
export { verifyAgentPassport } from './passport/passport-verification.js';

// Runtime Seal
export type * from './runtime-seal/runtime-seal-contracts.js';
export type {
  CreateAgentRuntimeSealDeps,
  VerifyAgentRuntimeSealDeps,
  VerifyAgentRuntimeSealOptions,
} from './runtime-seal/runtime-seal.js';
export { createAgentRuntimeSeal, verifyAgentRuntimeSeal } from './runtime-seal/runtime-seal.js';

// Events
export type * from './events/passport-events.js';
export { createPassportEvent } from './events/passport-events.js';

// Store
export type * from './store/store-port.js';
export { createInMemoryAgentPassportStore } from './store/store-port.js';

// Runtime Guard Lite
export type * from './runtime-guard/runtime-action.js';
export type * from './runtime-guard/runtime-decision.js';
export type * from './runtime-guard/runtime-context.js';
export type * from './runtime-guard/runtime-guard-events.js';
export type * from './runtime-guard/runtime-guard-contracts.js';
export { createRuntimeGuardEvent } from './runtime-guard/runtime-guard-events.js';
export { createHumanApprovalRequest } from './runtime-guard/runtime-guard-contracts.js';
export type { EvaluateAgentRuntimeGuardDeps } from './runtime-guard/runtime-guard.js';
export {
  evaluateAgentRuntimeGuard,
  enforceAgentRuntimeGuard,
} from './runtime-guard/runtime-guard.js';

// Test utilities — for use in tests; not for production use
export type { TestSignerOptions } from './signing/test-signer.js';
export { createTestSigner } from './signing/test-signer.js';
