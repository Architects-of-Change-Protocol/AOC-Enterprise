import type { AocPMFreakGovernanceIntakeError, AocPMFreakGovernanceIntakeErrorCode } from './aoc-pmfreak-governance-intake-types.js';

/** Builds a safe, structured intake error. Never throws; always returns a value the caller can inspect or render. */
export function createAocPMFreakGovernanceIntakeError(code: AocPMFreakGovernanceIntakeErrorCode, message: string, details?: Record<string, unknown>): AocPMFreakGovernanceIntakeError {
  return {
    code,
    message,
    safe: true,
    ...(details !== undefined ? { details } : {}),
  };
}
