import { AOC_PMFREAK_FORBIDDEN_CONNECTOR_OPERATIONS } from './pmfreak-read-only-connector-constants.js';
import { createAocPMFreakConnectorError } from './pmfreak-connector-errors.js';

const FORBIDDEN_OPERATIONS: ReadonlySet<string> = new Set(AOC_PMFREAK_FORBIDDEN_CONNECTOR_OPERATIONS);

/**
 * Returns whether `operationName` is one of this connector's forbidden
 * (mutating, communicating, or executing) operations. This is a guardrail
 * lookup only -- it does not implement any of the listed operations.
 */
export function isAocPMFreakForbiddenConnectorOperation(operationName: string): boolean {
  return FORBIDDEN_OPERATIONS.has(operationName);
}

/**
 * Throws a `mutation_not_allowed` connector error if `operationName` is
 * forbidden; otherwise returns without effect. Intended to be called at the
 * top of any code path that might otherwise be tempted to perform a
 * PMFreak write, communication, or execution -- this connector has none of
 * those, so every call site should be unreachable in practice.
 */
export function assertAocPMFreakReadOnlyOperation(operationName: string): void {
  if (isAocPMFreakForbiddenConnectorOperation(operationName)) {
    throw createAocPMFreakConnectorError('mutation_not_allowed', `PMFreak read-only connector operation "${operationName}" is not allowed: this connector is read-only.`, { operationName });
  }
}
