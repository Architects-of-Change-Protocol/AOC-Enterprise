/**
 * The Access Governance Runtime's error taxonomy (durable AccessGrant /
 * GrantRevocation lifecycle, Slice 1 of Sovereign Execution Binding),
 * parallel in shape to `AgentPassportErrorCode`/`GovernanceStoreErrorCode`.
 * Every failure this module surfaces is one of these codes; raw
 * driver/internal errors never escape it.
 */
export type AccessGovernanceErrorCode =
  | 'ACCESS_GRANT_NOT_FOUND'
  | 'ACCESS_GRANT_ALREADY_EXISTS'
  | 'ACCESS_GRANT_NOT_ACTIVE'
  | 'ACCESS_GRANT_VALIDATION_ERROR'
  | 'ACCESS_GRANT_INVALID_TIMESTAMP'
  | 'ACCESS_GRANT_TENANT_SCOPE_REQUIRED'
  | 'ACCESS_GRANT_ACCESS_SCOPE_VIOLATION'
  | 'ACCESS_GRANT_STORE_UNAVAILABLE'
  | 'ACCESS_GRANT_AUTHENTICATION_FAILED'
  | 'ACCESS_GRANT_AUTHORIZATION_FAILED'
  | 'ACCESS_GRANT_PROVIDER_UNSUPPORTED';

export class AccessGovernanceError extends Error {
  constructor(
    readonly code: AccessGovernanceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'AccessGovernanceError';
  }
}

export function isAccessGovernanceError(error: unknown): error is AccessGovernanceError {
  return error instanceof AccessGovernanceError;
}
