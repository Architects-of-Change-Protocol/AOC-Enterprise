import { AOC_PMFREAK_READ_ONLY_CONNECTOR_CAPABILITIES } from './pmfreak-read-only-connector-constants.js';
import type { AocPMFreakReadOnlyConnectorConfig } from './pmfreak-read-only-connector-config.js';
import type { AocPMFreakReadOnlyConnectorSourceKind } from './pmfreak-read-only-connector-types.js';

export type AocPMFreakConnectorHealthStatus = 'healthy' | 'degraded' | 'unavailable';

export interface AocPMFreakConnectorHealth {
  readonly connectorId: string;
  readonly sourceKind: AocPMFreakReadOnlyConnectorSourceKind;
  readonly status: AocPMFreakConnectorHealthStatus;
  readonly readOnly: true;
  readonly allowMutations: false;
  readonly checkedCapabilities: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface CreateAocPMFreakConnectorHealthInput {
  readonly config: AocPMFreakReadOnlyConnectorConfig;
  readonly warnings?: readonly string[];
  readonly errors?: readonly string[];
  readonly checkedCapabilities?: readonly string[];
}

/**
 * Derives connector health deterministically from `warnings`/`errors`:
 * any error makes the connector `unavailable`, any warning (with no error)
 * makes it `degraded`, otherwise it is `healthy`. This helper never makes a
 * network call itself -- a real source adapter that supports a safe
 * read-only health check is responsible for populating `warnings`/`errors`
 * before calling this function.
 */
export function createAocPMFreakConnectorHealth(input: CreateAocPMFreakConnectorHealthInput): AocPMFreakConnectorHealth {
  const warnings = [...(input.warnings ?? [])];
  const errors = [...(input.errors ?? [])];

  const status: AocPMFreakConnectorHealthStatus = errors.length > 0 ? 'unavailable' : warnings.length > 0 ? 'degraded' : 'healthy';

  return {
    connectorId: input.config.connectorId,
    sourceKind: input.config.sourceKind,
    status,
    readOnly: true,
    allowMutations: false,
    checkedCapabilities: input.checkedCapabilities ? [...input.checkedCapabilities] : Object.values(AOC_PMFREAK_READ_ONLY_CONNECTOR_CAPABILITIES),
    warnings,
    errors,
  };
}
