import { createAocPMFreakRemoteGovernanceEndpointError } from './aoc-pmfreak-remote-governance-errors.js';
import type { AocPMFreakRemoteGovernanceEndpointConfig, AocPMFreakRemoteGovernanceGuardResult } from './aoc-pmfreak-remote-governance-endpoint-types.js';

/**
 * Deterministically estimates a JSON payload's size in characters (its
 * `JSON.stringify` length). This is an approximation of the true UTF-8 byte
 * size, not an exact count -- this module has no `Buffer`/`TextEncoder`
 * dependency, and a character-count estimate is deterministic and safe by
 * construction (it never under-counts multi-byte content, since every
 * multi-byte UTF-8 character is at least one UTF-16 code unit). A value that
 * cannot be serialized (e.g. it contains a circular reference) is treated as
 * unbounded in size, so it fails safe rather than silently passing.
 */
function estimateJsonSizeInCharacters(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 0 : serialized.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Validates the request body's estimated JSON size against
 * `config.maxPayloadSizeKb` (256 KB by default). Pure; never mutates its
 * inputs.
 */
export function validateAocPMFreakRemoteGovernancePayloadSize(body: unknown, config: AocPMFreakRemoteGovernanceEndpointConfig): AocPMFreakRemoteGovernanceGuardResult {
  const estimatedSizeInCharacters = estimateJsonSizeInCharacters(body);
  const maxSizeInCharacters = config.maxPayloadSizeKb * 1024;

  if (estimatedSizeInCharacters > maxSizeInCharacters) {
    return {
      valid: false,
      error: createAocPMFreakRemoteGovernanceEndpointError('payload_too_large', `Request payload exceeds the maximum allowed size of ${config.maxPayloadSizeKb} KB.`, {
        maxPayloadSizeKb: config.maxPayloadSizeKb,
      }),
    };
  }

  return { valid: true };
}
