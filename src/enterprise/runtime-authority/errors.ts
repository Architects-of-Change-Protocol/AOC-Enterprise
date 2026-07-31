export type RuntimeAuthorityErrorCode =
  | 'RUNTIME_AUTHORITY_VALIDATION_ERROR'
  | 'RUNTIME_AUTHORITY_AGENT_NOT_FOUND'
  | 'RUNTIME_AUTHORITY_AGENT_ALREADY_EXISTS'
  | 'RUNTIME_AUTHORITY_RUNTIME_NOT_FOUND'
  | 'RUNTIME_AUTHORITY_INVALID_STATE_TRANSITION'
  | 'RUNTIME_AUTHORITY_GRANT_NOT_FOUND'
  | 'RUNTIME_AUTHORITY_LEASE_NOT_FOUND'
  | 'RUNTIME_AUTHORITY_LEASE_ISSUANCE_DENIED'
  | 'RUNTIME_AUTHORITY_TENANT_SCOPE_REQUIRED'
  | 'RUNTIME_AUTHORITY_ACCESS_SCOPE_VIOLATION'
  | 'RUNTIME_AUTHORITY_OPERATOR_UNAUTHORIZED'
  | 'RUNTIME_AUTHORITY_STORE_UNAVAILABLE';

export class RuntimeAuthorityError extends Error {
  constructor(
    readonly code: RuntimeAuthorityErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'RuntimeAuthorityError';
  }
}

export function isRuntimeAuthorityError(error: unknown): error is RuntimeAuthorityError {
  return error instanceof RuntimeAuthorityError;
}
