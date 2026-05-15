import { ApiErrorCode } from "./error-codes";

export function logReliabilityEvent(input: {
  requestId: string;
  route: string;
  errorCode: ApiErrorCode;
  recoverable: boolean;
  userId?: string | null;
  workspaceId?: string | null;
  reason?: string;
}) {
  console.error("[reliability]", {
    timestamp: new Date().toISOString(),
    requestId: input.requestId,
    route: input.route,
    userId: input.userId ?? null,
    workspaceId: input.workspaceId ?? null,
    errorCode: input.errorCode,
    recoverable: input.recoverable,
    reason: input.reason,
  });
}
