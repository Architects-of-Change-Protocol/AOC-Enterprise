export type AocPMFreakConnectorErrorCode =
  | 'invalid_config'
  | 'source_unavailable'
  | 'read_failed'
  | 'mutation_not_allowed'
  | 'unsupported_source_kind'
  | 'redaction_failed'
  | 'unknown_error';

/**
 * A deterministic, safe connector error. `safe` is always `true`: error
 * messages and details must never leak secrets, tokens, authorization
 * headers, connection strings, or private customer data. Constructed with
 * `createAocPMFreakConnectorError`, which returns an instance of
 * `AocPMFreakConnectorRuntimeError` -- an `Error` subclass that also
 * structurally satisfies this interface, so it can be thrown directly and
 * still inspected as data (`error.code`, `error.safe`).
 */
export interface AocPMFreakConnectorError {
  readonly code: AocPMFreakConnectorErrorCode;
  readonly message: string;
  readonly safe: true;
  readonly details?: Record<string, unknown>;
}

export class AocPMFreakConnectorRuntimeError extends Error implements AocPMFreakConnectorError {
  readonly code: AocPMFreakConnectorErrorCode;
  readonly safe = true as const;
  readonly details?: Record<string, unknown>;

  constructor(code: AocPMFreakConnectorErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/**
 * Builds a safe, deterministic connector error. Callers are responsible for
 * only ever passing safe `message`/`details` values -- this helper never
 * inspects or redacts its inputs, so it must never be called with raw
 * secrets, tokens, authorization headers, or connection strings.
 */
export function createAocPMFreakConnectorError(code: AocPMFreakConnectorErrorCode, message: string, details?: Record<string, unknown>): AocPMFreakConnectorError {
  return new AocPMFreakConnectorRuntimeError(code, message, details);
}
