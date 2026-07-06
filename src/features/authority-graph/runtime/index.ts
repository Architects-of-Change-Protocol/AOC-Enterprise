export { AuthorityGraphRuntime, createAuthorityGraphRuntime } from './authority-graph-runtime.js';
export type { BuildAuthorityChainRequestInput } from './authority-graph-runtime.js';

export {
  createManualAuthorityClock,
  createSequentialAuthorityIdGenerator,
  createAuthorityRuntimeContext,
} from './authority-runtime-context.js';
export type {
  AuthorityRuntimeClock,
  AuthorityRuntimeIdGenerator,
  AuthorityRuntimeContext,
  ManualAuthorityRuntimeClock,
} from './authority-runtime-context.js';

export {
  AuthorityGraphError,
  AuthorityGrantNotFoundError,
  DelegationGrantNotFoundError,
  RoleAssignmentNotFoundError,
  SourceAuthorityNotFoundError,
  IssuerNotAuthorizedError,
  SelfIssuanceNotPermittedError,
  DelegationNotPermittedError,
  NonDelegableActionError,
  DelegationScopeExpansionError,
  DelegationDepthExceededError,
} from './authority-runtime-errors.js';
