import type { AocPMFreakRemoteGovernanceEndpointError, AocPMFreakRemoteGovernanceEndpointErrorCode } from './aoc-pmfreak-remote-governance-endpoint-types.js';

/**
 * Builds a safe, structured endpoint error. Never throws; always returns a
 * value the caller can inspect, log, or render. Callers must never pass a
 * secret, token, authorization header value, or other sensitive material in
 * `message`/`details` -- every call site in this module passes only fixed,
 * safe copy.
 */
export function createAocPMFreakRemoteGovernanceEndpointError(code: AocPMFreakRemoteGovernanceEndpointErrorCode, message: string, details?: Record<string, unknown>): AocPMFreakRemoteGovernanceEndpointError {
  return {
    code,
    message,
    safe: true,
    ...(details !== undefined ? { details } : {}),
  };
}
