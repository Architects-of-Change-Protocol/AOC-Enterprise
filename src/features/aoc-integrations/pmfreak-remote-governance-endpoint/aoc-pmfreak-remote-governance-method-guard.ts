import { createAocPMFreakRemoteGovernanceEndpointError } from './aoc-pmfreak-remote-governance-errors.js';
import type { AocPMFreakRemoteGovernanceEndpointConfig, AocPMFreakRemoteGovernanceGuardResult } from './aoc-pmfreak-remote-governance-endpoint-types.js';

/**
 * Validates the HTTP method against `config.allowedMethods` (`["POST"]` by
 * default). Pure and case-insensitive; never mutates its inputs.
 */
export function validateAocPMFreakRemoteGovernanceMethod(method: string, config: AocPMFreakRemoteGovernanceEndpointConfig): AocPMFreakRemoteGovernanceGuardResult {
  const normalizedMethod = method.toUpperCase();
  const allowed = config.allowedMethods.some((allowedMethod) => allowedMethod.toUpperCase() === normalizedMethod);

  if (!allowed) {
    return {
      valid: false,
      error: createAocPMFreakRemoteGovernanceEndpointError('invalid_method', `Method "${method}" is not allowed; this endpoint only accepts ${config.allowedMethods.join(', ')}.`, {
        method,
        allowedMethods: [...config.allowedMethods],
      }),
    };
  }

  return { valid: true };
}
