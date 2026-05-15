export type ApiErrorCode =
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "workspace_required"
  | "workspace_not_found"
  | "resource_not_found"
  | "conflict"
  | "rate_limited"
  | "quota_exceeded"
  | "billing_required"
  | "policy_denied"
  | "capability_denied"
  | "agent_denied"
  | "expired_grant"
  | "revoked_grant"
  | "upstream_unavailable"
  | "database_unavailable"
  | "internal_error";

export const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  validation_error: "We couldn’t process that request.",
  unauthorized: "You need to sign in to continue.",
  forbidden: "You do not have permission to perform this action.",
  workspace_required: "Workspace context is required to continue.",
  workspace_not_found: "The workspace could not be found or accessed.",
  resource_not_found: "The requested resource could not be found.",
  conflict: "This request conflicts with current resource state.",
  rate_limited: "Too many requests. Please wait and try again.",
  quota_exceeded: "Usage quota exceeded for this workspace.",
  billing_required: "This action requires an active billing plan.",
  policy_denied: "This action was blocked by a workspace policy.",
  capability_denied: "This capability request cannot be approved.",
  agent_denied: "This AI agent does not have scope for this action.",
  expired_grant: "This access grant expired. Request access again.",
  revoked_grant: "This access grant was revoked.",
  upstream_unavailable: "A required upstream service is currently unavailable.",
  database_unavailable: "We’re temporarily unable to access data storage.",
  internal_error: "Unexpected internal error. Please try again.",
};
