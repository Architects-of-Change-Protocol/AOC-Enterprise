/**
 * Soberanía Enterprise Agent Passport Runtime v1 (PR-006) -- the governed
 * identity, authority, status, provenance, and evidence-reference record of
 * an agent operating within an organization. See
 * `docs/enterprise/AOC_AGENT_PASSPORT_RUNTIME.md`.
 */

export {
  AOC_AGENT_PASSPORT_RUNTIME_VERSION,
  AGENT_PASSPORT_SCHEMA_VERSION,
  AGENT_PASSPORT_CONTRACT_IDS,
  AGENT_PASSPORT_TERMINAL_STATUSES,
} from './contracts.js';
export type {
  AgentPassportSubjectType,
  AgentPassportSubject,
  AgentPassportOrganizationBinding,
  AgentPassportStatus,
  AgentPassportLifecycle,
  AgentIdentityDescriptor,
  AgentReferenceStatus,
  AgentCapabilityReference,
  AgentAuthorityReference,
  AgentDelegationReference,
  PassportGovernanceReference,
  PassportEvidenceReference,
  AgentPassportProvenance,
  AgentPassportIntegrity,
  AgentPassport,
  AgentPassportEventType,
  AgentPassportEvent,
  AgentPassportClaim,
  AgentPassportHistorySummary,
  AgentPassportViewType,
  AgentPassportViewProvenance,
  AgentPassportViewIntegrity,
  AgentPassportView,
  AgentPassportVerificationMode,
  PassportVerificationFailure,
  AgentPassportVerificationResult,
  PassportAccessContext,
  AppendPassportEventInput,
  AppendPassportEventResult,
  AgentPassportLoadResult,
  AgentPassportStoreHealth,
  PassportIdempotencyContext,
  PassportIdempotencyProbe,
  PassportIdempotencyResolution,
} from './contracts.js';

export { AgentPassportError, isAgentPassportError } from './errors.js';
export type { AgentPassportErrorCode } from './errors.js';

export { applyLifecycleTransition, isLifecycleEventType, isTerminalStatus } from './lifecycle.js';

export { buildPassportEvent, computeEventDigest, eventDigestInput, verifyEventChain } from './events.js';
export type { BuildPassportEventInput, PassportEventDigestInput } from './events.js';

export { computePassportHistorySummary, parseCreatedEventPayload, reconstructAgentPassportFromEvents } from './reconstruction.js';

export { canAccessPassportOrganization, requireAccessToOrganization, requirePassportTenantScope } from './passport-store.js';
export type { AgentPassportStore } from './passport-store.js';

export { createInMemoryPassportStore } from './in-memory-passport-store.js';
export type { CreateInMemoryPassportStoreOptions } from './in-memory-passport-store.js';

export { createSqlitePassportStore } from './sqlite-passport-store.js';
export type { CreateSqlitePassportStoreOptions } from './sqlite-passport-store.js';

export { verifyAgentPassport } from './verification.js';
export type { PassportReferenceCheckers, VerifyAgentPassportInput } from './verification.js';

export { AGENT_PASSPORT_VIEW_TYPES, buildAgentPassportView, isAgentPassportViewType } from './disclosure.js';
export type { BuildPassportViewInput } from './disclosure.js';

export { createAgentPassportService } from './service.js';
export type {
  AgentPassportService,
  AgentPassportServiceDependencies,
  IssueAgentPassportInput,
  IssueAgentPassportResult,
  RetireAgentPassportInput,
  RevokeAgentPassportInput,
  SuspendAgentPassportInput,
} from './service.js';
