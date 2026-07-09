import { AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_AUTH_HEADER_NAME } from './aoc-pmfreak-remote-governance-endpoint-constants.js';
import { createAocPMFreakRemoteGovernanceEndpointError } from './aoc-pmfreak-remote-governance-errors.js';
import type { AocPMFreakRemoteGovernanceEndpointConfig, AocPMFreakRemoteGovernanceGuardResult } from './aoc-pmfreak-remote-governance-endpoint-types.js';

/** Case-insensitive header lookup against a `Record<string, string | undefined>` (real HTTP header casing is not guaranteed). */
function findHeaderValue(headers: Record<string, string | undefined>, headerName: string): string | undefined {
  const normalizedName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalizedName && value !== undefined) return value;
  }
  return undefined;
}

/**
 * Constant-time string comparison: always walks the full length of the
 * longer string rather than returning early on the first mismatch, so
 * comparison time does not leak how many leading characters matched. No
 * `crypto`/`Buffer` dependency -- this module has neither available.
 */
function constantTimeStringsEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let index = 0; index < maxLength; index += 1) {
    const codeA = index < a.length ? a.charCodeAt(index) : 0;
    const codeB = index < b.length ? b.charCodeAt(index) : 0;
    mismatch |= codeA ^ codeB;
  }
  return mismatch === 0;
}

/**
 * Validates request authentication against `config.authMode`:
 *  - `none_demo`   -> allowed outside production; rejected safely in
 *                     production (an endpoint must never silently accept
 *                     unauthenticated requests in production).
 *  - `shared_secret_header` -> requires both a configured header name/secret
 *                     value and a matching request header, compared in
 *                     constant time.
 *  - `unsupported` -> always rejected safely.
 *
 * Never includes the provided or configured secret value in an error
 * message or `details` -- only the header *name* is ever echoed back.
 */
export function validateAocPMFreakRemoteGovernanceAuth(headers: Record<string, string | undefined>, config: AocPMFreakRemoteGovernanceEndpointConfig): AocPMFreakRemoteGovernanceGuardResult {
  if (config.environment === 'production' && config.authMode === 'none_demo') {
    return {
      valid: false,
      error: createAocPMFreakRemoteGovernanceEndpointError('unsafe_production_config', 'authMode "none_demo" is not allowed in production; this endpoint cannot safely evaluate requests in its current configuration.'),
    };
  }

  if (config.authMode === 'none_demo') {
    return { valid: true };
  }

  if (config.authMode === 'unsupported') {
    return {
      valid: false,
      error: createAocPMFreakRemoteGovernanceEndpointError('auth_failed', 'Configured auth mode "unsupported" is rejected safely; no authentication method is available for this request.'),
    };
  }

  const headerName = config.sharedSecretHeaderName ?? AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_AUTH_HEADER_NAME;
  const configuredSecret = config.sharedSecretValue;

  if (configuredSecret === undefined || configuredSecret.length === 0) {
    return {
      valid: false,
      error: createAocPMFreakRemoteGovernanceEndpointError('auth_required', 'Shared secret authentication is configured but no secret value is set for this endpoint.', { headerName }),
    };
  }

  const providedSecret = findHeaderValue(headers, headerName);
  if (providedSecret === undefined || providedSecret.length === 0) {
    return {
      valid: false,
      error: createAocPMFreakRemoteGovernanceEndpointError('auth_required', `Missing required authentication header "${headerName}".`, { headerName }),
    };
  }

  if (!constantTimeStringsEqual(providedSecret, configuredSecret)) {
    return {
      valid: false,
      error: createAocPMFreakRemoteGovernanceEndpointError('auth_failed', 'Authentication failed.', { headerName }),
    };
  }

  return { valid: true };
}
