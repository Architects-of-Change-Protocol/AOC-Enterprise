/** Error surface of the Soberanía Enterprise Host SDK. Purely transport-level -- no governance semantics. */

/** A non-2xx response carrying the Host's error envelope (or a raw body for the frozen non-enveloped responses). */
export class EnterpriseHostApiError extends Error {
  override readonly name = 'EnterpriseHostApiError';
  /** HTTP status code returned by the Host. */
  readonly status: number;
  /** Stable machine-readable error code from the envelope (e.g. `INVALID_REQUEST`, `AUTHENTICATION_FAILED`), or `UNKNOWN` for non-enveloped bodies. */
  readonly code: string;
  /** Optional structured validation details from the envelope. */
  readonly details: readonly string[] | undefined;
  /** The parsed response body, verbatim. */
  readonly body: unknown;

  constructor(status: number, code: string, message: string, body: unknown, details?: readonly string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
    this.details = details;
  }
}

/** The configured `timeoutMs` elapsed before the Host responded. Safe to retry only for reads and idempotent writes (see README, "Retries"). */
export class EnterpriseHostTimeoutError extends Error {
  override readonly name = 'EnterpriseHostTimeoutError';
  readonly timeoutMs: number;

  constructor(timeoutMs: number, route: string) {
    super(`Request to '${route}' timed out after ${timeoutMs}ms.`);
    this.timeoutMs = timeoutMs;
  }
}

/** The request never produced an HTTP response (connection refused, DNS failure, reset). */
export class EnterpriseHostNetworkError extends Error {
  override readonly name = 'EnterpriseHostNetworkError';
  override readonly cause: unknown;

  constructor(route: string, cause: unknown) {
    super(`Request to '${route}' failed before receiving a response.`);
    this.cause = cause;
  }
}

export function isEnterpriseHostApiError(error: unknown): error is EnterpriseHostApiError {
  return error instanceof EnterpriseHostApiError;
}
