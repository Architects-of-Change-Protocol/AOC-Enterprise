export const BOUNDARY_REASON_CODES = {
  ORG_BOUNDARY_VIOLATED: 'org_boundary_violated',
  SCOPE_NOT_ALLOWED: 'scope_not_allowed',
  NAMESPACE_MISMATCH: 'namespace_mismatch',
  TENANT_BOUNDARY_VIOLATED: 'tenant_boundary_violated',
  WORKSPACE_ACCESS_DENIED: 'workspace_access_denied',
  PROJECT_ACCESS_DENIED: 'project_access_denied',
  ISOLATION_POLICY_DENIED: 'isolation_policy_denied',
} as const;

export type BoundaryReasonCode = typeof BOUNDARY_REASON_CODES[keyof typeof BOUNDARY_REASON_CODES];
