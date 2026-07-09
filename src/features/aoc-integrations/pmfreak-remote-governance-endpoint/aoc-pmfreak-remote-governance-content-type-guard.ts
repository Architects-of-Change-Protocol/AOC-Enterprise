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

/** Strips a `; charset=...`/`; boundary=...` suffix and normalizes case, so `application/json; charset=utf-8` matches `application/json`. */
function baseMediaType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
}

/**
 * Validates the `content-type` header against `config.allowedContentTypes`
 * (`["application/json"]` by default). Pure and case-insensitive; never
 * mutates its inputs.
 */
export function validateAocPMFreakRemoteGovernanceContentType(headers: Record<string, string | undefined>, config: AocPMFreakRemoteGovernanceEndpointConfig): AocPMFreakRemoteGovernanceGuardResult {
  const contentTypeHeader = findHeaderValue(headers, 'content-type');
  const normalizedAllowed = config.allowedContentTypes.map((allowed) => allowed.toLowerCase());

  if (contentTypeHeader === undefined || !normalizedAllowed.includes(baseMediaType(contentTypeHeader))) {
    return {
      valid: false,
      error: createAocPMFreakRemoteGovernanceEndpointError(
        'unsupported_content_type',
        `Content-Type "${contentTypeHeader ?? '(missing)'}" is not supported; this endpoint only accepts ${config.allowedContentTypes.join(', ')}.`,
        { contentType: contentTypeHeader ?? null, allowedContentTypes: [...config.allowedContentTypes] },
      ),
    };
  }

  return { valid: true };
}
