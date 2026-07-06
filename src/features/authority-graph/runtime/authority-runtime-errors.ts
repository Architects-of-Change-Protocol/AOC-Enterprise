export class AuthorityGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AuthorityGrantNotFoundError extends AuthorityGraphError {
  constructor(authorityGrantId: string) {
    super(`Authority grant not found: ${authorityGrantId}`);
  }
}

export class DelegationGrantNotFoundError extends AuthorityGraphError {
  constructor(delegationGrantId: string) {
    super(`Delegation grant not found: ${delegationGrantId}`);
  }
}

export class RoleAssignmentNotFoundError extends AuthorityGraphError {
  constructor(roleAssignmentId: string) {
    super(`Role assignment not found: ${roleAssignmentId}`);
  }
}

export class SourceAuthorityNotFoundError extends AuthorityGraphError {
  constructor(sourceAuthorityGrantId: string) {
    super(`Source authority (grant or delegation) not found: ${sourceAuthorityGrantId}`);
  }
}

export class IssuerNotAuthorizedError extends AuthorityGraphError {
  constructor(reason: string) {
    super(`Issuer not authorized: ${reason}`);
  }
}

export class SelfIssuanceNotPermittedError extends AuthorityGraphError {
  constructor(reason: string) {
    super(`Self-issuance not permitted: ${reason}`);
  }
}

export class DelegationNotPermittedError extends AuthorityGraphError {
  constructor(reason: string) {
    super(`Delegation not permitted: ${reason}`);
  }
}

export class NonDelegableActionError extends AuthorityGraphError {
  constructor(action: string) {
    super(`Action is not delegable: ${action}`);
  }
}

export class DelegationScopeExpansionError extends AuthorityGraphError {
  constructor(reason: string) {
    super(`Delegation scope expansion detected: ${reason}`);
  }
}

export class DelegationDepthExceededError extends AuthorityGraphError {
  constructor(reason: string) {
    super(`Delegation depth exceeded: ${reason}`);
  }
}
